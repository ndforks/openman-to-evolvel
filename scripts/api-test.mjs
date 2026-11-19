// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// End-to-end test of the public developer API (/api/v1) and outgoing webhooks against the dev server on :3001.
//
//   node scripts/api-test.mjs                 (full run, includes one real agent task on the dev computer)
//   node scripts/api-test.mjs --no-agent      (skips the real task)
//   API_TEST_RECORD=/path/out.json node scripts/api-test.mjs   (also saves every request/response, secrets masked)
//
// What it does:
// - Creates API keys directly in the database (SHA-256 hash, same as Settings → Developers): one for a throwaway user,
//   one for the dev user. Only the dev user reaches the dev agent computer (the env Hermes setup), so the real task
//   runs as "dev"; the throwaway user's tasks fail at once ("computer not set up"), which exercises task.failed.
// - Starts a local HTTP receiver, registers it as a webhook endpoint, and checks every delivery's HMAC-SHA256
//   signature (`Webhook-Signature: v1=hex(hmac(secret, "<Webhook-Timestamp>.<body>"))`) and timestamp freshness.
// - Cleans up everything it created (tasks, projects, automations, endpoints and their deliveries, keys, rows).
// Never prints a secret.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

loadEnv();
const APP = (process.env.TEST_APP_URL || process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const AGENT = !process.argv.includes("--no-agent");
const RECORD = process.env.API_TEST_RECORD || "";
const USER = `test-api-${Date.now()}`;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { "x-om-secret": process.env.APP_DB_SECRET } },
});

let failures = 0;
let passes = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && extra ? `  -- ${String(extra).slice(0, 400)}` : ""}`);
  if (cond) passes++;
  else failures++;
  return cond;
};
const note = (msg) => console.log(`      ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20_000, step = 500) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

/* ------------------------------------------------------------------ recording (secrets masked) */

const recorded = [];
const SECRETS = new Set();
const mask = (s) => {
  let out = s;
  for (const sec of SECRETS) out = out.split(sec).join(sec.startsWith("whsec_") ? "whsec_••••" : "om_••••");
  return out.replace(/whsec_[A-Za-z0-9_-]{16,}/g, "whsec_••••").replace(/om_[A-Za-z0-9_-]{20,}/g, "om_••••");
};
function record(name, entry) {
  if (!RECORD) return;
  recorded.push(JSON.parse(mask(JSON.stringify({ name, ...entry }))));
}

/* ------------------------------------------------------------------ keys */

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const created = { keys: [], tasks: [], projects: [], automations: [], endpoints: [] };

async function makeKey(userId, name) {
  const secret = `om_${randomBytes(24).toString("base64url")}`;
  SECRETS.add(secret);
  const { data, error } = await sb.from("api_keys").insert({ user_id: userId, name, prefix: `${secret.slice(0, 9)}…`, key_hash: sha256(secret) }).select("id").single();
  if (error) throw new Error(`could not create a key: ${error.message}`);
  created.keys.push(data.id);
  return { id: data.id, secret, userId };
}

/* ------------------------------------------------------------------ HTTP */

async function call(key, method, path, body, { headers = {}, name, raw = false } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key.secret}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(`${APP}/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _text: text.slice(0, 300) };
  }
  if (name) record(name, { request: { method, path: `/api/v1${path}`, ...(body !== undefined ? { body } : {}), ...(Object.keys(headers).length ? { headers } : {}) }, status: res.status, response: json, rateLimit: { limit: res.headers.get("x-ratelimit-limit"), remaining: res.headers.get("x-ratelimit-remaining"), reset: res.headers.get("x-ratelimit-reset") } });
  return { status: res.status, json, headers: res.headers };
}

/* ------------------------------------------------------------------ webhook receiver */

const received = [];
const secrets = new Map(); // endpoint id -> signing secret
const receiver = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      // Recorded as unparsable.
    }
    received.push({ path: req.url, headers: req.headers, body, payload, at: Date.now() });
    // The first delivery to /flaky fails, to exercise the retry.
    if (req.url === "/flaky" && received.filter((r) => r.path === "/flaky").length === 1) {
      res.writeHead(500).end("try again");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"received":true}');
  });
});
await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
const RECV = `http://127.0.0.1:${receiver.address().port}`;

/** The verification a receiver should do (same code as the docs). */
function verify(secret, headers, body, toleranceS = 300) {
  const ts = Number(headers["webhook-timestamp"]);
  const sig = String(headers["webhook-signature"] ?? "");
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceS) return false;
  const expected = `v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const deliveriesFor = (pred) => received.filter((r) => r.payload && pred(r.payload, r));
async function cronPass() {
  const res = await fetch(`${APP}/api/v1/cron/webhooks`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(120_000) });
  return res.json().catch(() => ({}));
}

/* ------------------------------------------------------------------ tests */

async function authTests(tkey) {
  console.log("\n# Authentication and errors");
  let r = await call(null, "GET", "/me", undefined, { name: "auth.missing" });
  ok(r.status === 401 && r.json?.error?.code === "missing_api_key" && r.json.ok === false && r.json.request_id, "no key -> 401 missing_api_key with envelope");
  r = await call(null, "GET", "/me", undefined, { headers: { Authorization: "Token abc" } });
  ok(r.status === 401 && r.json?.error?.code === "malformed_authorization", "malformed header -> 401 malformed_authorization");
  r = await call({ secret: `om_${randomBytes(24).toString("base64url")}` }, "GET", "/me", undefined, { name: "auth.invalid" });
  ok(r.status === 401 && r.json?.error?.code === "invalid_api_key", "unknown key -> 401 invalid_api_key");
  r = await call(tkey, "GET", "/me", undefined, { name: "me" });
  ok(r.status === 200 && r.json.ok && r.json.data.id === USER && r.json.data.api_key.id === tkey.id, "GET /me resolves the key to its user");
  ok(r.headers.get("x-ratelimit-limit") && r.headers.get("x-ratelimit-remaining") && r.headers.get("x-ratelimit-reset") && r.headers.get("x-request-id"), "rate-limit and request-id headers present");
  ok(r.json.data.orgo_connected === false, "throwaway user reports orgo_connected: false");
  const { data: row } = await sb.from("api_keys").select("last_used_at").eq("id", tkey.id).single();
  ok(!!row?.last_used_at || !!(await until(async () => (await sb.from("api_keys").select("last_used_at").eq("id", tkey.id).single()).data?.last_used_at, 5000)), "last_used_at recorded on the key");
  r = await call(tkey, "GET", "/usage", undefined, { name: "usage.not_connected" });
  ok(r.status === 403 && r.json.error.type === "permission_denied", "GET /usage without an Orgo connection -> 403 permission_denied", JSON.stringify(r.json));
  r = await call(tkey, "GET", "/tasks/doesnotexist123", undefined, { name: "error.not_found" });
  ok(r.status === 404 && r.json.error.type === "not_found", "unknown task -> 404 not_found");
  r = await call(tkey, "POST", "/tasks", { mode: "standard" }, { name: "error.invalid" });
  ok(r.status === 400 && r.json.error.code === "invalid_parameter" && r.json.error.param === "prompt", "missing prompt -> 400 invalid_parameter (param: prompt)");
  r = await call(tkey, "POST", "/tasks", "{not json");
  ok(r.status === 400 && r.json.error.code === "invalid_json", "bad JSON -> 400 invalid_json");
  r = await call(tkey, "POST", "/tasks", { prompt: "x", mode: "turbo" });
  ok(r.status === 400 && r.json.error.param === "mode", "unknown mode -> 400 (param: mode)");
  r = await call(tkey, "POST", "/tasks", { prompt: "x", output_schema: { type: "nonsense-type" } }, { name: "error.output_schema" });
  ok(r.status === 400 && r.json.error.code === "invalid_output_schema", "unusable output_schema -> 400 invalid_output_schema", JSON.stringify(r.json));
}

async function projectTests(tkey) {
  console.log("\n# Projects (CRUD, idempotency, pagination)");
  const idem = `idem-${randomBytes(6).toString("hex")}`;
  const body = { name: "API test project", instructions: "Answer briefly." };
  let r = await call(tkey, "POST", "/projects", body, { headers: { "Idempotency-Key": idem }, name: "projects.create" });
  ok(r.status === 201 && r.json.data.object === "project" && r.json.data.name === body.name, "POST /projects -> 201");
  const pid = r.json.data?.id;
  if (pid) created.projects.push(pid);
  r = await call(tkey, "POST", "/projects", body, { headers: { "Idempotency-Key": idem }, name: "projects.create.replay" });
  ok(r.status === 201 && r.json.data.id === pid && r.headers.get("idempotent-replayed") === "true", "same Idempotency-Key + body -> replayed, same id");
  r = await call(tkey, "POST", "/projects", { ...body, name: "Other" }, { headers: { "Idempotency-Key": idem }, name: "projects.create.mismatch" });
  ok(r.status === 422 && r.json.error.code === "idempotency_key_reused", "same key, different body -> 422 idempotency_key_reused");
  const r2 = await call(tkey, "POST", "/projects", { name: "API test project 2" });
  if (r2.json.data?.id) created.projects.push(r2.json.data.id);
  r = await call(tkey, "GET", "/projects?limit=1", undefined, { name: "projects.list" });
  ok(r.status === 200 && r.json.data.length === 1 && r.json.has_more === true && r.json.next_cursor, "GET /projects?limit=1 -> one item, has_more, next_cursor");
  const r3 = await call(tkey, "GET", `/projects?limit=1&cursor=${r.json.next_cursor}`);
  ok(r3.status === 200 && r3.json.data.length === 1 && r3.json.data[0].id !== r.json.data[0].id, "cursor returns the next page");
  r = await call(tkey, "GET", `/projects/${pid}`, undefined, { name: "projects.get" });
  ok(r.status === 200 && r.json.data.id === pid, "GET /projects/{id}");
  r = await call(tkey, "PATCH", `/projects/${pid}`, { name: "Renamed project", pinned: true }, { name: "projects.update" });
  ok(r.status === 200 && r.json.data.name === "Renamed project" && r.json.data.pinned === true, "PATCH /projects/{id}");
  r = await call(tkey, "PATCH", `/projects/${pid}`, { colour: "red" });
  ok(r.status === 400, "PATCH with an unknown field -> 400");
  r = await call(tkey, "DELETE", `/projects/${r2.json.data.id}`, undefined, { name: "projects.delete" });
  ok(r.status === 200 && r.json.data.deleted === true, "DELETE /projects/{id}");
  created.projects = created.projects.filter((id) => id !== r2.json.data.id);
  r = await call(tkey, "GET", `/projects/${r2.json.data.id}`);
  ok(r.status === 404, "deleted project -> 404");
  return pid;
}

async function webhookSetup(key, path, events, label) {
  const r = await call(key, "POST", "/webhooks", { url: `${RECV}${path}`, events }, { name: label ? `webhooks.create` : undefined });
  ok(r.status === 201 && r.json.data.secret?.startsWith("whsec_") && r.json.data.object === "webhook_endpoint", `POST /webhooks (${path}) -> 201 with a signing secret once`, JSON.stringify(r.json));
  if (r.json.data?.id) {
    created.endpoints.push({ id: r.json.data.id, key });
    SECRETS.add(r.json.data.secret);
    secrets.set(r.json.data.id, r.json.data.secret);
  }
  return r.json.data;
}

async function webhookTests(tkey) {
  console.log("\n# Webhook endpoints, ping, signature, retries");
  let r = await call(tkey, "POST", "/webhooks", { url: "ftp://example.com/x" });
  ok(r.status === 400 && r.json.error.code === "invalid_url", "non-http URL refused");
  const ep = await webhookSetup(tkey, "/throwaway", ["*"], true);
  r = await call(tkey, "GET", "/webhooks", undefined, { name: "webhooks.list" });
  ok(r.status === 200 && r.json.data.some((e) => e.id === ep.id) && !JSON.stringify(r.json).includes("whsec_"), "GET /webhooks lists it without the secret");
  r = await call(tkey, "GET", `/webhooks/${ep.id}`, undefined, { name: "webhooks.get" });
  ok(r.status === 200 && r.json.data.url === `${RECV}/throwaway`, "GET /webhooks/{id}");
  r = await call(tkey, "PATCH", `/webhooks/${ep.id}`, { roll_secret: true }, { name: "webhooks.roll" });
  ok(r.status === 200 && r.json.data.secret?.startsWith("whsec_") && r.json.data.secret !== ep.secret, "PATCH roll_secret returns a new secret");
  if (r.json.data?.secret) {
    SECRETS.add(r.json.data.secret);
    secrets.set(ep.id, r.json.data.secret);
  }
  r = await call(tkey, "POST", `/webhooks/${ep.id}/test`, undefined, { name: "webhooks.test" });
  ok(r.status === 202 && r.json.data.queued === true, "POST /webhooks/{id}/test -> 202 queued");
  const ping = await until(() => deliveriesFor((p, d) => p.type === "ping" && d.path === "/throwaway")[0], 15_000);
  ok(!!ping, "receiver got the ping");
  if (ping) {
    ok(verify(secrets.get(ep.id), ping.headers, ping.body), "ping signature verifies with the rolled secret (HMAC-SHA256 over timestamp.body)");
    ok(!verify(ep.secret, ping.headers, ping.body), "the old secret no longer verifies");
    ok(!verify(secrets.get(ep.id), { ...ping.headers, "webhook-timestamp": String(Number(ping.headers["webhook-timestamp"]) - 3600) }, ping.body), "a replayed timestamp outside 5 minutes is rejected");
    ok(ping.headers["webhook-id"] === ping.payload.id && ping.headers["webhook-event"] === "ping", "Webhook-Id and Webhook-Event headers match the payload");
    record("webhook.ping.received", { headers: { "webhook-id": ping.headers["webhook-id"], "webhook-timestamp": ping.headers["webhook-timestamp"], "webhook-signature": "v1=…", "webhook-event": ping.headers["webhook-event"] }, body: ping.payload });
  }
  // Retries: an endpoint whose first answer is a 500.
  const flaky = await webhookSetup(tkey, "/flaky", ["task.deleted"]);
  await call(tkey, "POST", `/webhooks/${flaky.id}/test`);
  const failed = await until(async () => {
    const d = await call(tkey, "GET", `/webhooks/${flaky.id}/deliveries`);
    return d.json.data?.find((x) => x.status === "pending" && x.attempts === 1 && x.last_status_code === 500) ? d : null;
  }, 15_000);
  ok(!!failed, "a 500 answer leaves the delivery pending with attempts=1, last_status_code=500 and a next_attempt_at");
  if (failed) {
    const d = failed.json.data[0];
    const wait = Date.parse(d.next_attempt_at) - Date.now();
    ok(wait > 3_000 && wait < 15_000, `first retry is scheduled ~10 s later (backoff), got ${Math.round(wait / 1000)} s`);
    await sleep(Math.max(0, wait) + 500);
    await cronPass();
    const done = await until(async () => {
      const x = await call(tkey, "GET", `/webhooks/${flaky.id}/deliveries`, undefined, { name: "webhooks.deliveries" });
      return x.json.data?.find((y) => y.status === "delivered" && y.attempts === 2) ? x : null;
    }, 20_000);
    ok(!!done, "the retry is delivered on attempt 2");
  }
  return ep;
}

async function throwawayTaskTests(tkey, projectId) {
  console.log("\n# Tasks as the throwaway user (no computer: runs fail at once)");
  let r = await call(tkey, "POST", "/tasks", { prompt: "Say hello", mode: "lite", project_id: projectId, attachments: [{ url: "https://example.com/brief.pdf" }] }, { headers: { "Idempotency-Key": `t-${randomBytes(4).toString("hex")}` }, name: "tasks.create.failing" });
  ok(r.status === 201 && r.json.data.object === "task" && r.json.data.source === "api" && r.json.data.project_id === projectId, "POST /tasks -> 201 (source api, project set)", JSON.stringify(r.json));
  const id = r.json.data?.id;
  if (!id) return;
  created.tasks.push({ id, key: tkey });
  const t = await until(async () => {
    const x = await call(tkey, "GET", `/tasks/${id}`);
    return ["failed", "stopped", "completed"].includes(x.json.data?.status) ? x : null;
  }, 30_000);
  ok(t?.json.data.status === "failed", "the run fails (no agent computer) -> status failed", JSON.stringify(t?.json));
  record("tasks.get.failed", { request: { method: "GET", path: `/api/v1/tasks/${id}` }, status: t?.status, response: t?.json });
  await cronPass();
  const createdHook = await until(() => deliveriesFor((p, d) => d.path === "/throwaway" && p.type === "task.created" && p.data?.task?.id === id)[0], 20_000);
  ok(createdHook && verify(secrets.get(created.endpoints.find((e) => e.key === tkey).id), createdHook.headers, createdHook.body), "task.created webhook delivered and signed");
  const failedHook = await until(async () => (await cronPass(), deliveriesFor((p, d) => d.path === "/throwaway" && p.type === "task.failed" && p.data?.task?.id === id)[0]), 30_000, 2000);
  ok(!!failedHook && failedHook.payload.data.error?.message, "task.failed webhook delivered (from the event log) with the error", failedHook ? "" : "none");
  if (failedHook) record("webhook.task.failed.received", { body: failedHook.payload });

  r = await call(tkey, "GET", `/tasks/${id}/events?after=0&limit=2`, undefined, { name: "tasks.events" });
  ok(r.status === 200 && r.json.data.length === 2 && r.json.data[0].seq === 1 && r.json.has_more === true && r.json.next_cursor === "2", "GET /events?after=0&limit=2 -> seq 1..2, next_cursor 2");
  const r2 = await call(tkey, "GET", `/tasks/${id}/events?after=${r.json.next_cursor}`);
  ok(r2.status === 200 && r2.json.data.every((e) => e.seq > 2), "events after=2 continue from seq 3");
  r = await call(tkey, "GET", `/tasks/${id}/messages`, undefined, { name: "tasks.messages" });
  ok(r.status === 200 && r.json.data[0]?.role === "user" && r.json.data[0].text.includes("Say hello"), "GET /messages lists the prompt as the first user message");
  r = await call(tkey, "PATCH", `/tasks/${id}`, { title: "Renamed by API", favorite: true }, { name: "tasks.update" });
  ok(r.status === 200 && r.json.data.title === "Renamed by API" && r.json.data.favorite === true, "PATCH /tasks/{id}");
  r = await call(tkey, "POST", `/tasks/${id}/messages`, { text: "Try again", mode: "queue" }, { name: "tasks.send" });
  ok(r.status === 202 && r.json.data.accepted === true, "POST /messages -> 202 accepted");
  await sleep(1500);
  r = await call(tkey, "POST", `/tasks/${id}/stop`, undefined, { name: "tasks.stop" });
  ok(r.status === 200 && ["failed", "stopped"].includes(r.json.data.status), "POST /stop -> task at rest", JSON.stringify(r.json));
  r = await call(tkey, "POST", `/tasks/${id}/respond`, { request_id: "nothing-pending", answer: "yes" }, { name: "tasks.respond.conflict" });
  ok(r.status === 409 && r.json.error.code === "request_not_pending", "POST /respond with nothing pending -> 409 request_not_pending");
  r = await call(tkey, "GET", `/tasks/${id}/files`, undefined, { name: "tasks.files.empty" });
  ok(r.status === 200 && Array.isArray(r.json.data), "GET /files");
  r = await call(tkey, "GET", `/tasks/${id}/artifacts`);
  ok(r.status === 200 && Array.isArray(r.json.data), "GET /artifacts");
  r = await call(tkey, "GET", `/tasks?limit=1&status=failed`, undefined, { name: "tasks.list" });
  ok(r.status === 200 && r.json.data[0]?.id === id, "GET /tasks?status=failed&limit=1");
  r = await call(tkey, "GET", `/tasks?status=bogus`);
  ok(r.status === 400 && r.json.error.param === "status", "GET /tasks?status=bogus -> 400");
  // SSE on a finished task: replays and ends.
  const res = await call(tkey, "GET", `/tasks/${id}/stream?after=0`, undefined, { raw: true });
  const text = await res.text();
  ok(res.headers.get("content-type")?.startsWith("text/event-stream") && /event: status/.test(text) && /event: end/.test(text), "GET /stream replays events then sends event: end");
  r = await call(tkey, "DELETE", `/tasks/${id}`, undefined, { name: "tasks.delete" });
  ok(r.status === 200 && r.json.data.deleted === true, "DELETE /tasks/{id}");
  created.tasks = created.tasks.filter((x) => x.id !== id);
  const del = await until(() => deliveriesFor((p, d) => d.path === "/throwaway" && p.type === "task.deleted" && p.data?.task?.id === id)[0], 15_000);
  ok(!!del, "task.deleted webhook delivered");
  r = await call(tkey, "GET", `/tasks/${id}`);
  ok(r.status === 404, "deleted task -> 404");
}

async function otherResourceTests(tkey) {
  console.log("\n# Automations, websites, skills, connectors (throwaway user)");
  let r = await call(tkey, "POST", "/automations", { name: "API test automation", prompt: "Summarise the news", repeat: { freq: "daily", time: "09:00" }, timezone: "UTC", enabled: false }, { name: "automations.create" });
  ok(r.status === 201 && r.json.data.object === "automation" && r.json.data.enabled === false, "POST /automations -> 201", JSON.stringify(r.json));
  const aid = r.json.data?.id;
  if (aid) created.automations.push({ id: aid, key: tkey });
  r = await call(tkey, "GET", "/automations", undefined, { name: "automations.list" });
  ok(r.status === 200 && r.json.data.some((a) => a.id === aid), "GET /automations");
  r = await call(tkey, "GET", `/automations/${aid}`, undefined, { name: "automations.get" });
  ok(r.status === 200 && r.json.data.describe, "GET /automations/{id}");
  r = await call(tkey, "PATCH", `/automations/${aid}`, { name: "Renamed automation", repeat: { freq: "weekly", days: [1], time: "08:30" } }, { name: "automations.update" });
  ok(r.status === 200 && r.json.data.name === "Renamed automation" && r.json.data.repeat?.freq === "weekly", "PATCH /automations/{id} merges fields", JSON.stringify(r.json));
  r = await call(tkey, "POST", `/automations/${aid}/run`, undefined, { name: "automations.run" });
  // The throwaway user has no computer, so the run is recorded as failed with the reason.
  ok(r.status === 202 && r.json.data.object === "automation_run" && (r.json.data.task_id || (r.json.data.status === "failed" && r.json.data.error)), "POST /automations/{id}/run -> 202 with the run (failed: no computer)", JSON.stringify(r.json));
  if (r.json.data?.task_id) created.tasks.push({ id: r.json.data.task_id, key: tkey });
  r = await call(tkey, "GET", "/websites", undefined, { name: "websites.list.empty" });
  ok(r.status === 200 && Array.isArray(r.json.data), "GET /websites");
  r = await call(tkey, "GET", "/websites/nope12345");
  ok(r.status === 404, "GET /websites/{unknown} -> 404");
  r = await call(tkey, "POST", "/websites/nope12345/publish");
  ok(r.status === 404, "POST /websites/{unknown}/publish -> 404");
  r = await call(tkey, "GET", "/skills");
  ok([403, 409].includes(r.status) && r.json.ok === false, `GET /skills without a computer -> ${r.status} ${r.json.error?.type}/${r.json.error?.code}`);
  r = await call(tkey, "GET", "/connectors");
  ok(r.status === 403 && r.json.error.type === "permission_denied", "GET /connectors without an Orgo connection -> 403");
}

async function devTests(dkey) {
  console.log("\n# Dev user: account data and one real task on the dev computer");
  let r = await call(dkey, "GET", "/me", undefined, { name: "me.dev" });
  ok(r.status === 200 && r.json.data.id === "dev" && r.json.data.orgo_connected === true, "GET /me as dev (Orgo connected)");
  r = await call(dkey, "GET", "/usage?days=7", undefined, { name: "usage" });
  ok(r.status === 200 && r.json.data.object === "usage" && r.json.data.period_days === 7, `GET /usage?days=7 (available: ${r.json.data?.available}, balance known: ${r.json.data?.balance_cents !== null})`, JSON.stringify(r.json));
  r = await call(dkey, "GET", "/skills?limit=3", undefined, { name: "skills.list" });
  ok(r.status === 200 && Array.isArray(r.json.data), `GET /skills (${r.json.data?.length ?? 0} on the first page)`, JSON.stringify(r.json).slice(0, 300));
  r = await call(dkey, "GET", "/connectors?limit=3", undefined, { name: "connectors.list" });
  ok(r.status === 200 && Array.isArray(r.json.data), "GET /connectors", JSON.stringify(r.json).slice(0, 300));
  r = await call(dkey, "GET", "/websites?limit=2", undefined, { name: "websites.list" });
  ok(r.status === 200, `GET /websites as dev (${r.json.data?.length ?? 0} sites)`);
  if (r.json.data?.[0]) {
    const s = await call(dkey, "GET", `/websites/${r.json.data[0].id}?sync=false`, undefined, { name: "websites.get" });
    ok(s.status === 200 && s.json.data.object === "website", "GET /websites/{id}?sync=false");
  }
  if (!AGENT) return;

  const ep = await webhookSetup(dkey, "/dev", ["task.created", "task.completed", "task.failed"]);
  const schema = { type: "object", properties: { word: { type: "string" }, number: { type: "number" } }, required: ["word", "number"], additionalProperties: false };
  r = await call(dkey, "POST", "/tasks", { prompt: "Reply with the word PONG and the number 42, in one short sentence. Do not use any tools.", mode: "lite", output_schema: schema }, { headers: { "Idempotency-Key": `dev-${randomBytes(4).toString("hex")}` }, name: "tasks.create" });
  ok(r.status === 201 && r.json.data.structured_output?.status === "pending", "POST /tasks with output_schema -> 201, structured_output pending", JSON.stringify(r.json));
  const id = r.json.data?.id;
  if (!id) return;
  created.tasks.push({ id, key: dkey });

  // Live stream until the first run ends.
  const started = Date.now();
  const res = await call(dkey, "GET", `/tasks/${id}/stream`, undefined, { raw: true });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let sse = "";
  const types = new Set();
  const streamEnd = Date.now() + 240_000;
  while (Date.now() < streamEnd) {
    const { value, done } = await Promise.race([reader.read(), sleep(30_000).then(() => ({ value: undefined, done: false }))]);
    if (done) break;
    if (value) sse += dec.decode(value, { stream: true });
    for (const m of sse.matchAll(/^event: ([a-z.]+)$/gm)) types.add(m[1]);
    if (/event: end/.test(sse)) break;
  }
  await reader.cancel().catch(() => undefined);
  ok(types.has("status") && types.has("message.completed") && /event: end/.test(sse), `SSE stream delivered live events and ended (${[...types].join(", ")}) in ${Math.round((Date.now() - started) / 1000)} s`);
  record("tasks.stream.sample", { request: { method: "GET", path: `/api/v1/tasks/${id}/stream` }, response_excerpt: sse.split("\n\n").filter((f) => /event: (status|message.completed|end)/.test(f)).slice(0, 4).join("\n\n") });

  // Structured output: the extra step runs after the first completion.
  const done = await until(
    async () => {
      await cronPass();
      const x = await call(dkey, "GET", `/tasks/${id}`);
      const so = x.json.data?.structured_output;
      return so && so.status !== "pending" && ["completed", "failed", "stopped"].includes(x.json.data.status) ? x : null;
    },
    300_000,
    4000,
  );
  record("tasks.get.structured", { request: { method: "GET", path: `/api/v1/tasks/${id}` }, status: done?.status, response: done?.json });
  const so = done?.json.data.structured_output;
  ok(so?.status === "ready" && typeof so.value?.word === "string" && so.value.number === 42, "structured_output is ready and validates against the schema", JSON.stringify(done?.json ?? "timed out"));
  const hook = await until(async () => (await cronPass(), deliveriesFor((p, d) => d.path === "/dev" && p.type === "task.completed" && p.data?.task?.id === id)[0]), 60_000, 2000);
  ok(!!hook && verify(secrets.get(ep.id), hook.headers, hook.body), "task.completed webhook delivered to the dev endpoint and signature verifies");
  ok(hook?.payload.data.task.structured_output?.value?.number === 42, "task.completed carries the structured output");
  ok(deliveriesFor((p, d) => d.path === "/dev" && p.type === "task.completed" && p.data?.task?.id === id).length === 1, "exactly one task.completed for the task (the first completion is held for the structured step)");
  if (hook) record("webhook.task.completed.received", { headers: { "webhook-id": hook.headers["webhook-id"], "webhook-timestamp": hook.headers["webhook-timestamp"], "webhook-signature": "v1=…" }, body: hook.payload });
  const createdHook = deliveriesFor((p, d) => d.path === "/dev" && p.type === "task.created" && p.data?.task?.id === id)[0];
  ok(!!createdHook, "task.created webhook delivered to the dev endpoint");

  r = await call(dkey, "GET", `/tasks/${id}/messages`, undefined, { name: "tasks.messages.dev" });
  ok(r.status === 200 && r.json.data.some((m) => m.role === "assistant"), "GET /messages has the assistant's answer");
  r = await call(dkey, "GET", `/tasks/${id}/artifacts`, undefined, { name: "tasks.artifacts" });
  ok(r.status === 200 && r.json.data.some((a) => a.type === "message") && r.json.data.some((a) => a.type === "json" && a.value?.number === 42), "GET /artifacts has the final message and the JSON");
  r = await call(dkey, "GET", `/tasks/${id}/events?types=status,message.completed`, undefined, { name: "tasks.events.filtered" });
  ok(r.status === 200 && r.json.data.every((e) => e.type === "status" || e.type === "message.completed"), "GET /events?types= filters");
  r = await call(dkey, "GET", `/tasks/${id}/files`, undefined, { name: "tasks.files" });
  ok(r.status === 200, `GET /files (${r.json.data?.length ?? 0} files)`);
  if (r.json.data?.[0]) {
    const f = await call(dkey, "GET", `/tasks/${id}/files/${encodeURIComponent(r.json.data[0].id)}`, undefined, { raw: true });
    ok(f.status === 200 && /attachment/.test(f.headers.get("content-disposition") ?? ""), "GET /files/{fileId} downloads");
  }
  const d = await call(dkey, "GET", `/webhooks/${ep.id}/deliveries?limit=5`, undefined, { name: "webhooks.deliveries.dev" });
  ok(d.status === 200 && d.json.data.some((x) => x.status === "delivered"), "GET /webhooks/{id}/deliveries shows delivered events");
}

async function rateLimitTest(tkey) {
  console.log("\n# Rate limit (per key, fixed one-minute window)");
  const first = await call(tkey, "GET", "/projects?limit=1");
  const limit = Number(first.headers.get("x-ratelimit-limit"));
  const remaining = Number(first.headers.get("x-ratelimit-remaining"));
  ok(limit > 0 && remaining < limit, `limit ${limit}/min, remaining ${remaining}`);
  let hit = null;
  for (let sent = 0; sent < remaining + 30 && !hit; sent += 20) {
    const batch = await Promise.all(Array.from({ length: 20 }, () => call(tkey, "GET", "/projects?limit=1")));
    hit = batch.find((x) => x.status === 429) ?? null;
  }
  ok(!!hit && hit.json.error.type === "rate_limited" && Number(hit.headers.get("retry-after")) > 0 && hit.headers.get("x-ratelimit-remaining") === "0", "over the limit -> 429 rate_limited with Retry-After and X-RateLimit-Remaining: 0");
  if (hit) record("error.rate_limited", { status: 429, response: hit.json, headers: { "retry-after": hit.headers.get("retry-after"), "x-ratelimit-limit": hit.headers.get("x-ratelimit-limit"), "x-ratelimit-remaining": hit.headers.get("x-ratelimit-remaining") } });
}

/* ------------------------------------------------------------------ cleanup */

async function cleanup() {
  console.log("\n# Cleanup");
  for (const t of created.tasks) {
    const r = await call(t.key, "DELETE", `/tasks/${t.id}`).catch(() => null);
    if (r?.status !== 200 && r?.status !== 404) note(`task ${t.id}: ${r?.status}`);
  }
  for (const a of created.automations) await call(a.key, "DELETE", `/automations/${a.id}`).catch(() => null);
  for (const e of created.endpoints) await call(e.key, "DELETE", `/webhooks/${e.id}`).catch(() => null);
  if (created.projects.length) await sb.from("projects").delete().eq("user_id", USER).in("id", created.projects);
  // Anything else the throwaway user left behind.
  for (const table of ["tasks", "task_events", "task_files", "automations", "automation_runs", "projects", "webhooks", "webhook_deliveries", "api_tasks", "api_idempotency", "notifications", "settings", "accounts"]) {
    const { error } = await sb.from(table).delete().eq("user_id", USER);
    if (error && !/does not exist|column/.test(error.message)) note(`${table}: ${error.message}`);
  }
  const devTaskIds = created.tasks.filter((t) => t.key.userId === "dev").map((t) => t.id);
  if (devTaskIds.length) await sb.from("api_tasks").delete().in("task_id", devTaskIds);
  await sb.from("api_rate_limits").delete().in("bucket", created.keys.map((k) => `key:${k}`));
  await sb.from("api_keys").delete().in("id", created.keys);
  const { count: keysLeft } = await sb.from("api_keys").select("id", { count: "exact", head: true }).in("id", created.keys);
  const { count: hooksLeft } = await sb.from("webhooks").select("id", { count: "exact", head: true }).in("id", created.endpoints.map((e) => e.id));
  const { count: tasksLeft } = await sb.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", USER);
  ok(keysLeft === 0 && hooksLeft === 0 && tasksLeft === 0, "keys revoked, endpoints and tasks removed");
}

/* ------------------------------------------------------------------ main */

let tkey;
let dkey;
try {
  tkey = await makeKey(USER, "api-test throwaway");
  dkey = await makeKey("dev", "api-test dev (temporary)");
  await authTests(tkey);
  const projectId = await projectTests(tkey);
  await webhookTests(tkey);
  await throwawayTaskTests(tkey, projectId);
  await otherResourceTests(tkey);
  await devTests(dkey);
  await rateLimitTest(tkey);
} catch (err) {
  ok(false, "unexpected error", err instanceof Error ? err.stack : String(err));
} finally {
  await cleanup().catch((err) => ok(false, "cleanup", err instanceof Error ? err.message : String(err)));
  receiver.close();
  if (RECORD) writeFileSync(RECORD, JSON.stringify(recorded, null, 2));
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
