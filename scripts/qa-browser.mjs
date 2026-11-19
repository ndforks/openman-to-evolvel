// Cloud browser settings (/api/browser) against the dev server and the dev computer.
//   node scripts/qa-browser.mjs            (BASE_URL defaults to http://127.0.0.1:3001)
// Seeds one harmless cookie (httpbin.org) and one fake vault login on the dev computer, checks the list, per-site
// clear, the persist toggle and clear all, then leaves persistence on (the default) with nothing saved.
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { OrgoClient } = await jiti.import(path.join(root, "src/lib/orgo/user-client.ts"));

let failures = 0;
let passes = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (cond) passes++;
  else failures++;
};
const api = async (method, p, body) => {
  const res = await fetch(`${BASE}${p}`, { method, headers: { "Content-Type": "application/json", Origin: BASE }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
};

const computerId = process.env.ORGO_COMPUTER_ID;
const orgo = new OrgoClient({ apiKey: process.env.ORGO_API_KEY, workspaceId: process.env.ORGO_WORKSPACE_ID || null });
const FAKE_PASSWORD = "om-qa-not-a-real-password";
async function seed() {
  const script = [
    `timeout 40 google-chrome --headless=new --no-sandbox --disable-gpu --user-data-dir=/root/.hermes/browser-data --virtual-time-budget=3000 --dump-dom "https://httpbin.org/response-headers?Set-Cookie=om_qa%3D1%3B%20Max-Age%3D86400%3B%20Path%3D%2F" >/dev/null 2>&1`,
    `echo 'import agent.vault_store as v; v.get_vault_store().add_item("login","OM QA login",{"identifier_type":"username","identifier":"qa-user","password":"${FAKE_PASSWORD}"},origin="https://httpbin.org"); print("OM_SEEDED")' | timeout 40 hermes --run-module code 2>/dev/null`,
  ].join("\n");
  return (await orgo.bash(computerId, script, 120)).output ?? "";
}

// 1. Defaults and validation.
let r = await api("GET", "/api/browser");
ok(r.status === 200 && typeof r.json?.persist === "boolean" && Array.isArray(r.json?.sites), "GET /api/browser answers the state");
r = await api("PUT", "/api/browser/settings", { persist: true });
ok(r.status === 200 && r.json?.persist === true, "persist on");
ok((await api("PUT", "/api/browser/settings", { persist: "yes" })).status === 400, "a non-boolean persist is refused");
ok((await api("POST", "/api/browser/clear", { site: "bad site/../x" })).status === 400, "a bad site name is refused");
ok((await api("POST", "/api/browser/clear", { all: false })).status === 400, "clear needs a site or all: true");
ok((await api("POST", "/api/browser/clear", { site: "x".repeat(300) })).status === 400, "an over-long site is refused");

// 2. A real cookie and a saved login show up, without values.
ok((await seed()).includes("OM_SEEDED"), "seeded a cookie and a vault login on the dev computer");
r = await api("GET", "/api/browser");
const site = r.json?.sites?.find((s) => s.site === "httpbin.org");
ok(!!site && site.cookies >= 1, "the cookie's site is listed with a count");
ok(!!site && site.logins.some((l) => l.label === "OM QA login" && l.identifier === "qa-user"), "the saved login is listed by label and identifier");
ok(!r.text.includes(FAKE_PASSWORD) && !/"value"/.test(r.text), "no cookie value or password in the response");

// 3. Per-site clear removes both.
r = await api("POST", "/api/browser/clear", { site: "HTTPBIN.org" });
ok(r.status === 200 && r.json?.removedCookies >= 1 && r.json?.removedLogins >= 1, "per-site clear removes its cookies and logins");
ok(!r.json?.sites?.some((s) => s.site === "httpbin.org"), "the site is gone from the list");

// 4. Persist off and back on; clear all.
r = await api("PUT", "/api/browser/settings", { persist: false });
ok(r.status === 200 && r.json?.persist === false, "persist off");
r = await api("GET", "/api/browser");
ok(r.json?.persist === false, "the choice sticks (the computer's config agrees with the saved preference)");
r = await api("PUT", "/api/browser/settings", { persist: true });
ok(r.json?.persist === true, "persist back on");
ok((await seed()).includes("OM_SEEDED"), "seeded again");
r = await api("POST", "/api/browser/clear", { all: true });
ok(r.status === 200 && r.json?.sites?.length === 0 && r.json?.removedLogins >= 1, "clear all empties the list");

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
