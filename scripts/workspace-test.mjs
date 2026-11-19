// Project files, fresh instructions, self-updating projects, the idle-folder sweep, run slots and attachment targets,
// for real on the dev computer (cheap Lite runs). Needs the dev server on :3001 with the dev user.
//   node scripts/workspace-test.mjs [files|proposal|sweep|queue|uploads ...]   (all by default)
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);

let failures = 0;
let passes = 0;
const ok = (cond, label, note = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${note ? `  (${note})` : ""}`);
  if (cond) passes++;
  else failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, method = "GET", body, raw) => {
  const r = await fetch(`${BASE}${p}`, { method, headers: { origin: BASE, ...(body !== undefined && !raw ? { "content-type": "application/json" } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ACTIVE = ["waking", "running", "waiting"];
async function waitTask(id, ms = 240_000, until = (t) => !ACTIVE.includes(t.status)) {
  const t0 = Date.now();
  await sleep(2000);
  for (;;) {
    const r = await api(`/api/tasks/${id}`);
    if (r.body?.task && until(r.body.task, r.body.events ?? [])) return r.body;
    if (Date.now() - t0 > ms) return r.body;
    await sleep(2500);
  }
}
const lastReply = (events) => [...(events ?? [])].reverse().find((e) => e.type === "message.completed")?.text ?? "";
const say = (id, text) => api(`/api/tasks/${id}/messages`, "POST", { text, mode: "queue" });

const { OrgoClient } = await jiti.import(path.join(root, "src/lib/orgo/user-client.ts"));
const orgo = new OrgoClient({ apiKey: process.env.ORGO_API_KEY, workspaceId: process.env.ORGO_WORKSPACE_ID || null });
const onComputer = async (cmd) => (await orgo.bash(process.env.ORGO_COMPUTER_ID, `export HOME=/root\n${cmd}`, 60)).output ?? "";

const cleanup = [];
try {
  let projectId = null;
  let taskId = null;
  const CODE = `PELICAN-${Math.floor(Math.random() * 9000 + 1000)}`;

  if (want("files") || want("proposal") || want("sweep")) {
    const p = await api("/api/projects", "POST", { name: `QA workspace ${Date.now().toString(36)}` });
    projectId = p.body?.project?.id;
    cleanup.push(() => api(`/api/projects/${projectId}`, "DELETE"));
    await api(`/api/projects/${projectId}/files`, "POST", { name: "codeword.txt", content: `The codeword is ${CODE}.`, mime: "text/plain" });
    const t = await api("/api/tasks", "POST", {
      prompt: "Read the project's knowledge file and reply with only the codeword it contains. Also save a file named notes.txt in your working folder containing the single word saved.",
      mode: "lite",
      projectId,
    });
    taskId = t.body?.task?.id;
    cleanup.push(() => api(`/api/tasks/${taskId}`, "DELETE"));
    const done = await waitTask(taskId);
    ok(done?.task?.status === "completed", "files: the project task completes", done?.task?.status);
    ok(lastReply(done?.events).includes(CODE), "files: the agent read the project file (codeword in the reply)", lastReply(done?.events).slice(0, 80));
    const ls = await onComputer(`ls /root/tasks/${taskId}/project-files/ 2>&1; cat /root/tasks/${taskId}/notes.txt 2>&1`);
    ok(/codeword\.txt/.test(ls), "files: copied into the task's folder on the computer (project-files/)");
    ok(/saved/i.test(ls), "files: the agent's own file is in the task folder");

    // A file added afterwards does not reach this task (file changes apply to tasks created afterwards).
    await api(`/api/projects/${projectId}/files`, "POST", { name: "late.txt", content: "late", mime: "text/plain" });
    // Instruction edits apply on the next message.
    await api(`/api/projects/${projectId}`, "PATCH", { instructions: "End every reply with the word BANANA." });
    await say(taskId, "Say hi in three words.");
    const again = await waitTask(taskId, 200_000, (tk, ev) => !ACTIVE.includes(tk.status) && ev.filter((e) => e.type === "run.completed").length >= 2);
    ok(/BANANA/i.test(lastReply(again?.events)), "instructions: an edit applies on the next message", lastReply(again?.events).slice(-60));
    const ls2 = await onComputer(`ls /root/tasks/${taskId}/project-files/`);
    ok(!/late\.txt/.test(ls2), "files: a file added later does not reach an existing task");
  }

  if (want("proposal") && taskId) {
    await say(taskId, 'Update the project from this conversation: add the line "Prefer metric units." to its instructions (keep the existing line). Propose it now with the project update tool.');
    const waiting = await waitTask(taskId, 200_000, (tk, ev) => ev.some((e) => e.type === "approval.request" && e.kind === "project-update") || (!ACTIVE.includes(tk.status) && ev.filter((e) => e.type === "run.completed").length >= 3));
    const req = [...(waiting?.events ?? [])].reverse().find((e) => e.type === "approval.request" && e.kind === "project-update");
    ok(!!req, "proposal: the agent proposed project changes (approval card)");
    if (req) {
      const pid = req.requestId.replace(/^ext:project-update:/, "");
      const before = await api(`/api/projects/${projectId}`);
      ok(!/metric/i.test(before.body?.project?.instructions ?? ""), "proposal: nothing changed before approval");
      const view = await api(`/api/projects/proposals/${pid}`);
      const diff = view.body?.proposal?.changes?.instructions;
      ok(view.status === 200 && /metric/i.test(diff?.after ?? "") && /BANANA/.test(diff?.before ?? ""), "proposal: the card's diff has before and after");
      const r = await api(`/api/tasks/${taskId}/respond`, "POST", { requestId: req.requestId, choice: "Apply changes" });
      const after = await api(`/api/projects/${projectId}`);
      ok(r.status === 200 && /metric/i.test(after.body?.project?.instructions ?? ""), "proposal: approving applies it", `respond ${r.status}`);
      const again = await api(`/api/projects/${projectId}/proposals/${pid}`, "POST", { decision: "apply" });
      ok(again.status === 409, "proposal: it cannot be applied twice");
    }
    await waitTask(taskId, 120_000);
  }

  if (want("sweep") && taskId) {
    const { primeConnection } = await jiti.import(path.join(root, "src/lib/agent/server/connection.ts"));
    const { sweepUser, dueForSweep } = await jiti.import(path.join(root, "src/lib/agent/server/hygiene.ts"));
    await primeConnection({ userId: "dev", email: "dev@localhost", name: "Developer", plan: "Free", workspaceId: process.env.ORGO_WORKSPACE_ID || null, dev: true });
    ok(dueForSweep([{ id: "x", status: "completed", updatedAt: new Date().toISOString(), meta: { turns: 1, lastRunAt: new Date().toISOString() } }], Date.now()).length === 0, "sweep: a task used today is not due");
    // As if eight days had passed, for this one task only.
    const r = await sweepUser("dev", Date.now() + 8 * 86_400_000, 7, [taskId]);
    ok(r.swept.includes(taskId), "sweep: the idle task's folder is swept", JSON.stringify(r));
    const gone = await onComputer(`[ -d /root/tasks/${taskId} ] && echo there || echo gone`);
    ok(gone.includes("gone"), "sweep: the folder is gone from the computer");
    const t = await api(`/api/tasks/${taskId}`);
    ok(t.status === 200, "sweep: the task itself stays");
    await say(taskId, "Print the contents of notes.txt in your working folder, then list the project-files folder.");
    const back = await waitTask(taskId, 200_000, (tk, ev) => !ACTIVE.includes(tk.status) && ev.some((e) => e.type === "status" && /Restoring/.test(e.brief ?? "")));
    const ls = await onComputer(`cat /root/tasks/${taskId}/notes.txt 2>&1; ls /root/tasks/${taskId}/project-files/ 2>&1`);
    ok(/saved/i.test(ls) && /codeword\.txt/.test(ls), "sweep: reopening restores delivered files and project files", ls.replace(/\n/g, " ").slice(0, 120));
    ok(/saved/i.test(lastReply(back?.events)), "sweep: the agent reads the restored file", lastReply(back?.events).slice(0, 80));
  }

  if (want("queue")) {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const t = await api("/api/tasks", "POST", { prompt: `Run the shell command \`sleep 20\` and then reply with the word done${i}. Do nothing else.`, mode: "lite" });
      ids.push(t.body?.task?.id);
      cleanup.push(() => api(`/api/tasks/${t.body?.task?.id}`, "DELETE"));
    }
    await sleep(4000);
    const list = await api("/api/tasks");
    const mine = (list.body?.tasks ?? []).filter((t) => ids.includes(t.id));
    const queued = mine.filter((t) => t.queued);
    ok(queued.length >= 1, "queue: with a limit of 2, the third task is queued", mine.map((t) => `${t.status}${t.queued ? "/queued" : ""}`).join(", "));
    const q = queued[0] ? await api(`/api/tasks/${queued[0].id}`) : null;
    ok(!!q?.body?.events?.some((e) => e.type === "status" && /^Queued/.test(e.brief ?? "")), "queue: the queued task shows a Queued status");
    const results = await Promise.all(ids.map((id) => waitTask(id, 300_000)));
    ok(results.every((r) => r?.task?.status === "completed"), "queue: every task starts by itself and completes", results.map((r) => r?.task?.status).join(","));
    const starts = results.map((r) => Date.parse(r.events.find((e) => e.type === "status" && e.status === "running")?.at ?? 0));
    ok(Math.max(...starts) - Math.min(...starts) > 10_000, "queue: the queued one started after a slot freed");
  }

  if (want("uploads")) {
    const name = encodeURIComponent("qa-note.txt");
    const bytes = new TextEncoder().encode("hello attachment");
    const upload = (extra) => api(`/api/tasks/uploads?upload=${"a".repeat(23)}${Math.floor(Math.random() * 10)}&name=${name}&size=${bytes.length}&part=0&parts=1${extra}`, "POST", undefined, bytes);
    const bogus = await upload("&target=not-a-computer-of-mine");
    ok(bogus.status === 404, "uploads: a computer that is not the user's is refused", String(bogus.status));
    const badTask = await upload("&task=doesnotexist123");
    ok(badTask.status === 404, "uploads: an unknown task is refused");
    const home = await upload("");
    ok(home.status === 201 && /^\/root\/uploads\//.test(home.body?.file?.path ?? ""), "uploads: the home computer still takes attachments");
  }
} catch (err) {
  console.log("ERROR", err);
  failures++;
} finally {
  for (const fn of cleanup.reverse()) await fn().catch(() => null);
}
console.log(`\n${passes}/${passes + failures} passed`);
process.exit(failures ? 1 : 0);
