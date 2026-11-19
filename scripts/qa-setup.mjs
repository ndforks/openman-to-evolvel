// Scenario: first run and sign out. `/app?setup=1` shows the setup screen even for a ready account, runs
// POST /api/me/provision, follows its progress and lands on Home. Then Sign out from the user menu.
// Run: node scripts/qa.mjs scripts/qa-setup.mjs
// Build errors in files other areas own (the shared dev server recompiles while they work) are reported, not counted.
const OTHER_AREA = /\.\/src\/(app\/api|lib|components\/(settings|pages|automations|ui))\//;
const api = (path, init) => p.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);

await p.goto("/app", 3000);
const status = await api("/api/me/provision");
check("provision status answers", status.status === 200 && typeof status.body?.state === "string", status.body?.state);
await step("/app: a ready account goes straight to Home (no setup screen)", async () => status.body?.state !== "ready" || ((await p.has("text=What should we get done?")) && !(await p.has("text=Setting up your computer"))));

await p.eval(`sessionStorage.clear()`);
await p.goto("/app?setup=1", 800);
await step("?setup=1: the setup screen shows its steps and a progress bar", async () => { const t = await p.eval(`document.querySelector('main').innerText`); await p.shot("qa/setup-screen"); return /(Setting up your computer|Your computer is ready)/.test(t) && /Create your computer/.test(t) && (await p.has('[role="progressbar"]')); });
await step("?setup=1: setup finishes and lands on Home", async () => { for (let i = 0; i < 40; i++) { await sleep(500); if ((await p.url()) === "/app" && (await p.has("text=What should we get done?"))) return true; } return false; });
await step("after setup the account is ready", async () => (await api("/api/me/provision")).body?.state === "ready");

await step("user menu: Sign out is red and ends the session", async () => {
  await p.click('[aria-label^="Account menu"]', 600);
  const color = await p.eval(`(() => { const all = [...document.querySelectorAll('[role="menuitem"]')]; const s = all.find(e => e.innerText.trim() === 'Sign out'); const a = all.find(e => e.innerText.trim() === 'Account'); return [getComputedStyle(s).color, getComputedStyle(a).color]; })()`);
  await p.eval(`window.__signout = 0; const f = window.fetch; window.fetch = (u, i) => { if (String(u).includes('/api/auth/signout')) window.__signout++; return f(u, i); }`);
  const idx = await p.eval(`[...document.querySelectorAll('[role="menuitem"]')].findIndex(e => e.innerText.trim() === 'Sign out')`);
  await p.click(`[role="menuitem"] >> ${idx}`, 2500);
  const u = await p.url();
  return color[0] !== color[1] && !u.startsWith("/app");
});
check("setup: no console errors during the run", flushLogs("setup run").filter((l) => /^(ERR|EXC)/.test(l) && !/Failed to load resource/.test(l) && !OTHER_AREA.test(l)).length === 0);
