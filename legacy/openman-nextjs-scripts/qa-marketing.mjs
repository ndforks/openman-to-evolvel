// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: marketing site. Header menus, sign-in modal, docs, legal pages, redirects, robots and sitemap, and no dead controls.
// Run: node scripts/qa.mjs scripts/qa-marketing.mjs        (AUDIT=1 also clicks every control on every page)
const dlg = () => p.has('[role="dialog"]');
await p.goto("/", 3200);
flushLogs("/");
// header menus: hover opens, Escape and outside click close, items navigate
const menus = await p.eval(`[...document.querySelectorAll('header button[aria-haspopup="menu"]')].map(b=>b.innerText.trim())`);
console.log("header menus:", JSON.stringify(menus));
for (let i = 0; i < menus.length; i++) {
  const sel = `header button[aria-haspopup="menu"] >> ${i}`;
  await step(`header menu ${menus[i]}: opens on hover`, async () => { await p.moveTo(5, 400); await sleep(300); await p.hover(sel, 500); await p.shot(`qa/mkt-menu-${i}`); return p.has('header [role="menu"]'); });
  const items = await p.eval(`[...document.querySelectorAll('header [role="menu"] [role="menuitem"]')].map(a=>a.innerText.split('\\n')[0]+' -> '+a.getAttribute('href'))`);
  console.log(`   ${menus[i]} items:`, JSON.stringify(items));
  await step(`header menu ${menus[i]}: closes when the pointer leaves`, async () => { await p.moveTo(640, 700); return p.waitGone('header [role="menu"]', 2500); });
  await step(`header menu ${menus[i]}: click opens, Escape closes`, async () => { await p.click(sel, 400); const o = await p.has('header [role="menu"]'); await p.press("Escape"); await sleep(300); return o && !(await p.has('header [role="menu"]')); });
  await step(`header menu ${menus[i]}: outside click closes`, async () => { await p.click(sel, 400); await p.moveTo(640, 700); await p.clickAt(640, 700); await sleep(500); return !(await p.has('header [role="menu"]')); });
  // Every item must lead to a real page: no "#" placeholders, no "coming soon".
  check(`header menu ${menus[i]}: every item has a destination`, items.length > 0 && items.every((t) => !/ -> (#|null)$/.test(t)), items.filter((t) => / -> (#|null)$/.test(t)).join("; "));
}
// plain nav links
const links = await p.eval(`[...document.querySelectorAll('header nav a, header a')].map(a=>a.innerText.trim()+' -> '+a.getAttribute('href'))`);
console.log("header links:", JSON.stringify(links));
// sign in: the header always offers a sign-in control (signed out it opens the dialog, signed in it enters the app);
// the footer links to /?signin=1, which opens the dialog on any session (checked next).
await step("header shows a sign-in control", async () => p.eval(`[...document.querySelectorAll('header button')].some(b=>/^(Sign in|Get started)$/.test(b.innerText.trim()))`));
await step("footer links to sign-in, docs, pricing, terms and privacy", async () => p.eval(`["/?signin=1","/docs","/pricing","/terms","/privacy"].every(h=>document.querySelector('footer a[href="'+h+'"]'))`));
await step("/?signin=1 opens the modal and drops the parameter", async () => { await p.goto("/?signin=1", 3000); const o = await dlg(); const u = await p.url(); await p.shot("qa/mkt-signin-param"); await p.press("Escape"); return o && u === "/"; });
flushLogs("sign-in");
// landing chips
await p.goto("/", 3000);
await step("landing chip prefills the composer", async () => { await p.click("text=Draft a deck", 400); return (await p.eval(`document.querySelector('textarea').value`)) === "Draft a slide deck on "; });
await step("landing: See all goes to /features", async () => { await p.eval(`[...document.querySelectorAll('main button')].find(b=>b.innerText.trim()==='See all').click()`); await sleep(1800); return (await p.url()) === "/features"; });
await p.goto("/", 2500);
await step("landing: guide card opens the getting-started doc", async () => { await p.click('main a[href="/docs/getting-started"]', 1800); return (await p.url()) === "/docs/getting-started"; });
// no placeholder links or dead "coming soon" targets anywhere on the public pages
for (const path of ["/", "/pricing", "/team", "/features", "/docs", "/docs/tasks", "/terms", "/privacy"]) {
  await p.goto(path, 2500);
  const bad = await p.eval(`[...document.querySelectorAll('a')].filter(a=>!a.closest('[role="dialog"]')).map(a=>a.getAttribute('href')).filter(h=>h===null||h===''||h==='#')`);
  check(`${path}: no placeholder links`, bad.length === 0, bad.join(", "));
  const title = await p.eval(`document.title`);
  check(`${path}: has a page title`, typeof title === "string" && title.length > 3, title);
  flushLogs(path);
}
// docs: sidebar, search over headings, previous/next
await p.goto("/docs", 3000);
const docLinks = await p.eval(`[...document.querySelectorAll('nav[aria-label="Docs"] a')].map(a=>a.getAttribute('href'))`);
console.log("docs pages:", JSON.stringify(docLinks));
check("docs: sidebar lists at least 15 pages", docLinks.length >= 15);
await step("docs: every sidebar page loads", async () => { const bad = []; for (const h of docLinks) { const r = await fetch((process.env.BASE_URL ?? "http://localhost:3001") + h); if (r.status !== 200) bad.push(h + " " + r.status); } if (bad.length) console.log("     ", bad.join("; ")); return bad.length === 0; });
await step("docs: search finds a heading and opens it", async () => { await p.click('nav[aria-label="Docs"] input[type="search"]', 200); await p.type("backups"); await sleep(400); const hit = await p.eval(`document.querySelector('nav[aria-label="Docs"] [aria-label="Search results"] a')?.getAttribute('href') ?? null`); console.log("     first hit:", hit); if (!hit) return false; await p.click('nav[aria-label="Docs"] [aria-label="Search results"] a', 1800); return (await p.url()).startsWith("/docs/cloud-computers"); });
await step("docs: unknown search says nothing matches", async () => { await p.goto("/docs", 2500); await p.click('nav[aria-label="Docs"] input[type="search"]', 200); await p.type("zzqqxx"); await sleep(300); return p.has("text~=Nothing in the docs matches"); });
await step("docs: Next link goes to the next page", async () => { await p.goto("/docs", 2500); await p.click('nav[aria-label="Previous and next pages"] a', 1800); return (await p.url()) === "/docs/getting-started"; });
await step("docs: unknown page shows not found", async () => /could not be found/i.test(await (await fetch((process.env.BASE_URL ?? "http://localhost:3001") + "/docs/no-such-page")).text()));
await step("docs: no unfilled {{tokens}}", async () => { const bad = []; for (const h of docLinks) { const t = await (await fetch((process.env.BASE_URL ?? "http://localhost:3001") + h)).text(); if (/\{\{[a-zA-Z.:]+\}\}/.test(t)) bad.push(h); } return bad.length === 0 || (console.log("     ", bad.join(", ")), false); });
// legal pages are marked as drafts
for (const path of ["/terms", "/privacy"]) await step(`${path}: marked as a draft for legal review`, async () => { await p.goto(path, 2500); return p.has("text~=Draft for legal review"); });
// removed pages redirect instead of showing dead downloads or another company's events
await step("/download redirects to the getting-started doc", async () => { await p.goto("/download", 3000); return (await p.url()) === "/docs/getting-started"; });
await step("/live-events redirects home", async () => { await p.goto("/live-events", 3000); return (await p.url()) === "/"; });
await step("robots.txt and sitemap.xml are served", async () => { const base = process.env.BASE_URL ?? "http://localhost:3001"; const r = await (await fetch(base + "/robots.txt")).text(); const m = await (await fetch(base + "/sitemap.xml")).text(); return /Disallow: \/app/.test(r) && /sitemap\.xml/.test(r) && m.includes("/docs/getting-started") && m.includes("/privacy"); });
flushLogs("docs and legal");
// subpages (slow: set AUDIT=1, and PAGES=/pricing,/team to limit)
for (const path of process.env.AUDIT ? (process.env.PAGES ?? "/,/pricing,/team,/features,/docs,/docs/tasks,/terms,/privacy").split(",") : []) {
  const openIt = async () => { await p.goto(path, 2800); };
  await openIt();
  const logs = flushLogs(path);
  check(`${path} loads without console errors`, logs.filter((l) => !l.startsWith("WARN")).length === 0);
  // The header and footer are the same on every page: click through them once, on the landing page.
  const r = await audit(path === "/" ? "body" : "main", { reopen: openIt, skip: /^(send|sign in|sign up|get started|continue with .*)$/i });
  check(`${path}: ${r.total} controls respond`, r.dead.length === 0 && r.stuck.length === 0, [r.dead.length ? "dead: " + r.dead.join("; ") : "", r.stuck.length ? "stuck overlay: " + r.stuck.join("; ") : ""].filter(Boolean).join(" | ").slice(0, 1500));
  const left = r.notes.filter((n) => n.startsWith("left")); if (left.length) console.log("    navigations:", left.join("; ").slice(0, 1800));
  const dis = r.notes.filter((n) => !n.startsWith("left")); if (dis.length) console.log("    other notes:", dis.join("; ").slice(0, 800));
  if (r.external.length) console.log("    external:", r.external.join("; ").slice(0, 1500));
  flushLogs(path + " (after clicks)");
}
