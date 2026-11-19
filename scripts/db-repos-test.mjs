// Exercises every repository in src/lib/db against the real database with a throwaway user id,
// checks user scoping (a second throwaway user sees nothing), then deletes everything it made.
//   node scripts/db-repos-test.mjs
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const d = await jiti.import(path.join(root, "src/lib/db/index.ts"));
const { DbStore } = await jiti.import(path.join(root, "src/lib/store/db-store.ts"));

const A = `test-a-${Date.now()}`;
const B = `test-b-${Date.now()}`;
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const throwsCode = async (fn, code) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e?.code === code;
  }
};

async function cleanup() {
  const tables = ["shares", "task_files", "task_events", "automation_runs", "tasks", "project_files", "projects", "knowledge", "settings",
    "notifications", "automations", "mailboxes", "phone_numbers", "websites", "accounts"];
  for (const t of tables) {
    const { error } = await d.db().from(t).delete().in("user_id", [A, B]);
    if (error) console.warn(`cleanup ${t}: ${error.message}`);
  }
}

try {
  // accounts
  ok((await d.getAccount(A)) === null, "accounts: missing account is null");
  const acc = await d.upsertAccount({ userId: A, email: "a@example.com", name: "A" });
  ok(acc.userId === A && acc.email === "a@example.com" && acc.hermesBaseUrl === null, "accounts: create");
  const acc2 = await d.upsertAccount({ userId: A, homeComputerId: "comp-1", hermesBaseUrl: "https://h.example" });
  ok(acc2.email === "a@example.com" && acc2.homeComputerId === "comp-1", "accounts: partial update keeps other fields");
  ok((await d.getAccount(B)) === null, "accounts: other user sees nothing");

  // projects
  const p1 = await d.createProject(A, { name: "Alpha", instructions: "Be brief." });
  const p2 = await d.createProject(A, { id: "proj_client_1", name: "Beta", connectors: ["gmail"], skills: ["s1"] });
  ok(p1.order === 0 && p2.order === 1 && p2.id === "proj_client_1", "projects: create with auto order and client id");
  ok((await d.updateProject(A, p2.id, { pinned: true, name: "Beta 2" }))?.pinned === true, "projects: pin + rename");
  ok((await d.listProjects(A))[0].id === p2.id, "projects: pinned first");
  await d.reorderProjects(A, [p2.id, p1.id]);
  ok((await d.getProject(A, p1.id)).order === 1, "projects: reorder");
  ok((await d.listProjects(B)).length === 0 && (await d.getProject(B, p1.id)) === null, "projects: scoped by user");
  ok((await d.updateProject(B, p1.id, { name: "x" })) === null && !(await d.deleteProject(B, p1.id)), "projects: other user cannot change");
  const f = await d.addProjectFile(A, p1.id, { name: "notes.md", mime: "text/markdown", bytes: new TextEncoder().encode("# hi") });
  const bin = await d.addProjectFile(A, p1.id, { name: "b.bin", mime: "application/octet-stream", bytes: new Uint8Array([0, 255, 7]) });
  ok((await d.listProjectFiles(A, p1.id)).length === 2, "project files: add + list");
  ok((await d.readProjectFile(A, p1.id, f.id)).bytes.toString() === "# hi", "project files: text round trip");
  ok([...(await d.readProjectFile(A, p1.id, bin.id)).bytes].join() === "0,255,7", "project files: binary round trip");
  ok((await d.readProjectFile(B, p1.id, f.id)) === null, "project files: scoped");
  ok(await d.deleteProjectFile(A, p1.id, bin.id), "project files: delete");

  // tasks through the store
  const store = new DbStore(A);
  const now = new Date().toISOString();
  const task = { id: `t${Date.now()}abc`, title: "Hello", status: "running", createdAt: now, updatedAt: now, projectId: p1.id, favorite: false,
    meta: { mode: "standard", effort: "high", sessionId: "s-1", target: { kind: "cloud-persistent", computerId: "c9" } } };
  await store.createTask(task);
  ok((await store.getTask(task.id))?.title === "Hello", "tasks: create + get");
  await store.appendEvents(task.id, [{ seq: 1, at: now, type: "user.message", text: "hi" }, { seq: 2, at: now, type: "message.completed", text: "yo" }]);
  await store.appendEvents(task.id, [{ seq: 2, at: now, type: "message.completed", text: "yo" }, { seq: 3, at: now, type: "run.completed" }]);
  ok((await store.listEvents(task.id)).map((e) => e.seq).join() === "1,2,3", "task events: ordered, retry-safe");
  ok((await store.listEvents(task.id, 1)).length === 2 && (await store.lastSeq(task.id)) === 3, "task events: after + lastSeq");
  await store.updateTask(task.id, { title: "Renamed", favorite: true, archived: true, updatedAt: now,
    meta: { ...task.meta, files: { f1: { fileId: "f1", path: "/home/u/a.txt", name: "a.txt", version: "v1", at: now } } } });
  const t2 = await store.getTask(task.id);
  ok(t2.title === "Renamed" && t2.favorite && t2.archived && t2.updatedAt === now, "tasks: rename, favourite, archive, explicit updatedAt kept");
  ok((await store.listTasks()).length === 0 && (await store.listTasks({ archived: true })).length === 1, "tasks: archived hidden by default");
  ok((await d.listTaskFileRows(A, task.id))[0]?.name === "a.txt", "task files: indexed from meta");
  const { data: cols } = await d.db().from("tasks").select("mode,effort,computer_id,hermes_session_id").eq("id", task.id).single();
  ok(cols.mode === "standard" && cols.computer_id === "c9" && cols.hermes_session_id === "s-1", "tasks: mirrored columns");
  const other = new DbStore(B);
  ok((await other.getTask(task.id)) === null && (await other.listEvents(task.id)).length === 0, "tasks: other user sees nothing");
  ok(!(await other.deleteTask(task.id)), "tasks: other user cannot delete");

  // shares
  const s1 = await d.upsertShare(A, task.id, "public");
  ok(d.SHARE_TOKEN.test(s1.token), "shares: create");
  ok((await d.resolveShareToken(s1.token))?.userId === A, "shares: public token resolves");
  await d.upsertShare(A, task.id, "private");
  ok((await d.resolveShareToken(s1.token)) === null, "shares: private token does not resolve");
  ok((await d.upsertShare(A, task.id, "public")).token === s1.token, "shares: same token on re-share");
  ok(await d.revokeShare(A, task.id), "shares: revoke");
  ok((await d.resolveShareToken(s1.token)) === null, "shares: revoked token dead");

  // knowledge with limit
  const k = await d.createKnowledge(A, { name: "Tone", whenToUse: "always", content: "Friendly" });
  ok((await d.updateKnowledge(A, k.id, { enabled: false }))?.enabled === false, "knowledge: toggle");
  ok((await d.listKnowledge(A, { enabledOnly: true })).length === 0, "knowledge: enabledOnly");
  await d.db().from("knowledge").insert(Array.from({ length: 49 }, (_, i) => ({ user_id: A, name: `k${i}` })));
  ok(await throwsCode(() => d.createKnowledge(A, { name: "51st" }), "limit"), "knowledge: 50 entry limit");
  ok((await d.listKnowledge(B)).length === 0, "knowledge: scoped");

  // settings
  await d.patchSettings(A, { theme: "dark", general: { lang: "en", beta: true } });
  const s = await d.patchSettings(A, { general: { beta: null, tz: "UTC" } });
  ok(s.theme === "dark" && s.general.lang === "en" && s.general.tz === "UTC" && !("beta" in s.general), "settings: deep merge, null removes");
  ok(Object.keys(await d.getSettings(B)).length === 0, "settings: scoped");

  // notifications
  const n1 = await d.createNotification(A, { title: "One" });
  await d.createNotification(A, { title: "Two" });
  ok((await d.listNotifications(A)).unread === 2, "notifications: unread count");
  ok((await d.markNotificationsRead(A, [n1.id])) === 1 && (await d.listNotifications(A)).unread === 1, "notifications: mark one read");
  ok((await d.markNotificationsRead(B)) === 0, "notifications: other user marks nothing");
  ok((await d.markNotificationsRead(A)) === 1, "notifications: mark all read");

  // automations, runs, mailboxes, phone numbers, websites
  const au = await d.automations.create(A, { name: "Daily", prompt: "Summarise", schedule: "0 9 * * *", projectId: p1.id });
  const run = await d.automationRuns.create(A, { automationId: au.id, taskId: task.id, status: "completed" });
  ok(au.projectId === p1.id && run.automationId === au.id, "automations + runs: create");
  ok((await d.automationRuns.list(A, { automationId: au.id })).length === 1, "automation runs: list by automation");
  ok((await d.automations.update(A, au.id, { enabled: false }))?.enabled === false, "automations: update");
  ok((await d.automations.list(B)).length === 0 && (await d.automations.get(B, au.id)) === null, "automations: scoped");
  const mb = await d.mailboxes.create(A, { address: `${A}@agentmail.test`, displayName: "Agent" });
  const ph = await d.phoneNumbers.create(A, { number: `+1555${Date.now() % 10_000_000}`, label: "Main" });
  const ws = await d.websites.create(A, { name: "Site", slug: `site-${A}`, taskId: task.id });
  ok(mb.address.endsWith("agentmail.test") && ph.label === "Main" && ws.status === "draft", "mailboxes, phone numbers, websites: create");
  ok(await d.websites.remove(A, ws.id), "websites: delete");

  // delete cascades
  ok(await store.deleteTask(task.id), "tasks: delete");
  const { count } = await d.db().from("task_events").select("seq", { count: "exact", head: true }).eq("task_id", task.id);
  ok(count === 0, "tasks: delete cascades to events");
  ok(await d.deleteProject(A, p1.id), "projects: delete");
  ok((await d.listProjectFiles(A, p1.id)).length === 0, "projects: delete cascades to files");
} catch (err) {
  failures++;
  console.error("ERROR", err);
} finally {
  await cleanup();
  const { count } = await d.db().from("accounts").select("user_id", { count: "exact", head: true }).in("user_id", [A, B]);
  console.log(count === 0 ? "cleanup done" : "cleanup incomplete");
}
console.log(failures ? `\n${failures} failure(s)` : "\nAll repository tests passed");
process.exit(failures ? 1 : 0);
