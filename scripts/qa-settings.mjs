// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: every Settings tab opens by deep link, shows the right heading, and has no dead controls.
// Run: node scripts/qa.mjs scripts/qa-settings.mjs
const TABS = [["account","Account"],["security","Sign-in & security"],["billing","Usage & Billing"],["general","General"],["shortcuts","Keyboard shortcuts"],["personalization","Personalization"],["connectors","Connectors"],["skills","Skills"],["mail","Mail"],["computers","Computers"],["email","Email"],["phone","Phone"],["wallet","Usage & Billing"],["data-controls","Data controls"],["integrations","Integrations"],["developers","Developers"]];
const only = process.env.TABS ? process.env.TABS.split(",") : null;
const PANE = '[role="dialog"] nav[aria-label="Settings sections"] + div';
const heading = () => p.eval(`document.querySelector('[role="dialog"] h2:not(.sr-only)')?.innerText ?? null`);
for (const [id, label] of TABS) {
  if (only && !only.includes(id)) continue;
  const openTab = async () => { await p.goto(`/app?settings=${id}`, 2600); };
  await openTab();
  const h = await heading();
  check(`settings deep link ?settings=${id}`, !!h && h.toLowerCase().startsWith(label.toLowerCase()), `heading: ${h}`);
  check(`settings ${id}: URL parameter is dropped`, (await p.url()) === "/app");
  await p.shot(`qa/settings-${id}`);
  if (id === "computers") { flushLogs(`settings ${id}`); continue; } // another agent owns this tab
  const r = await audit(PANE, { reopen: openTab, skip: /sign out|log out|delete account/i });
  check(`settings ${id}: ${r.total} controls respond`, r.dead.length === 0 && r.stuck.length === 0, [r.dead.length ? "dead: " + r.dead.join("; ") : "", r.stuck.length ? "stuck overlay: " + r.stuck.join("; ") : ""].filter(Boolean).join(" | "));
  if (r.notes.length) console.log("    notes:", r.notes.join("; "));
  if (r.external.length) console.log("    external links:", r.external.join("; "));
  flushLogs(`settings ${id}`);
}
