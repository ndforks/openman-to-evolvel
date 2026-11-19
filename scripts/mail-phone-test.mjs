// End-to-end test of agent email (AgentMail) and agent phone (AgentPhone) against the dev server on :3001.
// No real vendor is called: a local fake server stands in for both APIs and records every request, and the
// webhook secrets exist only in this process (handed to the dev server through the dev-only test-config routes,
// which expire on their own and are cleared at the end).
//
//   node scripts/mail-phone-test.mjs            (needs NEXT_PUBLIC_AUTH_DISABLED=1 on the dev server)
//   node scripts/mail-phone-test.mjs --live     the same, then the opt-in live checks against the real vendors
//                                               (scripts/vendors-live-test.mjs; needs the keys in .env.local)
//
// The test override replaces the key, webhook secret and base URL, and also the env-derived AgentMail pod and
// domain and the AgentPhone sub-account, so this test never reaches a real pod or sub-account even when the
// real keys are configured.
//
// Inbound tests run as a throwaway user with no agent computer, so each task is created and its run fails at
// once; the reply (email or SMS) then carries that failure, which is enough to check the outgoing call's shape.
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

loadEnv();
const APP = process.env.TEST_APP_URL || "http://localhost:3001";
const DOMAIN = process.env.AGENTMAIL_DOMAIN || "mail.example.com";
const USER = `test-mailphone-${Date.now()}`;
const AM_SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const AP_SECRET = `whsec_${randomBytes(24).toString("hex")}`;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { "x-om-secret": process.env.APP_DB_SECRET } },
});

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && extra ? `  -- ${extra}` : ""}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20_000, step = 400) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

// ------------------------------------------------------------------ fake vendor server
const seen = [];
let fakeBase = "";
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      json = body;
    }
    seen.push({ method: req.method, path: url.pathname, headers: req.headers, body: json });
    const send = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    const p = url.pathname;
    const now = new Date().toISOString();
    // AgentMail
    if (req.method === "POST" && p === "/v0/pods") return send(200, { pod_id: "pod_test1", name: json?.name ?? "", client_id: json?.client_id, created_at: now, updated_at: now });
    let m;
    if (req.method === "POST" && (m = p.match(/^\/v0\/pods\/([^/]+)\/inboxes$/))) {
      const email = `${json.username}@${json.domain}`;
      return send(200, { pod_id: m[1], inbox_id: email, email, display_name: json.display_name, client_id: json.client_id, created_at: now, updated_at: now });
    }
    if (req.method === "POST" && /^\/v0\/inboxes\/[^/]+\/lists\/receive\/allow$/.test(p)) return send(200, { entry: json.entry, organization_id: "org_1", direction: "receive", list_type: "allow", entry_type: "email", created_at: now, pod_id: "pod_test1" });
    if (req.method === "DELETE" && /^\/v0\/inboxes\/[^/]+$/.test(p)) return send(202, {});
    if (req.method === "DELETE" && /^\/v0\/inboxes\/[^/]+\/lists\//.test(p)) return send(200);
    if (req.method === "GET" && (m = p.match(/^\/v0\/inboxes\/([^/]+)\/messages\/([^/]+)\/attachments\/([^/]+)$/)))
      return send(200, { attachment_id: m[3], filename: "brief.pdf", size: 1234, content_type: "application/pdf", download_url: `${fakeBase}/cdn/${m[3]}?sig=abc`, expires_at: new Date(Date.now() + 3600_000).toISOString() });
    if (req.method === "GET" && (m = p.match(/^\/v0\/inboxes\/([^/]+)\/messages\/([^/]+)$/)))
      return send(200, { inbox_id: decodeURIComponent(m[1]), thread_id: "thd_x", message_id: decodeURIComponent(m[2]), labels: ["received"], timestamp: now, from: "a@b.c", to: [], size: 1, text: "Body fetched from the API.", created_at: now, updated_at: now });
    if (req.method === "GET" && p.startsWith("/body/")) return send(200, { text: "Large body fetched from body_url: summarise the quarterly numbers.", html: "<p>Large body</p>" });
    if (req.method === "POST" && /^\/v0\/inboxes\/[^/]+\/messages\/[^/]+\/reply$/.test(p)) return send(200, { message_id: `<reply-${seen.length}@${DOMAIN}>`, thread_id: "thd_reply" });
    // AgentPhone
    if (req.method === "POST" && p === "/v1/agents") return send(200, { id: "agt_test1", name: json.name, voiceMode: json.voiceMode, createdAt: now, numbers: [] });
    if (req.method === "POST" && p === "/v1/numbers") return send(200, { id: "num_prov1", phoneNumber: "+14155550142", country: "US", status: "active", agentId: json.agentId, outboundSms: "activating", externalId: json.externalId, createdAt: now });
    if (req.method === "DELETE" && /^\/v1\/(numbers|agents)\/[^/]+$/.test(p)) return send(200, {});
    if (req.method === "POST" && p === "/v1/messages") return send(200, { id: `msg_${seen.length}`, status: "sent", channel: "sms", from_number: "+15550100999", to_number: json.to_number, media_urls: [] });
    send(404, { code: "not_found", message: `fake: no route for ${req.method} ${p}` });
  });
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
fakeBase = `http://127.0.0.1:${fake.address().port}`;
const requests = (method, re) => seen.filter((r) => r.method === method && re.test(r.path));

// ------------------------------------------------------------------ helpers
const api = async (method, path, body, headers = {}) => {
  const res = await fetch(`${APP}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
};

function svixHeaders(raw, secret = AM_SECRET, ts = Math.floor(Date.now() / 1000)) {
  const id = `msg_${randomBytes(8).toString("hex")}`;
  const key = Buffer.from(secret.slice(6), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}
function apHeaders(raw, id = `whd_${randomBytes(8).toString("hex")}`, event = "agent.message", secret = AP_SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.`).update(raw).digest("hex");
  return { "X-Webhook-Signature": `sha256=${sig}`, "X-Webhook-Timestamp": ts, "X-Webhook-ID": id, "X-Webhook-Event": event };
}
const postMail = (event, headers) => {
  const raw = JSON.stringify(event);
  return api("POST", "/api/webhooks/agentmail", raw, headers ?? svixHeaders(raw));
};
const postPhone = (event, id, headers) => {
  const raw = JSON.stringify(event);
  return api("POST", "/api/webhooks/agentphone", raw, headers ?? apHeaders(raw, id, event.event));
};

/** A `message.received` event in the documented events_MessageReceivedEvent shape. */
function mailEvent(inbox, { from, subject, text, threadId, messageId, cc, attachments, bodyUrl, type = "message.received" }) {
  const now = new Date().toISOString();
  const message = {
    inbox_id: inbox,
    thread_id: threadId,
    message_id: messageId,
    labels: ["received"],
    timestamp: now,
    from,
    to: [`My Agent <${inbox}>`],
    ...(cc ? { cc } : {}),
    subject,
    preview: (text ?? "").slice(0, 80),
    ...(bodyUrl ? { body_url: bodyUrl, body_expires_at: new Date(Date.now() + 3600_000).toISOString() } : { text, html: `<p>${text}</p>` }),
    ...(attachments ? { attachments } : {}),
    size: 2048,
    updated_at: now,
    created_at: now,
  };
  return {
    type: "event",
    event_type: type,
    event_id: randomBytes(16).toString("hex"),
    message,
    thread: { inbox_id: inbox, thread_id: threadId, labels: ["received"], timestamp: now, senders: [from], recipients: [inbox], subject, preview: message.preview, last_message_id: messageId, message_count: 1, size: 2048, updated_at: now, created_at: now },
  };
}

const INBOX = `inbox-${USER}@${DOMAIN}`;
const NUM_ID = `num_${USER}`;
const OWNER_PHONE = "+15550100001";
let devMailboxIds = [];
let devNumberIds = [];

async function cleanup() {
  await api("DELETE", "/api/mail/test-config").catch(() => null);
  await api("DELETE", "/api/phone/test-config").catch(() => null);
  for (const t of ["mail_messages", "mail_threads", "mail_senders", "mail_ops", "phone_messages", "phone_calls", "mailboxes", "phone_numbers", "tasks"]) await sb.from(t).delete().eq("user_id", USER);
  if (devMailboxIds.length) await sb.from("mailboxes").delete().in("id", devMailboxIds);
  if (devNumberIds.length) await sb.from("phone_numbers").delete().in("id", devNumberIds);
  await sb.from("mail_ops").delete().eq("user_id", "dev").gte("created_at", new Date(START).toISOString());
  await sb.from("mail_senders").delete().eq("user_id", "dev").gte("created_at", new Date(START).toISOString());
  // Usage caps (operator-paid vendors) count this run's inboxes, numbers and texts against the dev user: reset them.
  await sb.from("usage_counters").delete().in("user_id", ["dev", USER]);
}
const START = Date.now();

// A fresh day's caps for the dev user, so repeated runs are not refused by the usage limits (see src/config/usage-limits.ts).
await sb.from("usage_counters").delete().eq("user_id", "dev");
try {
  // ---------------------------------------------------------------- not set up
  const before = await api("GET", "/api/mail");
  ok(before.status === 200 && typeof before.json.configured === "boolean", "GET /api/mail answers with configured flag");
  if (!before.json.configured) ok(/isn't set up/.test(before.json.notice ?? ""), "without a key the UI gets a one-line not-set-up notice");

  // ---------------------------------------------------------------- overrides on
  const o1 = await api("POST", "/api/mail/test-config", { apiKey: "am_test_key", webhookSecret: AM_SECRET, baseUrl: fakeBase, domain: DOMAIN });
  const o2 = await api("POST", "/api/phone/test-config", { apiKey: "sk_test_key", webhookSecret: AP_SECRET, baseUrl: fakeBase, subAccountId: "sub_test1" });
  ok(o1.status === 200 && o2.status === 200, "dev-only test config accepted", JSON.stringify([o1, o2]));
  if (o1.status !== 200) throw new Error("cannot continue without the test config (is NEXT_PUBLIC_AUTH_DISABLED=1?)");

  // ---------------------------------------------------------------- signature checks
  const ev0 = mailEvent(INBOX, { from: "x@y.z", subject: "s", text: "t", threadId: "thd_0", messageId: "<m0@y.z>" });
  const raw0 = JSON.stringify(ev0);
  ok((await postMail(ev0, svixHeaders(raw0, `whsec_${randomBytes(24).toString("base64")}`))).status === 401, "mail webhook: wrong secret -> 401");
  ok((await postMail(ev0, svixHeaders(raw0, AM_SECRET, Math.floor(Date.now() / 1000) - 900))).status === 401, "mail webhook: stale timestamp -> 401");
  ok((await api("POST", "/api/webhooks/agentmail", raw0.replace('"t"', '"tampered"'), svixHeaders(raw0))).status === 401, "mail webhook: tampered body -> 401");
  const sms0 = { event: "agent.message", channel: "sms", timestamp: new Date().toISOString(), agentId: "agt_x", data: { numberId: NUM_ID, from: OWNER_PHONE, to: "+1", message: "hi" } };
  ok((await postPhone(sms0, "x", apHeaders(JSON.stringify(sms0), "x", "agent.message", "whsec_wrong"))).status === 401, "phone webhook: wrong secret -> 401");
  const unknownMail = await postMail(mailEvent(`nobody-${USER}@${DOMAIN}`, { from: "x@y.z", subject: "s", text: "t", threadId: "thd_u", messageId: "<mu@y.z>" }));
  ok(unknownMail.status === 200 && unknownMail.json.outcome === "not_found", "mail webhook: signed event for an unknown inbox -> 200 not_found", JSON.stringify(unknownMail));
  const unknownPhone = await postPhone({ ...sms0, data: { ...sms0.data, numberId: `num_unknown_${USER}` } });
  ok(unknownPhone.status === 200 && unknownPhone.json.outcome === "not_found", "phone webhook: signed event for an unknown number -> 200 not_found", JSON.stringify(unknownPhone));

  // ---------------------------------------------------------------- provisioning (dev user, fake vendor)
  const prov = await api("POST", "/api/mail");
  ok(prov.status === 201 && prov.json.mailbox?.address?.endsWith(`@${DOMAIN}`), "POST /api/mail creates the personal address on the mail domain", JSON.stringify(prov.json));
  if (prov.json.mailbox?.id) devMailboxIds.push(prov.json.mailbox.id);
  const podReq = requests("POST", /^\/v0\/pods$/)[0];
  const inboxReq = requests("POST", /^\/v0\/pods\/pod_test1\/inboxes$/)[0];
  ok(!!podReq && podReq.headers.authorization === "Bearer am_test_key" && podReq.body.client_id === "openman", "pod create: POST /v0/pods with bearer key and the app's one client_id (idempotent)", JSON.stringify(podReq?.body));
  ok(!!inboxReq && inboxReq.body.domain === DOMAIN && /^[a-z0-9-]+-[0-9a-f]{6}$/.test(inboxReq.body.username) && typeof inboxReq.body.client_id === "string", "inbox create: POST /v0/pods/{pod}/inboxes {username, domain, client_id}", JSON.stringify(inboxReq?.body));

  const addS = await api("POST", "/api/mail/senders", { email: "Boss@Example.com" });
  ok(addS.status === 201 && addS.json.senders.includes("boss@example.com"), "approve sender: stored lower-cased");
  const allow = requests("POST", /\/lists\/receive\/allow$/).find((r) => r.body.entry === "boss@example.com");
  ok(!!allow, "approve sender: mirrored to POST /v0/inboxes/{inbox}/lists/receive/allow {entry}");
  const wf = await api("POST", "/api/mail/workflows", { name: "Invoices", prompt: "Extract the invoice total and due date." });
  ok(wf.status === 201 && wf.json.workflow?.defaultPrompt?.startsWith("Extract"), "workflow address created with its default prompt", JSON.stringify(wf.json));
  if (wf.json.workflow?.id) devMailboxIds.push(wf.json.workflow.id);
  const ch = await api("PATCH", "/api/mail/address", { username: `renamed-${Date.now().toString(36)}` });
  ok(ch.status === 200 && ch.json.mailbox?.address?.startsWith("renamed-"), "address change creates a new inbox", JSON.stringify(ch.json));
  ok(requests("DELETE", /^\/v0\/inboxes\/[^/]+$/).length >= 1, "address change deletes the previous inbox");
  const ch2 = await api("PATCH", "/api/mail/address", { username: `again-${Date.now().toString(36)}` });
  ok(ch2.status === 429, "second address change within 7 days is refused", JSON.stringify(ch2));
  const delS = await api("DELETE", "/api/mail/senders?email=boss@example.com");
  ok(delS.status === 200 && requests("DELETE", /\/lists\/receive\/allow\/boss%40example\.com$/).length >= 1, "remove sender: DELETE .../lists/receive/allow/{entry}");
  if (wf.json.workflow?.id) ok((await api("DELETE", `/api/mail/workflows/${wf.json.workflow.id}`)).status === 200, "workflow address deleted");

  const pn = await api("POST", "/api/phone", { country: "US", areaCode: "415", approvedCallers: [OWNER_PHONE] });
  ok(pn.status === 201 && pn.json.number?.number === "+14155550142", "POST /api/phone provisions a number", JSON.stringify(pn.json));
  if (pn.json.number?.id) devNumberIds.push(pn.json.number.id);
  const agentReq = requests("POST", /^\/v1\/agents$/)[0];
  const numReq = requests("POST", /^\/v1\/numbers$/)[0];
  ok(agentReq?.body.voiceMode === "webhook" && agentReq.headers.authorization === "Bearer sk_test_key", "agent create: POST /v1/agents {voiceMode: webhook}");
  ok(agentReq?.headers["x-sub-account-id"] === "sub_test1" && numReq?.headers["x-sub-account-id"] === "sub_test1", "phone calls are scoped to the app's sub-account (X-Sub-Account-Id)");
  ok(numReq?.body.agentId === "agt_test1" && numReq.body.areaCode === "415" && numReq.body.country === "US" && /^om-/.test(numReq.body.externalId), "number create: POST /v1/numbers {country, areaCode, agentId, externalId}", JSON.stringify(numReq?.body));
  if (pn.json.number?.id) {
    const rel = await api("DELETE", `/api/phone/${pn.json.number.id}`);
    ok(rel.status === 200 && requests("DELETE", /^\/v1\/numbers\/num_prov1$/).length === 1, "release: DELETE /v1/numbers/{id}");
  }

  // ---------------------------------------------------------------- inbound mail (throwaway user)
  const { error: mbErr } = await sb.from("mailboxes").insert({ user_id: USER, provider: "agentmail", kind: "personal", address: INBOX, external_id: INBOX, pod_id: "pod_test1" }).select("id").single();
  ok(!mbErr, "seed test mailbox", mbErr?.message);
  await sb.from("mail_senders").insert({ user_id: USER, email: "owner@example.com" });

  const ev1 = mailEvent(INBOX, {
    from: "Owner <owner@example.com>",
    subject: "Plan my week",
    text: "Please plan my week.",
    threadId: "thd_1",
    messageId: "<m1@example.com>",
    cc: ["Colleague <colleague@example.com>"],
    attachments: [{ attachment_id: "att_1", filename: "brief.pdf", size: 1234, content_type: "application/pdf", content_disposition: "attachment" }],
  });
  const r1 = await postMail(ev1);
  ok(r1.status === 200 && r1.json.ok === true && !r1.json.duplicate, "approved sender: webhook acknowledged", JSON.stringify(r1));
  const r1dup = await postMail(ev1);
  ok(r1dup.status === 200 && r1dup.json.duplicate === true, "same event_id again: acknowledged as duplicate");
  const taskRow = await until(async () => (await sb.from("mail_messages").select("*").eq("user_id", USER).eq("message_id", "<m1@example.com>").eq("status", "task")).data?.[0]);
  ok(!!taskRow?.task_id, "approved sender: a task was created and linked to the mail", JSON.stringify(taskRow));
  const { data: tasks } = await sb.from("tasks").select("id,title").eq("user_id", USER);
  ok(tasks?.some((t) => t.id === taskRow?.task_id), "the task belongs to the mailbox owner");
  const { count: dupCount } = await sb.from("mail_messages").select("id", { count: "exact", head: true }).eq("user_id", USER).eq("message_id", "<m1@example.com>").eq("direction", "inbound");
  ok(dupCount === 1, "deduplication: only one inbound record for the repeated event", String(dupCount));
  ok(requests("GET", /\/messages\/%3Cm1%40example\.com%3E\/attachments\/att_1$/).length === 1, "attachment: GET .../attachments/{id} for a signed download_url");
  const { data: ev1events } = await sb.from("task_events").select("seq,type,payload").eq("task_id", taskRow?.task_id ?? "none").order("seq");
  const firstUser = (ev1events ?? []).find((e) => e.type === "user.message");
  ok(!!firstUser, "task event log has the email as the first message");

  const reply = await until(() => requests("POST", /\/v0\/inboxes\/[^/]+\/messages\/%3Cm1%40example\.com%3E\/reply$/)[0], 45_000);
  ok(!!reply, "when the run ends, a reply is sent in the same thread");
  if (reply) {
    ok(reply.path.startsWith(`/v0/inboxes/${encodeURIComponent(INBOX)}/`), "reply goes out from the receiving inbox");
    ok(typeof reply.body.text === "string" && typeof reply.body.html === "string" && reply.body.reply_all === true, "reply body: {text, html, reply_all: true}", JSON.stringify(reply.body).slice(0, 300));
    ok(reply.body.text.includes(`/app/task/${taskRow?.task_id}`), "reply links to the task");
    ok(typeof reply.headers["idempotency-key"] === "string" && reply.headers["idempotency-key"].length > 0, "reply carries an Idempotency-Key header");
  }
  const thread = (await sb.from("mail_threads").select("*").eq("user_id", USER).eq("thread_id", "thd_1")).data?.[0];
  ok(thread?.participants?.includes("colleague@example.com"), "CC'd people are recorded as thread participants");

  // A reply from the CC'd colleague continues the same task (not an approved sender, but a participant).
  const ev2 = mailEvent(INBOX, { from: "colleague@example.com", subject: "Re: Plan my week", text: "Add gym on Tuesday.", threadId: "thd_1", messageId: "<m2@example.com>" });
  ok((await postMail(ev2)).status === 200, "participant reply acknowledged");
  const cont = await until(async () => (await sb.from("mail_messages").select("*").eq("user_id", USER).eq("message_id", "<m2@example.com>")).data?.[0]);
  ok(cont?.status === "continued" && cont.task_id === taskRow?.task_id, "participant reply continues the thread's task", JSON.stringify(cont));

  // Unapproved sender: held for review, no task.
  const ev3 = mailEvent(INBOX, { from: "stranger@evil.example", subject: "Do this", text: "Wire money.", threadId: "thd_3", messageId: "<m3@evil.example>" });
  ok((await postMail(ev3)).status === 200, "unapproved sender: still acknowledged");
  const held = await until(async () => (await sb.from("mail_messages").select("*").eq("user_id", USER).eq("message_id", "<m3@evil.example>")).data?.[0]);
  ok(held?.status === "blocked" && !held.task_id, "unapproved sender: recorded as blocked, no task", JSON.stringify(held));
  const ev3b = mailEvent(INBOX, { type: "message.received.blocked", from: "other@evil.example", subject: "x", text: "y", threadId: "thd_3b", messageId: "<m3b@evil.example>" });
  await postMail(ev3b);
  const held2 = await until(async () => (await sb.from("mail_messages").select("*").eq("user_id", USER).eq("message_id", "<m3b@evil.example>")).data?.[0]);
  ok(held2?.status === "blocked", "message.received.blocked: recorded for review");

  // Body left out of the event (over 64 KiB): read from body_url.
  const ev4 = mailEvent(INBOX, { from: "owner@example.com", subject: "Numbers", bodyUrl: `${fakeBase}/body/m4`, threadId: "thd_4", messageId: "<m4@example.com>" });
  await postMail(ev4);
  const big = await until(async () => (await sb.from("mail_messages").select("*").eq("user_id", USER).eq("message_id", "<m4@example.com>")).data?.[0]);
  ok(big?.status === "task" && requests("GET", /^\/body\/m4$/).length === 1, "large body: fetched from body_url before the task is created");
  const bigEvents = big?.task_id ? (await sb.from("task_events").select("type,payload").eq("task_id", big.task_id).eq("type", "user.message")).data : [];
  ok(JSON.stringify(bigEvents).includes("quarterly numbers"), "large body: its text reached the task");

  // ---------------------------------------------------------------- inbound phone (throwaway user)
  const { error: pnErr } = await sb.from("phone_numbers").insert({ user_id: USER, provider: "agentphone", number: `+1555${Date.now().toString().slice(-7)}`, external_id: NUM_ID, agent_id: "agt_x", approved_senders: [OWNER_PHONE] });
  ok(!pnErr, "seed test number", pnErr?.message);
  const sms1 = { event: "agent.message", channel: "sms", timestamp: new Date().toISOString(), agentId: "agt_x", data: { messageId: "msg_in1", conversationId: "conv_1", numberId: NUM_ID, from: OWNER_PHONE, to: "+15550100999", message: "What's on my calendar?", mediaUrl: null, direction: "inbound", receivedAt: new Date().toISOString() }, conversationState: null, recentHistory: [] };
  const wid = `whd_${randomBytes(6).toString("hex")}`;
  const s1 = await postPhone(sms1, wid);
  ok(s1.status === 200 && s1.json.ok === true && !s1.json.duplicate, "SMS from approved number: acknowledged");
  ok((await postPhone(sms1, wid)).json.duplicate === true, "SMS: same X-Webhook-ID again is a duplicate");
  const smsRow = await until(async () => (await sb.from("phone_messages").select("*").eq("user_id", USER).eq("provider_message_id", "msg_in1")).data?.[0]);
  ok(!!smsRow?.task_id && smsRow.status === "received", "SMS created a task", JSON.stringify(smsRow));
  const { count: smsCount } = await sb.from("phone_messages").select("id", { count: "exact", head: true }).eq("user_id", USER).eq("provider_message_id", "msg_in1");
  ok(smsCount === 1, "SMS deduplicated");
  const smsReply = await until(() => requests("POST", /^\/v1\/messages$/).find((r) => r.body.to_number === OWNER_PHONE && r.body.number_id === NUM_ID), 45_000);
  ok(!!smsReply && typeof smsReply.body.body === "string" && smsReply.body.body.length > 0, "result texted back: POST /v1/messages {number_id, to_number, body}", JSON.stringify(smsReply?.body));

  const sms2 = { ...sms1, data: { ...sms1.data, messageId: "msg_in2", from: "+15550100777", message: "hi" } };
  await postPhone(sms2);
  const blockedSms = await until(async () => (await sb.from("phone_messages").select("*").eq("user_id", USER).eq("provider_message_id", "msg_in2")).data?.[0]);
  ok(blockedSms?.status === "blocked" && !blockedSms.task_id, "SMS from unapproved number: held, no task");

  // Outbound approval: nothing is sent until the owner says YES <code>.
  const { data: pending } = await sb.from("phone_messages").insert({ user_id: USER, number_id: null, direction: "outbound", counterpart: "+15550100555", body: "Running 10 min late", status: "awaiting_approval", task_id: smsRow?.task_id ?? null, approval_code: "4821" }).select("id").single();
  const sentBefore = requests("POST", /^\/v1\/messages$/).filter((r) => r.body.to_number === "+15550100555").length;
  ok(sentBefore === 0, "pending outbound SMS is not sent before approval");
  await postPhone({ ...sms1, data: { ...sms1.data, messageId: "msg_in3", message: "YES 4821" } });
  const outbound = await until(() => requests("POST", /^\/v1\/messages$/).find((r) => r.body.to_number === "+15550100555"));
  ok(!!outbound && outbound.body.body === "Running 10 min late" && outbound.body.number_id === NUM_ID, "after YES <code>, the approved text goes out with the documented shape");
  // The row turns "sent" after the vendor call returns, a moment after the fake server saw the request.
  const decided = (await until(async () => { const row = (await sb.from("phone_messages").select("status").eq("id", pending?.id ?? "none")).data?.[0]; return row?.status === "sent" ? row : null; }, 10_000)) ?? (await sb.from("phone_messages").select("status").eq("id", pending?.id ?? "none")).data?.[0];
  ok(decided?.status === "sent", "approval recorded on the message (linked to the task)", JSON.stringify(decided));

  // Voice: answered at once, task runs, call recorded.
  const voice = { event: "agent.message", channel: "voice", timestamp: new Date().toISOString(), agentId: "agt_x", data: { callId: `call_${USER}`, numberId: NUM_ID, from: OWNER_PHONE, to: "+15550100999", status: "in-progress", transcript: "Book a table for two tonight", confidence: 0.95, direction: "inbound" }, conversationState: null, recentHistory: [] };
  const t0 = Date.now();
  const v1 = await postPhone(voice);
  ok(v1.status === 200 && typeof v1.json.text === "string" && v1.json.text.length > 0 && Date.now() - t0 < 10_000, "voice turn: answered immediately with spoken text", JSON.stringify(v1.json));
  // Caller ID can be spoofed: a call never runs anything by itself. The request is texted to the approved number with
  // a code, and the task starts only after `YES <code>` comes back by SMS (review #13).
  const pendingCall = await until(async () => (await sb.from("phone_calls").select("*").eq("user_id", USER).eq("call_id", `call_${USER}`)).data?.[0]);
  ok(!!pendingCall && !pendingCall.task_id && /^\d{4}$/.test(pendingCall.confirm_code ?? ""), "voice turn: no task yet, a confirmation code is waiting", JSON.stringify({ task: pendingCall?.task_id, code: !!pendingCall?.confirm_code }));
  const confirmSms = await until(() => requests("POST", /^\/v1\/messages$/).find((r) => r.body.to_number === OWNER_PHONE && /Reply YES \d{4}/.test(r.body.body ?? "")));
  ok(!!confirmSms && confirmSms.body.body.includes(pendingCall?.confirm_code ?? "none"), "voice turn: the code is texted to the owner's number");
  await postPhone({ ...sms1, data: { ...sms1.data, messageId: "msg_in_confirm", message: `YES ${pendingCall?.confirm_code}` } });
  const call = await until(async () => (await sb.from("phone_calls").select("*").eq("user_id", USER).eq("call_id", `call_${USER}`)).data?.[0]?.task_id ? (await sb.from("phone_calls").select("*").eq("user_id", USER).eq("call_id", `call_${USER}`)).data?.[0] : null);
  ok(!!call?.task_id, "voice turn: after YES <code> by SMS, the task is created and linked to the call");
  const vBad = await postPhone({ ...voice, data: { ...voice.data, callId: `call_b_${USER}`, from: "+15550100666" } });
  ok(vBad.json.hangup === true, "voice from unapproved caller: polite hang-up");
  await postPhone({ event: "agent.call_ended", channel: "voice", timestamp: new Date().toISOString(), agentId: "agt_x", data: { callId: `call_${USER}`, numberId: NUM_ID, from: OWNER_PHONE, to: "+15550100999", direction: "inbound", status: "completed", startedAt: new Date(t0).toISOString(), endedAt: new Date().toISOString(), durationSeconds: 42, summary: "Asked to book a table." } }, undefined);
  const ended = await until(async () => (await sb.from("phone_calls").select("*").eq("call_id", `call_${USER}`).eq("status", "completed")).data?.[0]);
  ok(ended?.duration_seconds === 42 && ended.summary === "Asked to book a table.", "call_ended: duration and summary stored for call history");
} catch (err) {
  failures++;
  console.error("ERROR", err);
} finally {
  await cleanup();
  fake.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED (fakes)");
if (process.argv.includes("--live")) {
  const { runLive } = await import("./vendors-live-test.mjs");
  failures += await runLive();
  console.log(failures ? `\n${failures} FAILED (fakes + live)` : "\nALL PASSED (fakes + live)");
}
process.exit(failures ? 1 : 0);
