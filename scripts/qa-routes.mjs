// Scenario: every route loads with no console error or hydration warning, serif headings render in Libre Baskerville
// and body text in the system font. Run: node scripts/qa.mjs scripts/qa-routes.mjs
const tasks = await (await fetch((process.env.BASE_URL ?? "http://localhost:3001") + "/api/tasks")).json().catch(() => ({ tasks: [] }));
const taskId = tasks.tasks?.find((t) => t.status === "completed")?.id;
const ROUTES = ["/", "/?signin=1", "/pricing", "/team", "/features", "/docs", "/docs/tasks", "/terms", "/privacy", "/waitlist",
  "/app", "/app/computers", "/app/library", "/app/websites", "/app/automations", "/app/automations/new", "/app/plugins", "/app/skills", "/app/personalization", "/app/computer-use",
  "/app?settings=general", "/app?modal=upgrade-pro", "/app?modal=team-plan", ...(taskId ? [`/app/task/${taskId}`] : [])];
for (const route of ROUTES) {
  await p.goto(route, 3600);
  const logs = p.takeLogs();
  const bad = logs.filter((l) => /^(ERR|EXC|LOG)/.test(l) || /hydrat/i.test(l));
  check(`${route}: no console errors or hydration warnings`, bad.length === 0, bad.join(" || ").slice(0, 500));
  const warns = logs.filter((l) => !bad.includes(l)); if (warns.length) console.log("    warnings:", warns.join(" || ").slice(0, 400));
  const f = await p.eval(`(async () => {
    await document.fonts.ready;
    const fam = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g, '').trim();
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const serif = [...document.querySelectorAll('[class*="font-serif"]')].filter(visible);
    const wrongSerif = serif.filter((el) => fam(el) !== 'Libre Baskerville').map((el) => el.innerText.slice(0, 30) + ' [' + fam(el) + ']');
    const loaded = [...document.fonts].filter((x) => x.status === 'loaded' && /Baskerville/.test(x.family)).length;
    const heads = [...document.querySelectorAll('h1, h2')].filter(visible).slice(0, 5).map((el) => el.innerText.replace(/\\n/g, ' ').slice(0, 26) + ' [' + fam(el) + ']');
    const inter = [...document.querySelectorAll('body *')].filter(visible).filter((el) => /^Inter$/i.test(fam(el))).length;
    return { serif: serif.length, wrongSerif, loaded, body: fam(document.body), heads, inter, title: document.title };
  })()`);
  check(`${route}: serif text is Libre Baskerville (${f.serif} nodes)`, f.wrongSerif.length === 0 && (f.serif === 0 || f.loaded > 0), f.wrongSerif.join("; "));
  check(`${route}: body uses the system font, no Inter`, /ui-sans-serif|system-ui|-apple-system/.test(f.body) && f.inter === 0, `${f.body}, inter=${f.inter}`);
  console.log(`    title="${f.title}" headings: ${f.heads.join(" | ")}`);
}
