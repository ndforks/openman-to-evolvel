// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Sign-in with Orgo, end to end against a running server, plus the safety rules for the development bypass and local
// sign-in as pure functions.
//   BASE_URL=http://127.0.0.1:3002 node scripts/signin-test.mjs            (all)
//   node scripts/signin-test.mjs --unit                                    (no server, no Orgo)
//   node scripts/signin-test.mjs --no-device                               (skip the device-flow start)
//
// Needs .env.local with SESSION_SECRET, the database values and ORGO_API_KEY (the key signs in for real; a
// workspace-scoped key is expected to be accepted with a note). EXPECT_COMPUTER=<name> also checks that a computer with
// that name is listed on the first-run screen. What it does on Orgo, all read only:
//  - starts ONE device approval request (never approved; it expires on its own) and polls it once;
//  - asks Orgo who ORGO_API_KEY belongs to and lists that workspace's computers.
// It never creates, changes, starts, stops or deletes an Orgo computer, and never calls POST /api/me/provision.
// The signed-in session it makes is signed out at the end. Prints no key, cookie or secret.
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true, moduleCache: false });
const BASE = (process.env.BASE_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const args = new Set(process.argv.slice(2));

let failures = 0;
let skipped = 0;
const ok = (cond, label, note = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${note ? `  (${note})` : ""}`);
  if (!cond) failures++;
};
const skip = (label) => {
  console.log(`SKIP  ${label}`);
  skipped++;
};

/* ------------------------------------------------------------------ unit: bypass and local sign-in rules */

const bypass = await jiti.import(path.join(root, "src/lib/session/bypass.ts"));
const PUBLIC = "https://openman.example.com";
const throws = (env) => {
  try {
    bypass.assertSafeStartup(env);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

{
  const msg = throws({ NODE_ENV: "production", OPENMAN_DEV_BYPASS: "1" });
  ok(!!msg && /OPENMAN_DEV_BYPASS/.test(msg) && /will not start/.test(msg), "production server with OPENMAN_DEV_BYPASS=1 refuses to start, naming the setting");
  ok(!!throws({ NODE_ENV: "production", OPENMAN_DEV_BYPASS: "true" }), "any truthy spelling of the bypass is refused in production");
  ok(!!throws({ NODE_ENV: "production", NEXT_PUBLIC_AUTH_DISABLED: "1" }), "production server with the old NEXT_PUBLIC_AUTH_DISABLED refuses to start");
  ok(!!throws({ NODE_ENV: "production", OPENMAN_LOCAL_SIGNIN: "1", ORGO_API_KEY: "sk_x", APP_PUBLIC_URL: PUBLIC }), "production server with local sign-in and a public APP_PUBLIC_URL refuses to start");
  ok(throws({ NODE_ENV: "production", APP_PUBLIC_URL: PUBLIC }) === null, "a clean production environment starts");
  ok(throws({ NODE_ENV: "production", OPENMAN_DEV_BYPASS: "0" }) === null, "OPENMAN_DEV_BYPASS=0 counts as off");
  ok(throws({ NODE_ENV: "production", OPENMAN_LOCAL_SIGNIN: "1", ORGO_API_KEY: "sk_x", APP_PUBLIC_URL: "http://127.0.0.1:3000" }) === null, "local sign-in on a loopback production server (next start) is allowed");
  ok(throws({ NODE_ENV: "development", OPENMAN_DEV_BYPASS: "1" }) === null, "next dev with the bypass starts");
  ok(bypass.devBypassEnabled({ NODE_ENV: "production", OPENMAN_DEV_BYPASS: "1" }) === false, "the bypass is never on in production, even if the guard were skipped");
  ok(bypass.devBypassEnabled({ NODE_ENV: "development", OPENMAN_DEV_BYPASS: "1" }) === true, "the bypass is on under next dev");
  ok(bypass.devBypassEnabled({ NODE_ENV: "development", NEXT_PUBLIC_AUTH_DISABLED: "1" }) === false, "the old name no longer turns the bypass on");
  ok(bypass.startupProblems({ NODE_ENV: "development", NEXT_PUBLIC_AUTH_DISABLED: "1" }).warnings.length === 1, "the old name gets a rename warning in development");
  const { enforceSafeStartup } = await jiti.import(path.join(root, "src/lib/session/startup.ts"));
  let code = null;
  const quiet = console.error;
  console.error = () => undefined;
  try {
    enforceSafeStartup({ NODE_ENV: "production", OPENMAN_DEV_BYPASS: "1" }, (c) => {
      code = c;
    });
  } finally {
    console.error = quiet;
  }
  ok(code === 1, "the start-up hook exits with code 1 instead of serving errors");
  code = null;
  enforceSafeStartup({ NODE_ENV: "production" }, (c) => {
    code = c;
  });
  ok(code === null, "the start-up hook lets a clean production server start");
}

{
  const base = { OPENMAN_LOCAL_SIGNIN: "1", ORGO_API_KEY: "sk_x", __NEXT_PRIVATE_ORIGIN: "http://127.0.0.1:3000" };
  const st = (env) => bypass.localSignInState(env);
  ok(st(base).enabled === true, "local sign-in: on with the flag, a key and a 127.0.0.1 bind");
  ok(st({ ...base, __NEXT_PRIVATE_ORIGIN: "http://[::1]:3000" }).enabled === true, "local sign-in: on with a ::1 bind");
  ok(st({ ...base, OPENMAN_LOCAL_SIGNIN: "" }).reason === "off", "local sign-in: off without the explicit flag");
  ok(st({ ...base, ORGO_API_KEY: "" }).reason === "no_key", "local sign-in: off without ORGO_API_KEY");
  ok(st({ ...base, APP_PUBLIC_URL: PUBLIC }).reason === "public_url", "local sign-in: off when APP_PUBLIC_URL is public");
  ok(st({ ...base, __NEXT_PRIVATE_ORIGIN: "http://0.0.0.0:3000" }).reason === "not_loopback_bind", "local sign-in: off on a 0.0.0.0 bind");
  ok(st({ ...base, __NEXT_PRIVATE_ORIGIN: "http://localhost:3000" }).reason === "not_loopback_bind", "local sign-in: off when no -H was given (Next records localhost)");
  ok(st({ ...base, __NEXT_PRIVATE_ORIGIN: undefined }).reason === "not_loopback_bind", "local sign-in: off when the bind address is unknown");
  const H = (o) => new Headers(o);
  ok(bypass.isLoopbackRequest(H({ host: "127.0.0.1:3000" })) === true, "loopback request: Host 127.0.0.1");
  ok(bypass.isLoopbackRequest(H({ host: "192.168.1.5:3000" })) === false, "loopback request: a LAN Host is refused");
  ok(bypass.isLoopbackRequest(H({ host: "127.0.0.1:3000", "x-forwarded-for": "203.0.113.4" })) === false, "loopback request: a forwarded public client is refused");
  ok(bypass.isLoopbackRequest(H({ host: "localhost:3000", "x-forwarded-host": "openman.example.com" })) === false, "loopback request: a public forwarded host is refused");
}

{
  // The dev identity is unreachable with the bypass off: no fallback session, and orgoFor refuses a dev session.
  const saved = { b: process.env.OPENMAN_DEV_BYPASS, o: process.env.NEXT_PUBLIC_AUTH_DISABLED };
  process.env.OPENMAN_DEV_BYPASS = "";
  process.env.NEXT_PUBLIC_AUTH_DISABLED = "";
  try {
    const s = await jiti.import(path.join(root, "src/lib/session/index.ts"));
    ok(s.devUserEnabled() === false, "bypass off: the dev identity is disabled");
    ok((await s.getSession()) === null, "bypass off: no request falls back to the dev user");
    const refused = await s.orgoFor({ userId: "dev", email: "", name: "", plan: "", workspaceId: null, dev: true }).then(
      () => null,
      (r) => r,
    );
    ok(refused instanceof Response && refused.status === 401, "bypass off: orgoFor refuses a dev session (background work included)");
  } finally {
    process.env.OPENMAN_DEV_BYPASS = saved.b;
    process.env.NEXT_PUBLIC_AUTH_DISABLED = saved.o;
  }
}

{
  const { safeNextPath } = await jiti.import(path.join(root, "src/lib/supabase/config.ts"));
  ok(safeNextPath("/app/task/abc?x=1") === "/app/task/abc?x=1", "return path: a same-site page is kept");
  ok(safeNextPath("//evil.example/x") === "/app" && safeNextPath("https://evil.example") === "/app", "return path: another site is refused");
  const { gateDecision } = await jiti.import(path.join(root, "src/lib/session/gate.ts"));
  const d = gateDecision({ pathname: "/app/task/abc", search: "?x=1", cookie: undefined, authDisabled: false });
  ok(d.action === "signin" && d.location === "/signin?next=%2Fapp%2Ftask%2Fabc%3Fx%3D1", "signed out: the gate sends /app pages to /signin with the page to return to");
}

{
  const { billingReadiness, newComputerQuote } = await jiti.import(path.join(root, "src/lib/orgo/account-view.ts"));
  const { COMPUTER_SIZES } = await jiti.import(path.join(root, "src/lib/orgo/plans.ts"));
  ok(billingReadiness({ tier: "free", balanceCents: 0, payer: "you" }).ready === false, "no plan and no credit: setup is held and sent to Orgo billing");
  ok(billingReadiness({ tier: "free", balanceCents: 300, payer: "you" }).ready === true, "no plan but credit: setup runs by the hour");
  ok(billingReadiness({ tier: "hacker_v2", balanceCents: 0, payer: "you" }).ready === true, "a paid plan: setup goes ahead");
  ok(billingReadiness({ tier: "free", balanceCents: null, payer: "owner" }).ready === null, "someone else's workspace: OpenMan cannot tell, and says so");
  const q = newComputerQuote("free");
  ok(q.hourlyUsd === COMPUTER_SIZES[0].hourlyUsd && q.billedAs === "hourly", "new computer quote: Orgo's hourly Medium price on Free");
  ok(newComputerQuote("hacker_v2").billedAs === "plan", "new computer quote: from the plan's room on a paid plan");
}

if (args.has("--unit")) finish();

/* ------------------------------------------------------------------ live: against the server */

const reach = await fetch(`${BASE}/api/auth/session`).catch(() => null);
if (!reach?.ok) {
  ok(false, `server reachable at ${BASE}`);
  finish();
}
const anon = await reach.json();
console.log(`----  live checks against ${BASE} (development bypass ${anon.authDisabled ? "on" : "off"})`);

const cookieOf = (res, name) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (pair.slice(0, i).trim() === name) return { value: pair.slice(i + 1), raw: c };
  }
  return null;
};
const post = (p, body, cookie) =>
  fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const get = (p, cookie) => fetch(`${BASE}${p}`, { headers: cookie ? { Cookie: cookie } : {} });

// Local sign-in is off unless explicitly enabled on a loopback-bound server with a loopback APP_PUBLIC_URL.
{
  const res = await post("/api/auth/local", {});
  if (anon.localSignIn) ok(res.status !== 404, "local sign-in offered and routed (OPENMAN_LOCAL_SIGNIN on this server)");
  else ok(res.status === 404, `local sign-in not offered here, and its route answers 404 (got ${res.status})`);
}

// Device flow: start, waiting state, one pending poll (never approved).
if (args.has("--no-device")) skip("device-flow start (--no-device)");
else {
  const res = await post("/api/auth/orgo/start");
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) skip(`device-flow start: sign-in budget spent (${body.error ?? "busy"})`);
  else {
    const pending = cookieOf(res, "om_signin");
    ok(res.ok && /^[A-Z0-9]{3,5}(-[A-Z0-9]{3,5})+$/.test(body.userCode ?? ""), "device flow: start returns a user code", body.userCode ? `code ${body.userCode}` : `HTTP ${res.status} ${body.error ?? ""}`);
    let orgoHost = "www.orgo.ai";
    try {
      orgoHost = new URL(process.env.ORGO_ORIGIN?.trim() || "https://www.orgo.ai").host;
    } catch {
      // default
    }
    ok(typeof body.verificationUrl === "string" && new URL(body.verificationUrl).host === orgoHost, "device flow: the approval link is on Orgo");
    ok(typeof body.handle === "string" && !body.handle.includes(body.userCode ?? "@@") && !("deviceCode" in body) && !("device_code" in body), "device flow: the browser gets an opaque handle, never Orgo's device code");
    ok(body.interval >= 1 && body.expiresIn > 60, "device flow: interval and expiry", `every ${body.interval}s, ${Math.round(body.expiresIn / 60)} min`);
    ok(!!pending && /HttpOnly/i.test(pending.raw) && /SameSite=strict/i.test(pending.raw), "device flow: pending sign-in bound to this browser (HttpOnly, SameSite=Strict cookie)");
    if (pending) {
      const jar = `om_signin=${pending.value}`;
      const p1 = await (await post("/api/auth/orgo/poll", { handle: body.handle, next: "/app/task/demo" }, jar)).json();
      ok(p1.status === "pending", "device flow: a poll before approval says pending", `status ${p1.status}`);
      const again = await (await post("/api/auth/orgo/start", undefined, jar)).json();
      ok(again.reused === true && again.userCode === body.userCode, "device flow: a second click reuses the same code without asking Orgo again");
      const stranger = await (await post("/api/auth/orgo/poll", { handle: body.handle })).json();
      ok(stranger.status === "expired", "device flow: another browser (no cookie) cannot poll it");
    }
  }
}

// API key path.
{
  const malformed = await post("/api/auth/orgo/key", { apiKey: "not-a-key" });
  const mb = await malformed.json();
  ok(malformed.status === 400 && mb.code === "malformed", "API key: a malformed key is refused before Orgo is asked");
  const fake = await post("/api/auth/orgo/key", { apiKey: `sk_live_${"0".repeat(48)}` });
  const fb = await fake.json();
  ok(fake.status === 401 && fb.code === "invalid_key" && !cookieOf(fake, "om_session")?.value, "API key: a key Orgo refuses signs nobody in", `HTTP ${fake.status} ${fb.code ?? fb.error ?? ""}`);
}

const key = process.env.ORGO_API_KEY?.trim();
let jar = null;
if (!key) skip("API key sign-in with ORGO_API_KEY (not set in .env.local)");
else {
  const res = await post("/api/auth/orgo/key", { apiKey: key, next: "//evil.example/steal" });
  const body = await res.json().catch(() => ({}));
  const session = cookieOf(res, "om_session");
  ok(res.ok && body.status === "approved" && !!session?.value, "API key: ORGO_API_KEY is checked with Orgo and signs in", body.status ?? `HTTP ${res.status} ${body.error ?? ""}`);
  ok(body.redirect === "/app", "API key: an off-site return path is replaced with /app");
  ok(!JSON.stringify(body).includes(key) && !JSON.stringify(body).includes(key.slice(8, 24)), "API key: the key is never sent back");
  ok(/HttpOnly/i.test(session?.raw ?? "") && /SameSite=lax/i.test(session?.raw ?? ""), "API key: session cookie is HttpOnly, SameSite=Lax");
  if (body.keyScope === "workspace") ok(typeof body.note === "string" && /one workspace/.test(body.note), "API key: a workspace-scoped key is detected and its limits explained");
  else ok(body.keyScope === "account", "API key: an account key is detected", body.keyScope);
  if (session?.value) jar = `om_session=${session.value}`;
}

if (jar) {
  const s = await (await get("/api/auth/session", jar)).json();
  ok(s.session && !s.session.dev && s.session.via === "api_key", "signed in: a real session (not the dev user), via API key");

  const meRes = await get("/api/me", jar);
  const me = await meRes.json();
  ok(meRes.ok && !!me.user?.name && /@/.test(me.user?.email ?? "") && !!me.user?.plan, "/api/me: name, email and plan from Orgo", me.user ? `plan ${me.user.plan}` : `HTTP ${meRes.status}`);
  if (me.orgo?.keyScope === "workspace") ok(me.credits?.balanceCents === null, "/api/me: balance reported as unknown for a workspace key (Orgo refuses it)");
  else ok(typeof me.credits?.balanceCents === "number", "/api/me: credit balance from Orgo");
  ok(!!me.orgo?.workspace?.id && !!me.orgo?.billing && /orgo/.test(me.orgo?.links?.billing ?? ""), "/api/me: workspace, billing readiness and Orgo links", me.orgo?.workspace ? `${me.orgo.workspace.computers} computers` : "");
  if (process.env.ORGO_WORKSPACE_ID) ok(me.orgo?.workspace?.id === process.env.ORGO_WORKSPACE_ID.trim(), "/api/me: the key's workspace is the one OpenMan works in");

  const wsRes = await get("/api/me/workspaces", jar);
  const ws = await wsRes.json();
  ok(wsRes.ok && Array.isArray(ws.workspaces) && ws.workspaces.some((w) => w.id === ws.current), "workspace picker: lists the workspaces and marks the current one", `${ws.workspaces?.length ?? 0} listed`);
  if (me.orgo?.keyScope === "workspace") {
    ok(ws.canSwitch === false, "workspace picker: switching is off for a workspace key");
    const put = await fetch(`${BASE}/api/me/workspaces`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: jar }, body: JSON.stringify({ workspaceId: ws.current }) });
    ok(put.status === 409, "workspace picker: a switch with a workspace key is refused with a reason");
  } else ok(typeof ws.canSwitch === "boolean", "workspace picker: says whether switching is possible");

  const pcRes = await get("/api/me/computers", jar);
  const pc = await pcRes.json();
  ok(pcRes.ok && Array.isArray(pc.candidates), "first run: existing computers in the workspace are listed (read only)", `${pc.candidates?.length ?? 0} found, ${pc.candidates?.filter((c) => c.suitable).length ?? 0} usable`);
  ok(pc.newComputer?.hourlyUsd > 0 && pc.newComputer?.size === "Medium", "first run: a new computer comes with Orgo's price", pc.newComputer ? `$${pc.newComputer.hourlyUsd}/h, billed ${pc.newComputer.billedAs}` : "");
  ok(pc.candidates?.every((c) => typeof c.note === "string" && c.note.length > 0), "first run: every computer says why it can or can't be used");
  if (process.env.EXPECT_COMPUTER) {
    const hit = pc.candidates?.find((c) => c.name === process.env.EXPECT_COMPUTER);
    ok(!!hit, "first run: the expected existing computer is detected", hit ? `${hit.kind}${hit.suitable ? ", offered" : `, not offered: ${hit.note}`}` : "missing");
  }
  const prov = await (await get("/api/me/provision", jar)).json();
  ok(typeof prov.state === "string", "first run: setup status readable without starting anything", prov.state);

  const out = await post("/api/auth/signout", undefined, jar);
  const cleared = cookieOf(out, "om_session");
  ok(out.ok && cleared && cleared.value === "" && /Max-Age=0/i.test(cleared.raw), "sign out: the session cookie is cleared");
}

// Sign out everywhere and Disconnect Orgo, as a throwaway user with no Orgo key (nothing on Orgo is touched).
{
  const { mintSecondSession } = await import("./second-session.mjs");
  const t = await mintSecondSession({ name: "QA Sign-in User" });
  try {
    const before = await (await get("/api/auth/session", t.cookie)).json();
    ok(before.session?.userId === t.userId, "throwaway session accepted");
    await new Promise((r) => setTimeout(r, 1100));
    const all = await post("/api/account/sessions", undefined, t.cookie);
    ok(all.ok, "sign out everywhere: accepted");
    const after = await (await get("/api/auth/session", t.cookie)).json();
    ok(after.session === null, "sign out everywhere: the old cookie is refused and never falls back to the dev user");

    const t2 = await mintSecondSession({ name: "QA Disconnect User" });
    try {
      const del = await fetch(`${BASE}/api/me/orgo`, { method: "DELETE", headers: { Origin: BASE, Cookie: t2.cookie } });
      const db = await del.json();
      ok(del.ok && db.ok === true && db.revokedOnOrgo === false && /orgo/.test(db.revoke?.url ?? "") && /orgo keys/.test(db.revoke?.cli ?? ""), "disconnect Orgo: stored key deleted, with how to revoke it on Orgo");
      ok(cookieOf(del, "om_session")?.value === "", "disconnect Orgo: this browser is signed out");
      await new Promise((r) => setTimeout(r, 300));
      const gone = await (await get("/api/auth/session", t2.cookie)).json();
      ok(gone.session === null, "disconnect Orgo: every other session for the account ends");
    } finally {
      await t2.cleanup();
    }
  } finally {
    await t.cleanup();
  }
}

finish();

function finish() {
  console.log(failures ? `\n${failures} failed${skipped ? `, ${skipped} skipped` : ""}` : `\nall passed${skipped ? ` (${skipped} skipped)` : ""}`);
  process.exit(failures ? 1 : 0);
}
