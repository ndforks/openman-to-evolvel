// Account deletion and export cover every table, and deletion ends every session (review #10, #14, #15).
//   node scripts/account-data-test.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const ad = await jiti.import(path.join(root, "src/lib/personalization/account-data.ts"));
const { db } = await jiti.import(path.join(root, "src/lib/db/client.ts"));
const { getRevocation } = await jiti.import(path.join(root, "src/lib/db/revocations.ts"));
const { sessionsRevokedAt } = await jiti.import(path.join(root, "src/lib/personalization/sessions.ts"));

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

// 1. Static: every table with a person column (user_id, owner_id, member_id, proposed_by, orgo_user_id) in the migrations is
//    deleted, exported (or deliberately kept). A table added later without being listed in account-data.ts fails here.
const dir = path.join(root, "supabase/migrations");
const sql = readdirSync(dir).sort().map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
const personCol = new RegExp(`^\\s*(${ad.PERSON_COLUMNS.join("|")})\\s`, "m");
const withPerson = new Map();
for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
  const cols = [...m[2].matchAll(new RegExp(personCol.source, "gm"))].map((x) => x[1]);
  if (cols.length) withPerson.set(m[1], cols);
}
for (const m of sql.matchAll(new RegExp(`alter table (?:only )?public\\.([a-z_]+)[^;]*add column (?:if not exists )?(${ad.PERSON_COLUMNS.join("|")})\\b`, "g")))
  withPerson.set(m[1], [...(withPerson.get(m[1]) ?? []), m[2]]);
ok(withPerson.size >= 40, `found ${withPerson.size} tables with a person column in the migrations`);
const covered = new Set([...ad.USER_TABLES, ...ad.KEPT_TABLES, ...Object.keys(ad.SPECIAL_TABLES)]);
const missing = [...withPerson.keys()].filter((t) => !covered.has(t));
ok(missing.length === 0, `deletion covers every user table${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
const special = [...withPerson].filter(([t, cols]) => !cols.includes("user_id") && !ad.KEPT_TABLES.includes(t) && !(t in ad.SPECIAL_TABLES));
ok(special.length === 0, `tables without user_id are matched by their own columns${special.length ? ` (missing: ${special.map(([t]) => t).join(", ")})` : ""}`);
for (const t of ["meetings", "recordings", "recording_parts", "recording_images", "mail_messages", "mail_threads", "mail_senders", "mail_ops", "phone_messages", "phone_calls", "channel_links", "project_skills", "skill_builds", "api_tasks", "api_idempotency", "website_secrets", "task_costs"])
  ok(ad.USER_TABLES.includes(t), `deletes ${t}`);
for (const t of ["project_members", "project_proposals", "task_members"]) ok(t in ad.SPECIAL_TABLES, `deletes ${t} by owner and member columns`);
ok(!ad.USER_TABLES.includes("revocations"), "keeps the revocation record");
const exportSrc = readFileSync(path.join(root, "src/lib/personalization/account-data.ts"), "utf8");
const exportList = exportSrc.slice(exportSrc.indexOf("const EXPORT_TABLES"), exportSrc.indexOf("] as const;", exportSrc.indexOf("const EXPORT_TABLES")));
const notExported = [...ad.USER_TABLES, ...Object.keys(ad.SPECIAL_TABLES).filter((t) => t !== "invites")].filter((t) => !exportList.includes(`"${t}"`));
ok(/SECRET_COLUMNS = new Set\([^)]*"value_enc"/.test(exportSrc), "sealed website secret values are never exported");
const sealedCols = [...sql.matchAll(/^\s*([a-z_]+_enc|[a-z_]*hash[a-z_]*|hook_token)\s/gm)].map((m) => m[1]).filter((c) => c !== "user_hash");
const unsealed = [...new Set(sealedCols)].filter((c) => !exportSrc.slice(exportSrc.indexOf("SECRET_COLUMNS"), exportSrc.indexOf("SECRET_COLUMNS") + 300).includes(`"${c}"`));
ok(unsealed.length === 0, `every sealed column in the migrations is left out of the export${unsealed.length ? ` (missing: ${unsealed.join(", ")})` : ""}`);
ok(notExported.length === 0, `export covers every deleted table${notExported.length ? ` (missing: ${notExported.join(", ")})` : ""}`);
ok(!readFileSync(path.join(root, "src/app/api/settings/route.ts"), "utf8").includes("sessionsRevokedAt"), "settings routes do not carry the revocation time");

// 1b. Live schema: every listed table exists with the column the code filters on (a renamed or missing column fails).
for (const [t, cols] of [...ad.USER_TABLES.map((t) => [t, ["user_id"]]), ...Object.entries(ad.SPECIAL_TABLES)]) {
  const { error } = await db().from(t).select(cols.join(",")).limit(0);
  ok(!error, `live table ${t} has ${cols.join(", ")}${error ? ` (${error.code}: ${error.message})` : ""}`);
}

// 2. Live: rows in several tables are removed, and a revocation that settings writes cannot erase is recorded.
const U = `test-del-${Date.now()}`;
try {
  const ins = async (table, row) => {
    const { error } = await db().from(table).insert({ user_id: U, ...row });
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  await ins("settings", { data: { theme: "dark" } });
  await ins("recordings", { name: "r" });
  await ins("mail_senders", { email: "a@example.com" });
  await ins("notifications", { kind: "info", title: "t" }).catch(() => undefined);
  await db().rpc("usage_consume", { p_user: U, p_metric: "test", p_amount: 1, p_day_limit: 5, p_month_limit: 5 });
  const before = Date.now();
  const removed = await ad.deleteUserRows(U);
  ok(removed.recordings >= 1 && removed.mail_senders >= 1 && removed.settings >= 1 && removed.usage_counters >= 1, "rows in recordings, mail_senders, settings, usage_counters removed");
  for (const t of ["settings", "recordings", "mail_senders", "usage_counters", "accounts"]) {
    const { count } = await db().from(t).select("*", { count: "exact", head: true }).eq("user_id", U);
    ok((count ?? 0) === 0, `${t} empty after deletion`);
  }
  const rev = await getRevocation(U);
  ok(rev.sessionsRevokedAt && Date.parse(rev.sessionsRevokedAt) >= before - 1000, "sessions revoked at deletion (other devices signed out)");
  ok(rev.automationsNotBefore && Date.parse(rev.automationsNotBefore) >= before - 1000, "automations tokens revoked at deletion");
  ok((await sessionsRevokedAt(U)) === rev.sessionsRevokedAt, "the session check reads the revocation table");
} finally {
  for (const t of ["settings", "recordings", "mail_senders", "notifications", "usage_counters", "revocations"]) await db().from(t).delete().eq("user_id", U);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
