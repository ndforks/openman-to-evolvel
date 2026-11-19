// Scenario: each sidebar page loads without console errors and has no dead controls.
// Run: node scripts/qa.mjs scripts/qa-pages.mjs      (PAGES=/app/library,/app/skills to limit)
const PAGES = (process.env.PAGES ?? "/app/library,/app/websites,/app/automations,/app/automations/new,/app/plugins,/app/skills,/app/personalization,/app/computer-use").split(",");
for (const path of PAGES) {
  const openIt = async () => { await p.goto(path, 2800); };
  await openIt();
  const logs = flushLogs(path);
  check(`${path} loads without console errors`, logs.filter((l) => !l.startsWith("WARN")).length === 0);
  // "Import memory" opens a panel that an earlier click in the same pass has already opened (covered in qa-extras.mjs).
  const r = await audit("main", { reopen: openIt, skip: /^(send|voice input|import memory)$/i });
  check(`${path}: ${r.total} controls respond`, r.dead.length === 0 && r.stuck.length === 0, [r.dead.length ? "dead: " + r.dead.join("; ") : "", r.stuck.length ? "stuck overlay: " + r.stuck.join("; ") : ""].filter(Boolean).join(" | "));
  if (r.notes.length) console.log("    notes:", r.notes.join("; ").slice(0, 1500));
  if (r.external.length) console.log("    external links:", r.external.join("; ").slice(0, 600));
  flushLogs(path + " (after clicks)");
}
