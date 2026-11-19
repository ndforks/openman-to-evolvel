// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: every modal opens by deep link, closes on Escape, on its close button and on an outside click, and has no dead controls.
// Run: node scripts/qa.mjs scripts/qa-modals.mjs
const dlg = () => p.has('[role="dialog"]');
const MODALS = [["search", "Search tasks"], ["create-project", "Create project"], ["upgrade-pro", "Upgrade"], ["team-plan", "team"], ["use-anywhere", "anywhere"]];
for (const [name, word] of MODALS) {
  const openIt = async () => { await p.goto(`/app?modal=${name}`, 2600); };
  await openIt();
  const title = await p.eval(`document.querySelector('[role="dialog"]')?.innerText.slice(0, 200) ?? null`);
  check(`modal ${name} opens by link`, !!title && title.toLowerCase().includes(word.toLowerCase()), (title || "").replace(/\n/g, " / ").slice(0, 90));
  await p.shot(`qa/modal-${name}`);
  await p.press("Escape"); check(`modal ${name}: Escape closes`, !(await dlg()));
  await openIt(); await p.clickAt(name === "use-anywhere" ? 900 : 8, 300); await sleep(400); check(`modal ${name}: outside click closes`, !(await dlg()));
  await openIt();
  if (await p.has('[role="dialog"] [aria-label="Close"]')) { await p.click('[role="dialog"] [aria-label="Close"]', 400); check(`modal ${name}: close button closes`, !(await dlg())); await openIt(); }
  // "Select a folder" opens the operating system's folder picker, which a headless browser cannot show.
  const r = await audit('[role="dialog"]', { reopen: openIt, skip: /^(close|select a folder)$/i });
  check(`modal ${name}: ${r.total} controls respond`, r.dead.length === 0 && r.stuck.length === 0, [r.dead.length ? "dead: " + r.dead.join("; ") : "", r.stuck.length ? "stuck overlay: " + r.stuck.join("; ") : ""].filter(Boolean).join(" | "));
  if (r.notes.length) console.log("    notes:", r.notes.join("; "));
  if (r.external.length) console.log("    external links:", r.external.join("; "));
  flushLogs(`modal ${name}`);
}
// Search: a result opens /app/task/<id>
await p.goto("/app?modal=search", 3000);
const n = await p.eval(`document.querySelectorAll('[role="option"]').length`);
if (n > 1) {
  await p.click('[role="option"] >> 1', 2500);
  const u = await p.url();
  check("search result opens /app/task/<id>", /^\/app\/task\/[^/]+$/.test(u), u);
  const notFound = await p.eval(`/404|not found/i.test(document.body.innerText.slice(0, 400))`);
  check("search result page is not a 404", !notFound);
  await p.goto("/app?modal=search", 3000);
  await p.type("zzzz-no-such-task"); await sleep(300);
  check("search shows an empty note for no match", await p.has("text~=No tasks match"));
  await p.press("Escape");
  await p.goto("/app?modal=search", 3000);
  await p.press("ArrowDown"); await p.press("Enter"); await sleep(2200);
  check("search: arrow + Enter opens a task", /^\/app\/task\//.test(await p.url()), await p.url());
} else check("search has results to click", false, "no tasks listed");
