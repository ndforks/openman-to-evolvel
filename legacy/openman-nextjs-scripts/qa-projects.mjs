// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: projects on /api/projects. Creates throwaway projects (named "QA ..."), exercises the sidebar, the
// create dialog, the "Project created" dialog, the project page (instructions, files, composer), pin, drag reorder,
// rename and delete, and removes everything it made. Never sends a task.
// Run: node scripts/qa.mjs scripts/qa-projects.mjs
// Build errors in files other areas own (the shared dev server recompiles while they work) are reported, not counted.
const OTHER_AREA = /\.\/src\/(app\/api|lib|components\/(settings|pages|automations|ui))\//;
const api = (path, init) => p.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const clickText = (scope, text) => p.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
const closeAll = async () => { for (let i = 0; i < 4 && (await p.has('[role="menu"], [role="dialog"]')); i++) await p.press("Escape"); };
const stamp = Date.now().toString(36);
const NAME = `QA project ${stamp}`;
const mine = async () => ((await api("/api/projects")).body?.projects ?? []).filter((x) => x.name.startsWith("QA ") && x.name.endsWith(stamp));

await p.goto("/app", 3500);
p.takeLogs();

/* create */
await step("sidebar: Projects header + opens Create project", async () => { await p.hover('section[aria-label="Projects"] [role="button"]', 300); await p.click('[aria-label="Create project"]', 700); return p.has("text=Create project"); });
await step("Create project: Create stays disabled until a name is typed", async () => p.eval(`document.querySelector('[role="dialog"] button[type="submit"]').disabled`));
await step("Create project: saves to the server and opens the project page with 'Project created'", async () => {
  await p.type(NAME);
  await p.click('[role="dialog"] button[type="submit"]', 2500);
  const list = await mine();
  const u = await p.url();
  const created = await p.has("text=Project created");
  await p.shot("qa/projects-created-dialog");
  globalThis.__pid = list[0]?.id;
  return list.length === 1 && u === `/app/project/${list[0].id}?created=1` && created;
});
const pid = globalThis.__pid;
await step("Project created: instructions and Get started save, dialog closes", async () => { await p.click("#created-instructions", 200); await p.type("Answer in one short paragraph."); await clickText('[role="dialog"] button', "Get started"); await sleep(1800); const r = await api(`/api/projects/${pid}`); return r.body?.project?.instructions === "Answer in one short paragraph." && !(await p.has('[role="dialog"]')) && (await p.url()) === `/app/project/${pid}`; });
await p.shot("qa/projects-page");
await step("project page: name, Recent, empty state and a bound composer", async () => { const t = await p.eval(`document.querySelector('main').innerText`); const ph = await p.eval(`document.querySelector('main textarea')?.placeholder`); return t.includes(NAME) && /Recent/.test(t) && /Create a new task to get started/.test(t) && ph === "New task in this project" && !(await p.has('main [aria-label="Choose project"]')); });
await step("project page: the instructions card shows the saved text", async () => (await p.eval(`document.querySelector('aside[aria-label="Project details"]').innerText`)).includes("Answer in one short paragraph."));
await step("project page: Edit instructions saves", async () => { await clickText('aside[aria-label="Project details"] button', "Edit"); await sleep(500); await p.click('[aria-label="Project instructions"]', 200); await p.clearField(); await p.type("Be brief."); await clickText('[role="dialog"] button', "Save"); await sleep(1500); const r = await api(`/api/projects/${pid}`); return r.body?.project?.instructions === "Be brief."; });
await step("project page: Upload adds a file; it can be deleted", async () => {
  // Headless Chrome cannot drive the OS file picker, so the hidden input gets a File built in the page.
  await p.eval(`(() => { const i = document.querySelector('input[aria-label="Upload files to this project"]'); const dt = new DataTransfer(); dt.items.add(new File(['hello from qa'], 'qa-notes.txt', { type: 'text/plain' })); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(2500);
  const listed = await p.has("text=qa-notes.txt");
  const files = (await api(`/api/projects/${pid}/files`)).body?.files ?? [];
  await p.hover("text=qa-notes.txt", 300);
  await p.click('[aria-label="Delete qa-notes.txt"]', 1500);
  const after = (await api(`/api/projects/${pid}/files`)).body?.files ?? [];
  return listed && files.length === 1 && after.length === 0;
});
await step("composer: Choose project lists the server's projects", async () => { await p.goto("/app", 3000); await p.click('[aria-label="Choose project"]', 600); const ok = await p.has(`[role="menuitem"] >> 0`) && (await p.eval(`[...document.querySelectorAll('[role="menuitem"]')].some(e => e.innerText.includes(${JSON.stringify(NAME)}))`)); await clickText('[role="menuitem"]', NAME); await sleep(400); return ok && (await p.has(`[aria-label="Project: ${NAME}"]`)); });
await step("composer: the chosen project survives a reload", async () => { await p.reload(3500); return p.has(`[aria-label="Project: ${NAME}"]`); });
await step("composer: picking it again clears it", async () => { await p.click(`[aria-label="Project: ${NAME}"]`, 600); await clickText('[role="menuitem"]', NAME); await sleep(400); return p.has('[aria-label="Choose project"]'); });

/* sidebar row */
const rowSel = `[data-project-row="${pid}"]`;
await step("sidebar: clicking the project opens its page and shows 'No tasks yet' under it", async () => { await p.click(`${rowSel} > button`, 2200); return (await p.url()) === `/app/project/${pid}` && (await p.eval(`document.querySelector('${rowSel}').innerText.includes('No tasks yet')`)); });
await step("sidebar: clicking it again on its page folds the list", async () => { await p.click(`${rowSel} > button`, 600); return !(await p.eval(`document.querySelector('${rowSel}').innerText.includes('No tasks yet')`)); });
await step("project ... menu: Rename, Pin, Delete", async () => { await p.hover(`${rowSel} > button`, 300); await p.click(`${rowSel} button[aria-label^="Project options"]`, 600); const items = await p.eval(`[...document.querySelectorAll('[role="menuitem"]')].map(e=>e.innerText.trim())`); await closeAll(); return JSON.stringify(items) === JSON.stringify(["Rename", "Pin", "Delete"]); });
await step("Pin moves the project into Pinned (saved on the server)", async () => { await p.hover(`${rowSel} > button`, 300); await p.click(`${rowSel} button[aria-label^="Project options"]`, 600); await clickText('[role="menuitem"]', "Pin"); await sleep(1200); const r = await api(`/api/projects/${pid}`); return r.body?.project?.pinned === true && (await p.has(`section[aria-label="Pinned"] ${rowSel}`)); });
await step("Unpin puts it back", async () => { await p.hover(`${rowSel} > button`, 300); await p.click(`${rowSel} button[aria-label^="Project options"]`, 600); await clickText('[role="menuitem"]', "Unpin"); await sleep(1200); const r = await api(`/api/projects/${pid}`); return r.body?.project?.pinned === false && (await p.has(`section[aria-label="Projects"] ${rowSel}`)); });
await step("Rename saves", async () => { await p.hover(`${rowSel} > button`, 300); await p.click(`${rowSel} button[aria-label^="Project options"]`, 600); await clickText('[role="menuitem"]', "Rename"); await sleep(400); await p.clearField(); await p.type(`QA renamed ${stamp}`); await p.press("Enter"); await sleep(1200); const r = await api(`/api/projects/${pid}`); return r.body?.project?.name === `QA renamed ${stamp}` && (await p.eval(`document.querySelector('${rowSel}').innerText.includes('QA renamed')`)); });

/* drag reorder */
const second = await api("/api/projects", json("POST", { name: `QA second ${stamp}` }));
const pid2 = second.body?.project?.id;
await p.reload(3500);
await step("drag a project above another reorders it on the server", async () => {
  const order = async () => ((await api("/api/projects")).body.projects).filter((x) => !x.pinned).map((x) => x.id);
  const before = await order();
  const [from, to] = before.indexOf(pid2) > before.indexOf(pid) ? [pid2, pid] : [pid, pid2];
  // HTML5 drag and drop: dispatch the events the browser would.
  await p.eval(`(() => { const dt = new DataTransfer(); const a = document.querySelector('[data-project-row="${from}"]'), b = document.querySelector('[data-project-row="${to}"]');
    a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); })()`);
  await sleep(100);
  await p.eval(`(() => { const dt = new DataTransfer(); const b = document.querySelector('[data-project-row="${to}"]'); b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
  await sleep(100);
  await p.eval(`(() => { const dt = new DataTransfer(); const b = document.querySelector('[data-project-row="${to}"]'); b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
  await sleep(1500);
  const after = await order();
  return after.indexOf(from) < after.indexOf(to) && after.indexOf(from) === before.indexOf(to);
});

/* delete */
await step("Delete asks first, then removes the project and leaves its page", async () => {
  await p.goto(`/app/project/${pid}`, 3000);
  await p.click('main [aria-label="Project options"]', 600);
  await clickText('[role="menuitem"]', "Delete");
  await sleep(400);
  const asked = await p.has("text=Delete this project?");
  await clickText('[role="dialog"] button', "Delete");
  await sleep(2000);
  const r = await api(`/api/projects/${pid}`);
  return asked && r.status === 404 && (await p.url()) === "/app" && !(await p.has(rowSel));
});
await step("a deleted project's URL says so instead of crashing", async () => { await p.goto(`/app/project/${pid}`, 3000); return p.has("text~=never existed"); });
for (const x of await mine()) await api(`/api/projects/${x.id}`, { method: "DELETE" });
if (pid2) await api(`/api/projects/${pid2}`, { method: "DELETE" });
check("projects: cleanup left no QA projects", (await mine()).length === 0);
check("projects: no console errors during the run", flushLogs("projects run").filter((l) => /^(ERR|EXC)/.test(l) && !/Failed to load resource/.test(l) && !OTHER_AREA.test(l)).length === 0);
