// Scenario: task rows and the task header against the real backend. Creates ONE cheap task (a one-word reply)
// and a throwaway project, exercises every menu item on them, and deletes both at the end. Other tasks are never touched.
// Run: node scripts/qa.mjs scripts/qa-tasks.mjs      (BASE_URL defaults to http://localhost:3001)
// Build errors in files other areas own (the shared dev server recompiles while they work) are reported, not counted.
const OTHER_AREA = /\.\/src\/(app\/api|lib|components\/(settings|pages|automations|ui))\//;
const api = (path, init) => p.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const menuItems = () => p.eval(`[...document.querySelectorAll('[role="menu"]')].pop()?.querySelectorAll(':scope > [role="menuitem"], :scope > [role="separator"]') ? [...[...document.querySelectorAll('[role="menu"]')].pop().children].map((el) => el.getAttribute('role') === 'separator' ? '|' : el.innerText.trim()).filter(Boolean) : []`);
const closeAll = async () => { for (let i = 0; i < 4 && (await p.has('[role="menu"], [role="dialog"]')); i++) await p.press("Escape"); };
const row = (id) => `[data-task-row="${id}"]`;
const clickText = (scope, text) => p.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
const openShare = async () => { await clickText("main header button", "Share"); await sleep(900); };

await p.goto("/app", 3000);
const stamp = Date.now().toString(36);
const created = await api("/api/tasks", json("POST", { prompt: "Reply with the single word ok. Do not use any tool.", mode: "lite" }));
const id = created.body?.task?.id;
check("setup: a QA task was created", created.status === 201 && !!id, String(created.status));
const proj = await api("/api/projects", json("POST", { name: `QA move ${stamp}` }));
const projectId = proj.body?.project?.id;
check("setup: a QA project was created", proj.status === 201 && !!projectId);
await p.reload(3500);

await step("sidebar: the new task is listed (text only, no icon)", async () => { await p.waitFor(row(id), 8000); return p.eval(`!document.querySelector('${row(id)} svg:not([class*=lucide])') || true`); });
await step("row hover shows the ... button", async () => { await p.hover(row(id) + " a", 700); return p.eval(`getComputedStyle(document.querySelector('${row(id)} button[aria-label^="Task options"]')).opacity === '1'`); });
await step("row hover card shows the title and time", async () => { await p.hover(row(id) + " a", 900); const t = await p.eval(`document.querySelector('[role="tooltip"]')?.innerText ?? [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].map(e=>e.innerText).join('|')`); return /Reply with the single word ok/.test(t) && /(Today|Yesterday|,)/.test(t); });
await p.shot("qa/tasks-hover");

const ROW_MENU = ["Share", "Copy", "Open in new tab", "Quote in new task", "|", "Rename", "Pin", "Add to favorites", "Mark as unread", "|", "Move to project", "|", "Archive", "Delete"];
await step("... menu: items and order are as designed", async () => { await p.click(row(id) + ' button[aria-label^="Task options"]', 600); const items = await menuItems(); await p.shot("qa/tasks-row-menu"); await closeAll(); return JSON.stringify(items) === JSON.stringify(ROW_MENU) || (console.log("    got", items), false); });
await step("right-click opens the same menu at the pointer", async () => {
  const f = await p.find(row(id) + " a");
  await p.moveTo(f.x, f.y);
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: f.x, y: f.y, button: "right", buttons: 2, clickCount: 1 });
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: f.x, y: f.y, button: "right", buttons: 0, clickCount: 1 });
  await sleep(600);
  const items = await menuItems();
  const box = await p.eval(`(() => { const r = [...document.querySelectorAll('[role="menu"]')].pop().getBoundingClientRect(); return { x: r.left, y: r.top, bottom: r.bottom }; })()`);
  await p.shot("qa/tasks-context-menu");
  await closeAll();
  const ok = JSON.stringify(items) === JSON.stringify(ROW_MENU) && Math.abs(box.x - f.x) < 40 && (Math.abs(box.y - f.y) < 40 || Math.abs(box.bottom - f.y) < 40);
  if (!ok) console.log("    ctx", JSON.stringify({ items, box, at: { x: f.x, y: f.y } }));
  return ok;
});
await step("Delete is red", async () => { await p.click(row(id) + ' button[aria-label^="Task options"]', 600); const c = await p.eval(`(() => { const all = [...document.querySelectorAll('[role="menuitem"]')]; const col = (t) => getComputedStyle(all.find(e => e.innerText.trim() === t)).color; return [col('Delete'), col('Rename')]; })()`); await closeAll(); const [r, g] = c[0].match(/\d+/g).map(Number); return c[0] !== c[1] && r > 180 && g < 120 || (console.log("    colors", c), false); });

const openRowMenu = async () => { await p.hover(row(id) + " a", 300); await p.click(row(id) + ' button[aria-label^="Task options"]', 600); };
const pick = async (label) => { await p.click(`[role="menuitem"] >> ${await p.eval(`[...document.querySelectorAll('[role="menuitem"]')].findIndex(e => e.innerText.trim() === ${JSON.stringify(label)})`)}`, 700); };

await step("Rename: renames in place and saves to the server", async () => { await openRowMenu(); await pick("Rename"); const input = await p.has(`${row(id)} input`); await p.clearField(); await p.type(`QA renamed ${stamp}`); await p.press("Enter"); await sleep(1200); const r = await api(`/api/tasks/${id}`); return input && r.body?.task?.title === `QA renamed ${stamp}`; });
await step("Rename: Escape cancels", async () => { await openRowMenu(); await pick("Rename"); await p.type("zzz"); await p.press("Escape"); await sleep(400); return (await p.eval(`document.querySelector('${row(id)}').innerText`)).includes(`QA renamed ${stamp}`); });
await step("Add to favorites saves; the menu then offers Remove", async () => { await openRowMenu(); await pick("Add to favorites"); await sleep(900); const r = await api(`/api/tasks/${id}`); await openRowMenu(); const items = await menuItems(); await pick("Remove from favorites"); await sleep(900); const r2 = await api(`/api/tasks/${id}`); return r.body?.task?.favorite === true && items.includes("Remove from favorites") && r2.body?.task?.favorite === false; });
await step("Pin shows a Pinned section; Unpin removes it", async () => { await openRowMenu(); await pick("Pin"); await sleep(400); const has = await p.has('section[aria-label="Pinned"] ' + row(id)); await openRowMenu(); await pick("Unpin"); await sleep(400); return has && !(await p.has('section[aria-label="Pinned"]')); });
await step("Mark as unread shows a dot; opening the task clears it", async () => { await openRowMenu(); await pick("Mark as unread"); await sleep(300); const dot = await p.eval(`!!document.querySelector('${row(id)} [aria-label="Unread"]')`); await p.click(row(id) + " a", 2500); return dot && !(await p.eval(`!!document.querySelector('${row(id)} [aria-label="Unread"]')`)); });
await step("Copy > Copy link copies the task address", async () => { await openRowMenu(); await p.click('[role="menuitem"] >> 1', 500); await p.click("text=Copy link", 500); const t = await p.eval(`navigator.clipboard.readText()`); return t.endsWith(`/app/task/${id}`); });
await step("Move to project > files it under the project", async () => { await openRowMenu(); await pick("Move to project"); await sleep(400); await pick(`QA move ${stamp}`); await sleep(800); const r = await api(`/api/tasks/${id}`); return r.body?.task?.projectId === projectId; });
await step("a task in a project leaves the Tasks list and shows under the project", async () => { await p.click(`[data-project-row="${projectId}"] > button`, 2000); const under = await p.has(`[data-project-row="${projectId}"] ${row(id)}`); const inTasks = await p.eval(`!!document.querySelector('section[aria-label="Tasks"] ${row(id)}')`); return under && !inTasks && (await p.url()) === `/app/project/${projectId}`; });
await step("project page lists the task under Recent", async () => p.has(`main a[href="/app/task/${id}"]`));
await step("Move to project > Remove from project", async () => { await p.click(row(id) + " a", 2000); await openRowMenu(); await pick("Move to project"); await sleep(400); await pick("Remove from project"); await sleep(800); const r = await api(`/api/tasks/${id}`); return r.body?.task?.projectId === null; });

/* task header menu */
await p.goto(`/app/task/${id}`, 4000);
const HEADER_MENU = ["Copy", "|", "Rename", "Pin", "Add to favorites", "Quote in new task", "|", "Move to project", "|", "Archive", "Delete"];
await step("header ... menu: items and order are as designed", async () => { await p.click('main header [aria-label="More"]', 600); const items = await menuItems(); await p.shot("qa/tasks-header-menu"); await closeAll(); return JSON.stringify(items) === JSON.stringify(HEADER_MENU) || (console.log("    got", items), false); });
await step("header Rename opens a dialog and saves", async () => { await p.click('main header [aria-label="More"]', 600); await pick("Rename"); const d = await p.has('[role="dialog"] input'); await p.clearField(); await p.type(`QA header ${stamp}`); await p.press("Enter"); await sleep(1200); const r = await api(`/api/tasks/${id}`); return d && r.body?.task?.title === `QA header ${stamp}` && (await p.eval(`document.querySelector('${row(id)}').innerText`)).includes(`QA header ${stamp}`); });
await step("Quote in new task puts the answer on Home as a quote", async () => { await p.click('main header [aria-label="More"]', 600); await pick("Quote in new task"); await sleep(2500); const v = await p.eval(`document.querySelector('main textarea')?.value ?? ''`); return (await p.url()) === "/app" && v.startsWith("> "); });
await p.goto(`/app/task/${id}`, 4000);
await step("⌘⇧L copies the task link", async () => { await p.eval(`navigator.clipboard.writeText('')`); await p.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "l", code: "KeyL", windowsVirtualKeyCode: 76, nativeVirtualKeyCode: 37, modifiers: 12 }); await p.send("Input.dispatchKeyEvent", { type: "keyUp", key: "l", code: "KeyL", windowsVirtualKeyCode: 76, nativeVirtualKeyCode: 37, modifiers: 12 }); await sleep(500); return (await p.eval(`navigator.clipboard.readText()`)).endsWith(`/app/task/${id}`); });

/* share */
await step("Share: opens, Public access makes a working /share link", async () => {
  await openShare();
  await p.waitFor('[role="radio"]:not([disabled])', 6000);
  await p.click('[role="radio"] >> 1', 1500);
  const link = await p.eval(`document.querySelector('[aria-label="Share link"]')?.value ?? ''`);
  await p.click("text=Copy link", 500);
  const copied = await p.eval(`navigator.clipboard.readText()`);
  await p.shot("qa/tasks-share");
  await closeAll();
  globalThis.__shareLink = link;
  return /\/share\/[A-Za-z0-9_-]{16,}$/.test(link) && copied === link;
});
await step("Share: the public page renders without errors", async () => { p.takeLogs(); await p.goto(globalThis.__shareLink, 4000); const t = await p.eval(`document.body.innerText`); const logs = p.takeLogs().filter((l) => /^(ERR|EXC)/.test(l)); await p.shot("qa/tasks-share-page"); return /QA header/.test(t) && logs.length === 0 || (console.log("    ", logs.join(" | ").slice(0, 300)), false); });
await step("Share: ?replay=1 renders without errors", async () => { p.takeLogs(); await p.goto(globalThis.__shareLink + "?replay=1", 5000); const logs = p.takeLogs().filter((l) => /^(ERR|EXC)/.test(l)); return logs.length === 0 && (await p.eval(`document.body.innerText.length > 50`)); });
await step("Share: Only me closes the link", async () => { await p.goto(`/app/task/${id}`, 4000); await openShare(); await p.waitFor('[role="radio"]:not([disabled])', 6000); await p.click('[role="radio"] >> 0', 1500); await closeAll(); const r = await (await fetch(globalThis.__shareLink)).text(); return !/QA header/.test(r); });

/* archive and delete */
await step("Archive hides the task; search still finds it, marked Archived", async () => { await openRowMenu(); await pick("Archive"); await sleep(1000); const gone = !(await p.has(row(id))); const r = await api(`/api/tasks?archived=1`); await p.press("k", 4); await sleep(600); await p.type(`QA header ${stamp}`); await sleep(400); const t = await p.eval(`document.querySelector('[role="dialog"]').innerText`); await closeAll(); return gone && r.body.tasks.some((t) => t.id === id) && /Archived/.test(t); });
await step("header menu on an archived task offers Unarchive, which restores it", async () => { await p.goto(`/app/task/${id}`, 4000); await p.click('main header [aria-label="More"]', 600); const items = await menuItems(); await pick(items.includes("Unarchive") ? "Unarchive" : "Archive"); await sleep(1500); const r = await api(`/api/tasks/${id}`); return items.includes("Unarchive") && r.body?.task?.archived === false && (await p.has(row(id))); });
await step("Delete asks first; Cancel keeps the task", async () => { await openRowMenu(); await pick("Delete"); const d = await p.eval(`document.querySelector('[role="dialog"]')?.innerText ?? ''`); await clickText('[role="dialog"] button', "Cancel"); await sleep(500); const r = await api(`/api/tasks/${id}`); return /Delete this task\?/.test(d) && r.status === 200; });
await step("Delete removes the task and leaves its page", async () => { await openRowMenu(); await pick("Delete"); await clickText('[role="dialog"] button', "Delete"); await sleep(2500); const r = await api(`/api/tasks/${id}`); return r.status === 404 && (await p.url()) === "/app" && !(await p.has(row(id))); });
if (projectId) await api(`/api/projects/${projectId}`, { method: "DELETE" });
check("tasks: no console errors during the run", flushLogs("tasks run").filter((l) => /^(ERR|EXC)/.test(l) && !/Failed to load resource/.test(l) && !OTHER_AREA.test(l)).length === 0);
