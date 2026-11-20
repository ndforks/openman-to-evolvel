// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: how a task behaves beyond one conversation, against the real backend and the dev computer's Hermes:
// Chat mode (+ and / entry, no computer panel, one-way "Switch to Agent"), Branch, task references (chips, the agent
// reads them through the omtools bridge), side chat, Plan mode (plan card, Confirm), the file viewer, parallel tasks
// (the "Allow these actions?" card and progress card), collaboration (invite and remove, and the collaborator's
// view), the mode picker's Flex entry, the generator panel and inline batch research card, and the long-task card.
// Runs cheap Lite tasks (one-word answers) and deletes every task it made at the end. Other tasks are never changed.
// Run: node scripts/qa.mjs scripts/qa-task-behaviour.mjs      (BASE_URL defaults to http://localhost:3001)
const { loadEnv } = await import(new URL("./env.mjs", "file://" + process.cwd() + "/scripts/").href);
const { sessionCookie } = await import(new URL("./qa-session.mjs", "file://" + process.cwd() + "/scripts/").href);
loadEnv();
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const api = (path, init) => p.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const clickText = (scope, text) => p.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
const text = () => p.eval(`document.querySelector('main, body').innerText`);
const path = () => p.eval(`location.pathname`);
const made = new Set();
const remember = (id) => id && made.add(id);
const waitTask = async (id, ms = 150000) => { const t0 = Date.now(); await sleep(1500); for (;;) { const r = await api(`/api/tasks/${id}`); const s = r.body?.task?.status; if (s && !["waking", "running", "waiting"].includes(s)) return r.body; if (Date.now() - t0 > ms) return r.body; await sleep(2000); } };
const typeInto = async (sel, value) => { await p.click(sel, 200); await p.type(value); };

/* ---- home: Chat and Plan only from + and / ---- */
await p.goto("/app", 4000);
await step("home: the old Chat mode button is gone (Chat is entered from + or /)", async () => !(await p.has('[data-testid="chat-input-composer"] button[aria-label="Chat mode"]')));
await step("home: / lists Plan and Chat mode", async () => { await typeInto('textarea[aria-label^="Describe a job"]', "/"); await sleep(500); const items = await p.eval(`[...document.querySelectorAll('#composer-slash-menu [role=option]')].map(e => e.innerText.split('\\n')[0])`); return items.includes("Plan") && items.includes("Chat mode"); });
await step("home: picking Chat mode shows the Chat chip", async () => { await clickText("#composer-slash-menu [role=option] span", "Chat mode"); await sleep(400); return p.has('[data-interaction-chip="chat"]'); });
await step("home: + menu offers Chat mode and Plan mode", async () => { await p.click('button[aria-label="Add files and more"]', 500); const items = await p.eval(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(e => e.innerText.trim())`); await p.press("Escape"); return items.includes("Chat mode") && items.includes("Plan mode"); });
await p.shot("qa/behaviour-home-chat-chip");

/* ---- Chat mode task ---- */
let chatId = null;
await step("chat: sending creates a Chat task and opens it", async () => {
  await p.click('textarea[aria-label^="Describe a job"]', 200);
  await p.type("What is 2+2? Reply with just the number.");
  await p.press("Enter");
  for (let i = 0; i < 40 && !/\/app\/task\//.test(await path()); i++) await sleep(300);
  chatId = (await path()).split("/").pop();
  remember(chatId);
  const r = await api(`/api/tasks/${chatId}`);
  return r.body?.task?.interaction === "chat";
});
await step("chat: the answer arrives with no computer panel or thumbnail", async () => { await waitTask(chatId); await sleep(1500); return /\b4\b/.test(await text()) && (await p.has("[data-chat-bar]")) && !(await p.has('button[aria-label="Open side panel"]')) && !(await p.has('button[aria-label$="desktop"]')); });
await p.shot("qa/behaviour-chat");
await step("chat: Switch to Agent continues the same task as an agent", async () => { await clickText("[data-chat-bar] button", "Switch to Agent"); await p.waitFor('[data-marker="interaction"]', 15000); const r = await api(`/api/tasks/${chatId}`); return r.body?.task?.interaction === "agent" && !(await p.has("[data-chat-bar]")) && (await path()).endsWith(chatId); });

/* ---- Branch ---- */
let branchId = null;
await step("branch: the control under a reply opens '<title> (branch)' with a Branched from divider", async () => {
  await p.hover('button[aria-label="Branch from this reply"]', 300);
  await p.click('button[aria-label="Branch from this reply"]', 500);
  for (let i = 0; i < 40 && (await path()).endsWith(chatId); i++) await sleep(400);
  branchId = (await path()).split("/").pop();
  remember(branchId);
  await p.waitFor('[data-marker="branched"]', 15000);
  const r = await api(`/api/tasks/${branchId}`);
  return branchId !== chatId && / \(branch\)$/.test(r.body?.task?.title ?? "") && r.body?.task?.branchedFrom?.taskId === chatId && /\b4\b/.test(await text());
});
await p.shot("qa/behaviour-branch");

/* ---- Task references ---- */
await step("references: + > Recent tasks adds a chip to the message", async () => {
  await p.click('button[aria-label="Add files and more"]', 500);
  await clickText('[role=menu] [role=menuitem]', "Recent tasks");
  await sleep(600);
  const ok = await p.eval(`(() => { const el = document.querySelector('[data-reference-task="${chatId}"]'); if (el) el.click(); return !!el; })()`);
  await sleep(500);
  return ok && (await p.has(`[data-ref-chip="${chatId}"]`));
});
await step("references: the agent reads the referenced task through the task tools", async () => {
  await p.click('textarea[aria-label="Follow up with OpenMan"]', 200);
  await p.type("Using your omtools task tools on the task I referenced, what number did it answer? Reply with just the number.");
  await p.press("Enter");
  await sleep(2500);
  const done = await waitTask(branchId);
  const usedTool = (done?.events ?? []).some((e) => e.type === "tool.started" && /omtools__task_(outline|read|search)/.test(e.tool));
  await sleep(1200);
  return usedTool && (await p.has(`[data-ref-chip="${chatId}"]`)) && (done.task.references ?? []).some((r) => r.id === chatId);
});

/* ---- Side chat ---- */
await step("side chat: opens next to the task and answers from the main task's context", async () => {
  await p.click('button[aria-label="Side chat"]', 500);
  await p.waitFor("[data-side-chat]", 5000);
  await p.click('textarea[aria-label="Start a side chat"]', 200);
  await p.type("What number did the main task answer? Just the number.");
  await p.click('button[aria-label="Start side chat"]', 800);
  const list = await api(`/api/tasks/${branchId}/side-chats`);
  const sideId = list.body?.sideChats?.[0]?.id;
  remember(sideId);
  if (!sideId) return false;
  await waitTask(sideId);
  await sleep(2000);
  const inPanel = await p.eval(`document.querySelector('[data-side-chat]').innerText`);
  const listed = await api("/api/tasks");
  return /\b4\b/.test(inPanel) && !listed.body.tasks.some((t) => t.id === sideId);
});
await p.shot("qa/behaviour-side-chat");
await p.click('button[aria-label="Close side chat"]', 300).catch(() => undefined);

/* ---- Plan mode, Confirm, file viewer ---- */
let planId = null;
await p.goto("/app", 3500);
await step("plan: / > Plan sets Plan mode and the task returns an editable plan card", async () => {
  await typeInto('textarea[aria-label^="Describe a job"]', "/plan");
  await sleep(500);
  await clickText("#composer-slash-menu [role=option] span", "Plan");
  await sleep(300);
  if (!(await p.has('[data-interaction-chip="plan"]'))) return false;
  await p.type("Write a file named qa-plan.txt containing the single word ok in my task folder. No questions needed.");
  await p.press("Enter");
  for (let i = 0; i < 40 && !/\/app\/task\//.test(await path()); i++) await sleep(300);
  planId = (await path()).split("/").pop();
  remember(planId);
  await waitTask(planId);
  await p.waitFor("[data-plan-card]", 20000);
  return (await p.eval(`!!document.querySelector('[data-plan-card] button') && [...document.querySelectorAll('[data-plan-card] button')].some(b => b.innerText.trim() === 'Confirm')`)) && (await api(`/api/tasks/${planId}`)).body.task.status === "completed";
});
await p.shot("qa/behaviour-plan-card");
await step("plan: nothing ran before Confirm (no tool calls, no files)", async () => { const r = await api(`/api/tasks/${planId}`); return !r.body.events.some((e) => e.type === "tool.started" && !/omtools|clarify|todo|web/.test(e.tool)) && !r.body.events.some((e) => e.type === "file.created"); });
await step("plan: Confirm runs the plan as an agent and the file arrives", async () => {
  await clickText("[data-plan-card] button", "Confirm");
  await sleep(2500);
  const done = await waitTask(planId, 200000);
  return done.task.interaction === "agent" && done.events.some((e) => e.type === "file.created" && /qa-plan\.txt$/.test(e.name));
});
await step("files: a delivered file opens in the artifact viewer next to the conversation", async () => {
  await p.reload(4000);
  const opened = await p.eval(`(() => { const c = [...document.querySelectorAll('button, [role=button]')].find(e => /qa-plan\\.txt/.test(e.innerText || '') && !e.closest('[data-file-aside]')); if (c) c.click(); return !!c; })()`);
  if (!opened) return false;
  await p.waitFor("[data-file-aside]", 8000);
  for (let i = 0; i < 20 && !/\bok\b/.test(await p.eval(`document.querySelector('[data-file-aside]')?.innerText ?? ''`)); i++) await sleep(500);
  return /\bok\b/.test(await p.eval(`document.querySelector('[data-file-aside]').innerText`));
});
await p.shot("qa/behaviour-file-viewer");

/* ---- Parallel tasks ---- */
let parId = null;
await step("parallel: 'Allow these actions?' card, then the parallel tasks card shows both results", async () => {
  const c = await api("/api/tasks", json("POST", { prompt: "Split this into 2 parallel tasks with create_parallel_tasks: task A replies with just the word alpha, task B replies with just the word beta (no tools). Then check parallel_tasks_status every ~10 seconds (at most 6 times) and report both results in one line.", mode: "lite" }));
  parId = c.body?.task?.id;
  remember(parId);
  await p.goto(`/app/task/${parId}`, 3000);
  let card = false;
  for (let i = 0; i < 60 && !card; i++) { card = await p.eval(`[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Allow in this task')`); if (!card) await sleep(1000); }
  if (!card) return false;
  await p.shot("qa/behaviour-parallel-card");
  await clickText("button", "Allow in this task");
  const done = await waitTask(parId, 200000);
  const kids = await api(`/api/tasks/${parId}/children`);
  (kids.body?.tasks ?? []).forEach((k) => remember(k.id));
  await sleep(4500);
  const shown = await p.eval(`document.querySelectorAll('[data-child-task]').length`);
  return done.task.status === "completed" && kids.body.tasks.length === 2 && shown === 2 && /alpha/i.test(await text()) && /beta/i.test(await text());
});
await p.shot("qa/behaviour-parallel-done");

/* ---- Collaboration ---- */
const collabEmail = `qa-collab-${Date.now().toString(36)}@example.com`;
await step("collaboration: the owner invites by email and sees the person listed", async () => {
  await p.click('button[aria-label="Collaborate"]', 600);
  await p.click('input[aria-label="Email to invite"]', 200);
  await p.type(collabEmail);
  await clickText('[aria-label="Collaborators"] button', "Invite");
  await p.waitFor(`[data-member="${collabEmail}"]`, 8000);
  return true;
});
await p.shot("qa/behaviour-collab");
await step("collaboration: the invitee can read and prompt, but not watch the computer or change the task", async () => {
  const cookie = sessionCookie({ userId: `qa-collab-${Date.now().toString(36)}`, email: collabEmail, name: "QA Collaborator" });
  const h = { cookie };
  const get = (u, init = {}) => fetch(BASE + u, { ...init, headers: { ...h, ...(init.headers ?? {}) } }).then((r) => r.status);
  const read = await get(`/api/tasks/${parId}`);
  const prompt = await get(`/api/tasks/${parId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Reply with the single word ok. No tools.", mode: "queue" }) });
  const computer = await get(`/api/tasks/${parId}/computer`);
  const patch = await get(`/api/tasks/${parId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) });
  const other = await get(`/api/tasks/${planId}`);
  const shared = await fetch(BASE + "/api/tasks/shared", { headers: h }).then((r) => r.json()).catch(() => ({}));
  const listed = (shared.tasks ?? []).some((t) => t.id === parId && t.invitedBy);
  console.log("    collaborator:", { read, prompt, computer, patch, other, listedInSharedWithYou: listed });
  await waitTask(parId, 90000);
  return read === 200 && prompt === 200 && computer === 403 && patch === 403 && other === 404 && listed;
});
await step("collaboration: the owner removes the person; they lose access", async () => {
  await p.click(`button[aria-label="Remove ${collabEmail}"]`, 800);
  const gone = await p.waitGone(`[data-member="${collabEmail}"]`, 6000);
  await p.press("Escape");
  const st = await fetch(`${BASE}/api/tasks/${parId}`, { headers: { cookie: sessionCookie({ userId: "qa-collab-x", email: collabEmail, name: "x" }) } }).then((r) => r.status);
  return gone && st === 404;
});

/* ---- Long task: Hermes compaction in the work log and "continue in a new task" ---- */
await step("long task: a compaction shows in the work log with "Start a fresh task", which inherits summary and files", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret = process.env.APP_DB_SECRET;
  const last = (await api(`/api/tasks/${planId}`)).body.events.reduce((m, e) => Math.max(m, e.seq), 0);
  // Stands in for a real compaction (which needs a context of 100k+ tokens): the event the relay writes when Hermes' transcript shows one.
  const ins = await fetch(`${url}/rest/v1/task_events`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "x-om-secret": secret, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify((() => { const at = new Date().toISOString(); const ev = { type: "context.compacted", seq: last + 1, at, long: true, summary: "QA summary: the agent wrote qa-plan.txt containing ok." }; return { task_id: planId, seq: last + 1, user_id: "dev", at, type: ev.type, payload: ev }; })()) });
  if (!ins.ok) { console.log("    long task: event insert failed", ins.status, await ins.text().catch(() => "")); return false; }
  await p.goto(`/app/task/${planId}`, 4500);
  const notice = await p.has('[data-notice="compacted"]'), card = await p.has("[data-long-task]");
  if (!notice || !card) { console.log("    long task:", { notice, card }); return false; }
  await p.shot("qa/behaviour-long-task");
  await clickText("[data-long-task] button", "Start a fresh task");
  for (let i = 0; i < 40 && (await path()).endsWith(planId); i++) await sleep(400);
  const contId = (await path()).split("/").pop();
  remember(contId);
  await p.waitFor('[data-marker="inherited"]', 10000);
  const r = await api(`/api/tasks/${contId}`);
  const titled = / \(continued\)$/.test(r.body?.task?.title ?? ""), inherited = (r.body?.events ?? []).some((e) => e.type === "file.created" && /qa-plan\.txt$/.test(e.name));
  if (!titled || !inherited) console.log("    long task:", { contId, titled, inherited, title: r.body?.task?.title, files: (r.body?.events ?? []).filter((e) => e.type === "file.created").map((e) => e.name) });
  return titled && inherited;
});

/* ---- Mode picker: Flex only as Orgo's own-key state ---- */
await p.goto("/app", 3500);
await step("mode picker: Flex appears only as 'Your Anthropic key' with a link to Orgo Secrets (when Orgo reports one)", async () => {
  const mk = await api("/api/tasks/model-key");
  await p.click('button[aria-label^="Agent mode"]', 600);
  const flex = await p.has("[data-mode-flex]");
  const link = await p.eval(`document.querySelector('[data-mode-flex] a')?.href ?? ''`);
  await p.shot("qa/behaviour-mode-picker");
  await p.press("Escape");
  return mk.body.ownKey ? flex && link === "https://www.orgo.ai/settings/secrets" : !flex;
});

/* ---- Generators ---- */
await step("generators: a generator task shows its output in the side panel", async () => {
  const list = (await api("/api/tasks")).body.tasks.filter((t) => /^Create slides|^Make a slide deck|^Research these/.test(t.title)).slice(0, 6);
  for (const t of list) {
    const st = await p.eval(`fetch('/api/generators/${t.id}', { headers: { accept: 'application/json' } }).then(r => r.json()).catch(() => ({}))`);
    if (!st.kind) continue;
    await p.goto(`/app/task/${t.id}`, 6000);
    const ok = await p.has("[data-generator-panel]");
    await p.shot("qa/behaviour-generator");
    return ok;
  }
  console.log("    (no finished generator task to open)");
  return undefined;
});
let researchId = null;
await step("generators: batch research asks for confirmation inline, with the cost, and Cancel runs nothing", async () => {
  const c = await api("/api/generators/start", json("POST", { kind: "research", prompt: "Research these 6 fruits: apple, banana, cherry, mango, kiwi, plum. For each find its typical color and origin region.", mode: "lite" }));
  researchId = c.body?.task?.id;
  remember(researchId);
  if (!researchId) return c.status === 400 ? undefined : false;
  await p.goto(`/app/task/${researchId}`, 3000);
  let card = false;
  for (let i = 0; i < 90 && !card; i++) { card = await p.eval(`!!document.querySelector('main section[aria-label="Batch research"]') && [...document.querySelectorAll('section[aria-label="Batch research"] button')].some(b => /^Run all \\d+$/.test(b.innerText.trim()))`); if (!card) await sleep(1500); }
  if (!card) { const st = await p.eval(`fetch('/api/generators/${researchId}', { headers: { accept: 'application/json' } }).then(r => r.json()).catch(() => ({}))`); console.log("    research state:", JSON.stringify(st).slice(0, 300)); return false; }
  await p.shot("qa/behaviour-batch-research");
  await p.eval(`[...document.querySelectorAll('section[aria-label="Batch research"] button')].find(b => b.innerText.trim() === 'Cancel').click()`);
  await sleep(1500);
  return /Cancelled before anything ran\./.test(await text());
});

flushLogs("behaviour");

/* ---- cleanup ---- */
for (const id of [...made].reverse()) {
  await api(`/api/tasks/${id}/stop`, { method: "POST" }).catch(() => undefined);
  await api(`/api/tasks/${id}`, { method: "DELETE" }).catch(() => undefined);
}
check(`cleanup: ${made.size} QA tasks deleted`, true);
