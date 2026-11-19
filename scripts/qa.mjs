// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Runs an ad hoc browser scenario against the dev server.
// Usage: node scripts/qa.mjs <scenario.mjs>   or   node scripts/qa.mjs - <<'EOF' ...js... EOF
// The scenario is the body of an async function with these in scope:
//   p (see scripts/cdp.mjs), sleep, check(label, ok, note), step(label, fn), audit(scopeSelector, options), flushLogs(where)
import { readFileSync } from "node:fs";
import { auditControls, launch, sleep } from "./cdp.mjs";

const arg = process.argv[2] ?? "-";
const src = readFileSync(arg === "-" ? 0 : arg, "utf8");
const p = await launch({ width: +(process.env.W ?? 1280), height: +(process.env.H ?? 800) });
const results = [];
const check = (label, ok, note = "") => { results.push({ label, ok: !!ok, note }); console.log(`${ok ? "PASS" : "FAIL"}  ${label}${note ? "  — " + note : ""}`); };
/** Runs one step; a thrown error is recorded as a failure and the run goes on. */
const openLayers = () => p.eval(`[...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]')].map((d) => d.getAttribute('role') + ':' + (d.getAttribute('aria-label') || d.querySelector('h2:not(.sr-only)')?.innerText || d.innerText.slice(0, 24).replace(/\\n/g, ' '))).join(', ')`).catch(() => "?");
const step = async (label, fn) => {
  try { const r = await fn(); if (r !== undefined) check(label, r, r ? "" : `open layers: [${await openLayers()}]`); }
  catch (e) { check(label, false, String(e.message || e).slice(0, 200) + ` | open layers: [${await openLayers()}]`); }
};
const flushLogs = (where) => { const l = p.takeLogs(); if (l.length) console.log(`  console @ ${where}:\n    ` + l.join("\n    ")); return l; };
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const audit = (scope, options) => auditControls(p, scope, options);
  await new AsyncFunction("p", "sleep", "check", "step", "flushLogs", "audit", src)(p, sleep, check, step, flushLogs, audit);
} catch (e) { console.log("SCENARIO ERROR", e); }
flushLogs("end");
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await p.close();
