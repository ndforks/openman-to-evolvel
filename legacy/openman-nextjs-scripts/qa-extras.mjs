// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: flows that cross areas. Share panel, personalization, plugins and connectors, prompt hand-off, library.
// Run: node scripts/qa.mjs scripts/qa-extras.mjs     (SEND=1 also sends one real task from the landing page)
const dlg = () => p.has('[role="dialog"]');
const val = () => p.eval(`document.querySelector('main textarea').value`);
const tasks = await (await fetch((process.env.BASE_URL ?? "http://localhost:3001") + "/api/tasks")).json().catch(() => ({ tasks: [] }));
const taskId = tasks.tasks?.find((t) => t.status === "completed")?.id;

/* Share panel (opened from the task header, which another area owns) */
if (taskId) {
  await p.goto(`/app/task/${taskId}`, 4500);
  const share = async () => { const f = (await p.find('main button[aria-label="Share"]')) || (await p.find("text=Share")); await p.clickAt(f.x, f.y); await sleep(700); return f; };
  await step("Share: opens under the Share button", async () => { const b = await share(); const r = await p.eval(`(()=>{const d=document.querySelector('[role="dialog"]'); if(!d) return null; const r=d.getBoundingClientRect(); return {t:r.top,w:r.width}})()`); return !!r && r.w === 400 && Math.abs(r.t - (b.y + b.h / 2 + 4)) < 3; });
  await step("Share: Anyone with the link, then Copy link copies it", async () => { await p.click('[role="radio"] >> 1', 600); await p.click("text=Copy link", 500); const t = await p.eval(`document.querySelector('[role="dialog"]').innerText`); return /Link copied/.test(t) && /Anyone with the link/.test(t); });
  await step("Share: the shared task is listed in Settings > Data controls", async () => { await p.press("Escape"); await p.goto(`/app?settings=data-controls`, 3000); const t = await p.eval(`document.querySelector('[role="dialog"]').innerText`); await p.press("Escape"); return /Shared/i.test(t); });
  await p.goto(`/app/task/${taskId}`, 4000);
  // Orgo has no team sharing of a task, so the panel offers Only me and Public access (no Collaborate tab).
  await step("Share: Private makes the link private again", async () => { await share(); await p.click('[role="radio"] >> 0', 600); return (await p.has("text~=only works for you")) && (await p.has("text=Copy link")); });
  await step("Share: Escape closes", async () => { await p.press("Escape"); return !(await dlg()); });
  await step("Share: outside click closes", async () => { await share(); await p.clickAt(400, 600); await sleep(500); return !(await dlg()); });
  await p.eval(`localStorage.removeItem('openman:pref:share.tasks')`);
} else check("Share: a finished task exists to test with", false);

/* Personalization: page and Settings tab share one profile */
await p.goto("/app/personalization", 3000);
const profileBefore = await p.eval(`[document.querySelector('main input')?.value ?? '', document.querySelector('main textarea')?.value ?? '']`);
await step("Personalization: edit shows Save and Cancel; Save confirms", async () => { await p.click("main input >> 0", 200); await p.clearField(); await p.type("Ada"); await p.click("main textarea >> 0", 200); await p.clearField(); await p.type("Based in SF."); const dirty = (await p.has("text=Save")) && (await p.has("text=Cancel")); await p.click("text=Save", 600); return dirty && (await p.has("text=Saved")); });
await step("Personalization: reload keeps it", async () => { await p.reload(3000); return (await p.eval(`document.querySelector('main input').value`)) === "Ada"; });
await step("Personalization: Settings tab shows the same profile", async () => { await p.goto("/app?settings=personalization", 3000); const v = await p.eval(`[...document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea')].map(e=>e.value)`); await p.press("Escape"); return v.includes("Ada") && v.includes("Based in SF."); });
await step("Personalization: Cancel reverts an edit", async () => { await p.goto("/app/personalization", 3000); await p.click("main input >> 0", 200); await p.type("XYZ"); await p.click("text=Cancel", 400); return (await p.eval(`document.querySelector('main input').value`)) === "Ada"; });
await step("Personalization: Knowledge tab and both Import memory buttons respond", async () => { await p.click('main [role="tab"] >> 1', 500); const k = /Nothing saved yet|\d+ \/ 50/.test(await p.eval(`document.querySelector('main').innerText`)); await p.click('main [role="tab"] >> 0', 500); await p.eval(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Import memory')?.click()`); await sleep(700); const a = await p.has("text~=Paste this prompt into your other assistant"); await p.eval(`document.querySelector('main button[aria-expanded="true"]')?.click()`); await sleep(400); await p.eval(`document.querySelector('main button[aria-expanded="false"]')?.click()`); await sleep(600); const b = await p.has("text~=Paste this prompt into your other assistant"); return k && a && b; });
await p.eval(`localStorage.removeItem('om.personalization.v1')`);
// The profile is stored on the server now: put back what was there before the run.
await p.goto("/app/personalization", 2500); await p.click("main input >> 0", 200); await p.clearField(); if (profileBefore[0]) await p.type(profileBefore[0]); await p.click("main textarea >> 0", 200); await p.clearField(); if (profileBefore[1]) await p.type(profileBefore[1]); if (await p.has("text=Save")) await p.click("text=Save", 600);

/* Plugins, Settings > Connectors and the composer menu share the added connectors */
await p.goto("/app/plugins", 3000);
// Connectors are Orgo's (Composio underneath): "Connect" opens the app's connector dialog; finishing needs a real sign-in.
// Gmail may already be connected on the account under test; its button then reads "Gmail is connected. Manage".
await step("Plugins: Connect Gmail opens the Gmail connector dialog", async () => { await p.click('[aria-label="Connect Gmail"], [aria-label="Gmail is connected. Manage"]', 900); const t = await p.eval(`document.querySelector('[role="dialog"]')?.innerText ?? ''`); await p.press("Escape"); await sleep(300); return /Gmail/.test(t) && !(await dlg()); });
await step("Plugins: Manage Connectors opens Settings > Connectors", async () => { await p.click("text=Manage Connectors", 900); const t = await p.eval(`document.querySelector('[role="dialog"]')?.innerText ?? ''`); await p.press("Escape"); return /Connectors[\s\S]*Browse Connectors/.test(t); });
await step("Plugins: Create menu offers Custom MCP and Custom API; each opens the custom connector form", async () => { await p.click('[aria-label="Create"]', 500); const items = await p.eval(`[...document.querySelectorAll('[role="menuitem"]')].map(i => i.innerText.split('\\n')[0])`); await p.click('[role="menu"] [role="menuitem"] >> 0', 800); const t = await p.eval(`document.querySelector('[role="dialog"]')?.innerText ?? ''`); await p.press("Escape"); return items.includes("Custom MCP") && items.includes("Custom API") && /Add a custom connector/.test(t); });
await step("Composer connectors menu lists Gmail (a switch once connected, Connect before)", async () => { await p.goto("/app", 3000); await p.click('[aria-label^="Connectors"]', 600); const t = await p.eval(`[...document.querySelectorAll('[role="dialog"]')].map(d => d.innerText).join(' ')`); await p.press("Escape"); return /Gmail/.test(t); });
await p.eval(`['openman:pref:plugins.removedBuiltIns','openman:pref:connectors.added','composer-prefs'].forEach(k=>localStorage.removeItem(k))`);

/* Prompt hand-off into the Home composer */
await step("Websites: a template hands its prompt to Home", async () => { await p.goto("/app/websites", 3000); await p.click("text=Client Portal", 2200); return (await p.url()) === "/app" && (await val()).startsWith("Make a client portal"); });
await step("Websites: Build a new website prefills a starter", async () => { await p.goto("/app/websites", 3000); await p.click("text=Build a new website", 2200); return (await p.url()) === "/app" && (await val()) === "Build a website for "; });
await step("Automations: Create menu opens /app/automations/new", async () => { await p.goto("/app/automations", 3000); await p.click('main button[aria-label="Create"]', 600); const o = await p.has('[role="menu"]'); await p.click('[role="menu"] [role="menuitem"] >> 0', 1800); return o && (await p.url()).startsWith("/app/automations/new"); });

/* Library */
await step("Library: files open and download through the task files API", async () => { await p.goto("/app/library", 4500); // The Download button saves through a temporary <a download>: catch its URL instead of letting Chrome save it.
    const s = await p.eval(`(()=>{const b=[...document.querySelectorAll('main button[aria-label^="Download"]')]; window.__dl = null; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { window.__dl = this.getAttribute('href'); return; } return orig.call(this); }; const first = b.find(x => !x.disabled); first?.click(); return {n:b.length, disabled:b.filter(x=>x.disabled).length, href: window.__dl}})()`); if (s.n === 0) return p.has("text=Your library is empty"); if (!s.href) return false; const res = await p.eval(`fetch(${JSON.stringify(s.href)}).then(r=>r.status + ' ' + r.headers.get('content-disposition'))`); console.log("    file:", s.href, "->", res); return s.n > s.disabled && /^200 attachment/.test(res); });
await step("Library: favourite, filter, grid view respond", async () => { const has = await p.has('main button[aria-pressed="false"][aria-label^="Add"]'); if (!has) return true; await p.click('main button[aria-label^="Add"] >> 0', 300); const fav = await p.has('main button[aria-pressed="true"]'); await p.click('[aria-label="Grid view"]', 300); const grid = await p.eval(`document.querySelector('main ul').className.includes('grid')`); await p.click('[aria-label="List view"]', 300); await p.click('main button[aria-pressed="true"] >> 0', 300); return fav && grid; });

/* Landing page to app (sends a real task: opt in) */
if (process.env.SEND) await step("Landing composer: the typed prompt starts a task in the app", async () => { await p.goto("/", 3000); await p.click("main textarea", 200); await p.type("Reply with the single word ok. Do not use any tool."); await p.press("Enter"); let u = ""; for (let i = 0; i < 40; i++) { await sleep(400); u = await p.url(); if (/^\/app\/task\//.test(u)) break; } return /^\/app\/task\/[^/]+$/.test(u); });
check("extras: no console errors during the run", flushLogs("extras").filter((l) => !l.startsWith("WARN")).length === 0);
