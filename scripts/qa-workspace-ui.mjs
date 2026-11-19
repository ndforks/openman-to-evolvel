// Scenario: in a real browser, (1) three tasks at once with a limit of 2: the sidebar marks the third "Queued" and the
// task page says so, then it starts by itself; (2) a project task proposes project changes: the card shows the diff and
// "Apply changes" applies them. Cheap Lite runs on the dev computer. Run: node scripts/qa.mjs scripts/qa-workspace-ui.mjs
// Screenshots: /tmp/om-shots/workspace/
const SHOTS = "/tmp/om-shots/workspace";
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const api = (path, init) => p.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const ACTIVE = ["waking", "running", "waiting"];
const waitTask = async (id, until, ms = 240000) => { const t0 = Date.now(); for (;;) { const r = await api(`/api/tasks/${id}`); if (r.body?.task && until(r.body.task, r.body.events ?? [])) return r.body; if (Date.now() - t0 > ms) return r.body; await sleep(2500); } };
const clickText = (scope, label) => p.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || '').trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
const cleanup = [];

try {
  await p.goto("/app", 3500);

  /* ---- queue ---- */
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await api("/api/tasks", json("POST", { prompt: `Run the shell command \`sleep 25\`, then reply with the word q${i}.`, mode: "lite" }));
    ids.push(r.body.task.id);
    cleanup.push(() => api(`/api/tasks/${r.body.task.id}`, json("DELETE")));
  }
  await sleep(3000);
  const queued = (await api("/api/tasks")).body.tasks.find((t) => ids.includes(t.id) && t.queued);
  await step("queue: the sidebar marks the third task Queued", async () => {
    if (!queued) return false;
    await p.goto(`/app/task/${queued.id}`, 4000);
    await p.waitFor(`[data-task-row="${queued.id}"] [aria-label="Queued"]`, 15000);
    return true;
  });
  await step("queue: the task page says it is queued", async () => (await p.eval("document.body.innerText")).match(/Queued/) !== null);
  await p.shot(`${SHOTS}/01-queued.png`);
  await step("queue: it starts by itself and completes", async () => {
    const done = await waitTask(queued.id, (t) => !ACTIVE.includes(t.status), 300000);
    return done?.task?.status === "completed";
  });

  /* ---- proposal card ---- */
  let projectId = null;
  let taskId = null;
  await step("proposal: a project task proposes changes and the card shows the diff", async () => {
    const pr = await api("/api/projects", json("POST", { name: `QA proposal ${Date.now().toString(36)}`, instructions: "Be brief." }));
    projectId = pr.body.project.id;
    cleanup.push(() => api(`/api/projects/${projectId}`, json("DELETE")));
    const t = await api("/api/tasks", json("POST", { mode: "lite", projectId, prompt: 'Update the project from this conversation: add a knowledge file "glossary.md" defining API as Application Programming Interface, and add the line "Use British spelling." to the instructions. Propose it now with the project update tool.' }));
    taskId = t.body.task.id;
    cleanup.push(() => api(`/api/tasks/${taskId}`, json("DELETE")));
    const w = await waitTask(taskId, (tk, ev) => ev.some((e) => e.type === "approval.request" && e.kind === "project-update") || !ACTIVE.includes(tk.status));
    if (!w.events.some((e) => e.type === "approval.request" && e.kind === "project-update")) return false;
    await p.goto(`/app/task/${taskId}`, 5000);
    await p.waitFor("[data-proposal]", 15000);
    const added = await p.eval(`document.querySelectorAll('[data-proposal] [data-diff="add"]').length`);
    const text = await p.eval(`document.querySelector('[data-proposal]').innerText`);
    return added > 0 && /British/.test(text) && /glossary\.md/.test(text);
  });
  await p.shot(`${SHOTS}/02-proposal-card.png`);
  await step('proposal: "Apply changes" on the card updates the project', async () => {
    if (!(await clickText('[role="group"] button', "Apply changes"))) return false;
    await sleep(2500);
    const pr = await api(`/api/projects/${projectId}`);
    return /British/.test(pr.body.project.instructions) && pr.body.files.some((f) => f.name === "glossary.md");
  });
  await p.shot(`${SHOTS}/03-proposal-applied.png`);
  await waitTask(taskId, (t) => !ACTIVE.includes(t.status), 120000);
} finally {
  for (const fn of cleanup.reverse()) await fn().catch(() => null);
}
