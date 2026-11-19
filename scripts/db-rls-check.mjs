// Row-level security check against the real database, over plain HTTP (PostgREST).
// With the right `x-om-secret` a request can write and read; with none or a wrong one it sees nothing
// and cannot write. Cleans up the throwaway rows. Prints no secret.
//   node scripts/db-rls-check.mjs
import { loadEnv } from "./env.mjs";

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.APP_DB_SECRET;
if (!url || !key || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or APP_DB_SECRET");
  process.exit(2);
}

const TABLES = ["accounts", "projects", "project_files", "tasks", "task_events", "task_files", "knowledge", "settings", "shares",
  "notifications", "automations", "automation_runs", "mailboxes", "phone_numbers", "websites"];
const user = `rls-test-${Date.now()}`;
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

function headers(mode) {
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  if (mode === "right") h["x-om-secret"] = secret;
  if (mode === "wrong") h["x-om-secret"] = "not-the-secret";
  return h;
}
async function rest(mode, method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers: headers(mode), body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

// 1. Writes
const okInsert = await rest("right", "POST", "notifications", { user_id: user, title: "rls check" });
check(okInsert.status === 201 && okInsert.json?.[0]?.user_id === user, "with the secret: insert succeeds");
for (const mode of ["none", "wrong"]) {
  const r = await rest(mode, "POST", "notifications", { user_id: user, title: "should fail" });
  check(r.status === 401 || r.status === 403, `${mode} secret: insert refused (HTTP ${r.status})`);
}

// 2. Reads on every table
for (const t of TABLES) {
  const right = await rest("right", "GET", `${t}?select=*&limit=1`);
  check(right.status === 200, `with the secret: read ${t}`);
  for (const mode of ["none", "wrong"]) {
    const r = await rest(mode, "GET", `${t}?select=*&limit=5`);
    check(r.status === 200 ? Array.isArray(r.json) && r.json.length === 0 : r.status >= 400, `${mode} secret: ${t} returns nothing`);
  }
}
const mine = await rest("right", "GET", `notifications?user_id=eq.${user}`);
check(mine.json?.length === 1, "with the secret: the row just written reads back");

// 3. Update / delete without the secret change nothing
for (const mode of ["none", "wrong"]) {
  await rest(mode, "PATCH", `notifications?user_id=eq.${user}`, { title: "tampered" });
  await rest(mode, "DELETE", `notifications?user_id=eq.${user}`);
}
const after = await rest("right", "GET", `notifications?user_id=eq.${user}`);
check(after.json?.length === 1 && after.json[0].title === "rls check", "no or wrong secret: update and delete change nothing");

// 4. The check function itself is not reachable over the API
const rpc = await rest("none", "POST", "rpc/is_server", {});
check(rpc.status === 404 || rpc.status >= 400, "private.is_server is not exposed over the API");

// Cleanup
const del = await rest("right", "DELETE", `notifications?user_id=eq.${user}`);
check(del.status === 200, "cleanup");
console.log(failures ? `\n${failures} check(s) failed` : "\nAll RLS checks passed");
process.exit(failures ? 1 : 0);
