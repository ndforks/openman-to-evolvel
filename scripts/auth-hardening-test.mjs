// Sign-in start budgets, the post-sign-in redirect, CSRF, the device-code cookie binding, the dev-identity guard,
// automations tokens and usage caps (review #1, #5, #7, #9, #16, #17, #18, CSRF, #3).
//   node scripts/auth-hardening-test.mjs            (unit + database; never calls Orgo)
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3001";

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

// ---- #5 open redirect
const { safeNextPath } = await jiti.import(path.join(root, "src/lib/supabase/config.ts"));
for (const bad of ["/\t/evil.example", "/%09/evil.example".replace("%09", "\t"), "//evil.example", "/\\evil.example", "\\\\evil.example", "https://evil.example", "/\n/evil.example", "/ /evil.example", "javascript:alert(1)", "/ /evil.example", ""])
  ok(safeNextPath(bad) === "/app", `refuses next=${JSON.stringify(bad)}`);
ok(safeNextPath("/app/task/abc?x=1#h") === "/app/task/abc?x=1#h", "keeps a same-site path with query and hash");
ok(safeNextPath("/app/%2F%2Fevil") === "/app/%2F%2Fevil", "encoded slashes stay a path");
const cb = await fetch(`${BASE}/auth/callback?next=${encodeURIComponent("/\t/evil.example")}`, { redirect: "manual" });
ok(cb.status >= 300 && cb.status < 400 && !/evil\.example/.test(cb.headers.get("location") ?? ""), "callback does not forward a bad next");

// ---- CSRF
const { csrfRefusal } = await jiti.import(path.join(root, "src/lib/session/csrf.ts"));
const H = (o) => new Headers(o);
ok(csrfRefusal({ method: "POST", headers: H({ origin: "https://evil.example", host: "app.example" }), hasSessionCookie: true, selfOrigin: "https://app.example" }), "cross-site POST with cookie refused");
ok(!csrfRefusal({ method: "POST", headers: H({ origin: "https://app.example", host: "app.example" }), hasSessionCookie: true, selfOrigin: "https://app.example" }), "same-origin POST allowed");
ok(!csrfRefusal({ method: "POST", headers: H({ origin: "https://app.example", host: "app.example" }), hasSessionCookie: true, selfOrigin: "http://localhost:3000" }), "same-origin behind a proxy allowed");
ok(csrfRefusal({ method: "DELETE", headers: H({ "sec-fetch-site": "cross-site" }), hasSessionCookie: true, selfOrigin: "https://app.example" }), "cross-site without Origin refused");
ok(!csrfRefusal({ method: "POST", headers: H({ origin: "https://evil.example" }), hasSessionCookie: false, selfOrigin: "https://app.example" }), "no cookie (bearer API, webhooks) not affected");
ok(!csrfRefusal({ method: "GET", headers: H({ origin: "https://evil.example" }), hasSessionCookie: true, selfOrigin: "https://app.example" }), "GET not affected");
const live = await fetch(`${BASE}/api/settings`, { method: "PATCH", headers: { Origin: "https://evil.example", Cookie: "om_session=x", "Content-Type": "application/json" }, body: "{}" });
ok(live.status === 403, `dev server refuses a cross-site cookie PATCH (got ${live.status})`);

// ---- #1 sign-in budgets (database counters, test buckets; Orgo is never called)
const lim = await jiti.import(path.join(root, "src/lib/session/signin-limit.ts"));
ok(lim.clientAddress(H({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" })) === "1.2.3.4", "client address is the entry the edge appended (spoofed first entry ignored)");
ok(lim.clientAddress(H({ "x-forwarded-for": "2001:db8:1:2:3:4:5:6" })) === "2001:db8:1:2::/64", "IPv6 grouped by /64");
const prefix = `test-signin-${Date.now()}`;
let allowed = 0, busy = null;
for (let i = 0; i < 30; i++) {
  try {
    await lim.takeSignInStart(H({ "x-forwarded-for": "203.0.113.9" }), { prefix });
    allowed++;
  } catch (e) {
    busy = e;
  }
}
ok(allowed === lim.PER_CLIENT, `30 starts from one address: ${allowed} allowed (limit ${lim.PER_CLIENT})`);
ok(busy && /Try again in \d+ minute/.test(busy.message) && busy.retryAfter > 0, "a clear message with a retry time");
let globalAllowed = 0;
for (let i = 0; i < 40; i++) {
  try {
    await lim.takeSignInStart(H({ "x-forwarded-for": `198.51.100.${i}` }), { prefix });
    globalAllowed++;
  } catch (e) {
    busy = e;
  }
}
ok(lim.PER_CLIENT + globalAllowed <= lim.GLOBAL_PER_HOUR && lim.GLOBAL_PER_HOUR < 20, `global budget holds below Orgo's 20/h (${lim.PER_CLIENT + globalAllowed} of ${lim.GLOBAL_PER_HOUR})`);
ok(/busy right now/.test(busy?.message ?? ""), "global budget message");
{
  const { db } = await jiti.import(path.join(root, "src/lib/db/client.ts"));
  await db().from("api_rate_limits").delete().like("bucket", `${prefix}%`);
}
const startSrc = readFileSync(path.join(root, "src/app/api/auth/orgo/start/route.ts"), "utf8");
ok(/openPendingSignIn/.test(startSrc) && /takeSignInStart/.test(startSrc) && !/x-forwarded-host/.test(startSrc), "start route reuses a pending code, spends budget, ignores Host headers");

// ---- #18 device code bound to the browser
const cookie = await jiti.import(path.join(root, "src/lib/session/cookie.ts"));
const p = { handle: "h", userCode: "ABCD", verificationUrl: "https://www.orgo.ai/cli/approve?c=1", interval: 2, expiresAt: Math.floor(Date.now() / 1000) + 600, startedAt: Date.now() };
const sealed = cookie.sealPendingSignIn(p);
ok(cookie.openPendingSignIn(sealed)?.handle === "h", "pending sign-in round-trips in its cookie");
ok(cookie.openPendingSignIn(sealed.slice(0, -2) + "AA") === null, "a tampered cookie is refused");
const poll = await fetch(`${BASE}/api/auth/orgo/poll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: cookie.sealDeviceHandle("fake-device-code", 600) }) });
ok((await poll.json()).status === "expired", "poll without the starting browser's cookie is refused");

// ---- #9 / #16 dev identity
const sessionSrc = readFileSync(path.join(root, "src/lib/session/index.ts"), "utf8");
ok(/NODE_ENV !== "production"/.test(readFileSync(path.join(root, "src/lib/supabase/config.ts"), "utf8")), "auth-disabled switch ignored in production");
ok(/devRequestAllowed/.test(sessionSrc) && /revokedBefore[^\n]*\) return null/.test(sessionSrc), "dev session only for loopback requests; a revoked cookie never falls back to dev");
const viaHost = (host, extra = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(`${BASE}/api/auth/session`);
    http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { Host: host, ...extra } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(JSON.parse(b))); }).on("error", reject);
  });
const lan = await viaHost("192.168.1.50:3001");
ok(lan.session === null, "a request addressed to a LAN host name does not get the dev user");
const local = await viaHost("localhost:3001");
ok(local.authDisabled ? local.session?.dev === true : true, "a loopback request still gets the dev user locally");

// ---- #7 automations tokens
process.env.SESSION_SECRET ||= "0".repeat(64);
const mcp = await jiti.import(path.join(root, "src/lib/automations/mcp.ts"));
const U = `test-tok-${Date.now()}`;
const t = mcp.mintToken(U);
ok(mcp.parseToken(t)?.userId === U, "fresh token parses");
ok(mcp.parseToken(mcp.mintToken(U, Date.now() - (mcp.TOKEN_TTL_S + 60) * 1000)) === null, "expired token refused");
ok(mcp.parseToken(`omauto_${Buffer.from(U).toString("base64url")}.abc`) === null, "first-format (never-expiring) token refused");
ok((await mcp.verifyToken(t)) === U, "token accepted before revocation");
await new Promise((r) => setTimeout(r, 1100));
await mcp.revokeTokens(U);
ok((await mcp.verifyToken(t)) === null, "token refused after revocation");
ok((await mcp.verifyToken(mcp.mintToken(U, Date.now() + 1000))) === U, "a token minted after revocation works");
const rpc = await fetch(`${BASE}/api/automations/mcp`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
ok(rpc.status === 401, "revoked token refused by the route");
{
  const { db } = await jiti.import(path.join(root, "src/lib/db/client.ts"));
  await db().from("revocations").delete().eq("user_id", U);
}

// ---- #3 usage caps
const usage = await jiti.import(path.join(root, "src/lib/usage/index.ts"));
process.env.USAGE_LIMITS = JSON.stringify({ sms: { day: 5, month: 7 } });
const V = `test-use-${Date.now()}`;
const results = await Promise.allSettled(Array.from({ length: 20 }, () => usage.consumeUsage(V, "sms", 1)));
ok(results.filter((r) => r.status === "fulfilled").length === 5, "20 parallel sends with a daily cap of 5: exactly 5 allowed");
const rej = results.find((r) => r.status === "rejected");
ok(rej && rej.reason.status === 429 && /today's limit of 5 text messages/.test(rej.reason.message), "clear 429 message");
{
  const { db } = await jiti.import(path.join(root, "src/lib/db/client.ts"));
  await db().from("usage_counters").delete().eq("user_id", V);
}
delete process.env.USAGE_LIMITS;
const before = (file, vendor) => {
  const src = readFileSync(path.join(root, file), "utf8");
  const u = src.indexOf("consumeUsage(");
  return u > 0 && src.indexOf(vendor, u) > u;
};
ok(before("src/app/api/voice/token/route.ts", "singleUseToken(\"realtime_scribe\""), "voice token: cap before ElevenLabs");
ok(before("src/lib/voice/providers.ts", "singleUseToken(\"batch_scribe\")"), "transcription: cap before ElevenLabs");
ok(before("src/lib/phone/service.ts", "createAgent("), "phone number: cap before AgentPhone");
ok(before("src/lib/phone/service.ts", "sendMessage("), "SMS: cap before AgentPhone");
ok(before("src/lib/mail/service.ts", "createInbox("), "inbox: cap before AgentMail");
ok(before("src/lib/mail/inbound.ts", "replyToMessage(email"), "email reply: cap before AgentMail");
ok(before("src/lib/websites/server.ts", "/shares`"), "site invites: cap before Orgo's mailer");
ok(before("src/lib/phone/inbound.ts", "startTaskFor("), "calls: cap before a call turn runs");

// ---- invite gate (Part B): first sign-in owns an empty list, others need an invite
{
  const inv = await jiti.import(path.join(root, "src/lib/session/invites.ts"));
  const { db } = await jiti.import(path.join(root, "src/lib/db/client.ts"));
  const existing = await inv.listInvites();
  if (existing.length === 0) {
    const A = `test-owner-${Date.now()}`, B = `test-guest-${Date.now()}`, C = `test-member-${Date.now()}`;
    try {
      ok((await inv.admitOnSignIn(A, "owner@example.test")) === "owner", "first account on an empty list becomes owner");
      ok((await inv.admitOnSignIn(B, "guest@example.test")) === null, "second account without an invite is refused");
      await inv.addInvite({ email: "member@example.test" }, A);
      ok((await inv.admitOnSignIn(C, "Member@Example.test")) === "member", "invited email is admitted (case-insensitive) and bound to the Orgo id");
      ok((await inv.roleOf(C)) === "member", "role is found by Orgo user id afterwards");
      const both = await Promise.all([inv.admitOnSignIn(`${B}-x`, "x@example.test"), inv.admitOnSignIn(`${B}-y`, "y@example.test")]);
      ok(both.every((r) => r === null), "racing strangers never become owners of a non-empty list");
    } finally {
      await db().from("invites").delete().in("orgo_user_id", [A, B, C]);
      await db().from("invites").delete().eq("email", "member@example.test");
    }
  } else console.log("SKIP  invite gate test (this database already has an invite list)");
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
