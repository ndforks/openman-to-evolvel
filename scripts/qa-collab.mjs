// Scenario: task collaboration with TWO real browser sessions against the dev server. The owner (dev user) makes a
// cheap Lite task and invites a throwaway signed-in user through the Collaborate popover; the collaborator (a second
// Chrome with its own session cookie, see scripts/second-session.mjs) finds it under "Shared with you", reads it,
// sends a message from the composer, and cannot reach owner-only actions (UI hidden and API refused). The owner
// removes the person and their access ends. Deletes the task and the throwaway user's rows at the end.
// Run: node scripts/qa.mjs scripts/qa-collab.mjs      (BASE_URL defaults to http://localhost:3001)
// Screenshots: /tmp/om-shots/collab/
const dir = "file://" + process.cwd() + "/scripts/";
const { launch } = await import(new URL("./cdp.mjs", dir).href);
const { mintSecondSession, setCookieIn } = await import(new URL("./second-session.mjs", dir).href);

const SHOTS = "/tmp/om-shots/collab";
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const apiIn = (page, path, init) => page.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const api = (path, init) => apiIn(p, path, init);
const ACTIVE = ["waking", "running", "waiting"];
const waitTask = async (id, ms = 150000) => { const t0 = Date.now(); await sleep(1500); for (;;) { const r = await api(`/api/tasks/${id}`); const s = r.body?.task?.status; if (s && !ACTIVE.includes(s)) return r.body; if (Date.now() - t0 > ms) return r.body; await sleep(2000); } };
const clickText = (page, scope, label) => page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);

const second = await mintSecondSession({ name: "QA Collaborator" });
const email = second.email;
let taskId = null;
let c = null;

try {
  /* ---- owner: a cheap task ---- */
  await p.goto("/app", 3500);
  await step("owner: a cheap Lite task completes", async () => {
    const r = await api("/api/tasks", json("POST", { prompt: "Reply with the single word ok. Use no tools.", mode: "lite" }));
    taskId = r.body?.task?.id ?? null;
    if (!taskId) return false;
    const done = await waitTask(taskId);
    return done?.task?.status === "completed";
  });

  /* ---- owner: invite through the real popover ---- */
  await step("owner: invites the second user by email from the Collaborate popover", async () => {
    await p.goto(`/app/task/${taskId}`, 4000);
    await p.click('button[aria-label="Collaborate"]', 600);
    await p.click('input[aria-label="Email to invite"]', 200);
    await p.type(email);
    await clickText(p, '[aria-label="Collaborators"] button', "Invite");
    await p.waitFor(`[data-member="${email}"]`, 8000);
    return true;
  });
  await p.shot(`${SHOTS}/01-owner-invited.png`);
  await p.press("Escape");

  /* ---- collaborator: a second browser with its own session ---- */
  c = await launch({ width: 1280, height: 800, outDir: SHOTS });
  await setCookieIn(c, second);
  // The throwaway user has no Orgo account, so the first-run setup gate would cover every page (a real collaborator
  // has set up their own computer). Mark setup as known-ready in this browser, as the gate itself does once ready.
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "try { sessionStorage.setItem('openman:home-ready', '1') } catch {}" });
  await c.goto("/app", 4500);

  await step("collaborator: the session is the second user, not the dev user", async () => {
    // /api/me needs an Orgo account (the throwaway user has none); the task list is per user, so it tells them apart.
    const mine = await apiIn(c, "/api/tasks");
    const owners = await api("/api/tasks");
    const shared = await apiIn(c, "/api/tasks/shared");
    return mine.status === 200 && (mine.body?.tasks ?? []).length === 0 && (owners.body?.tasks ?? []).length > 0 && shared.status === 200 && (shared.body?.tasks ?? []).some((t) => t.id === taskId);
  });
  await step('collaborator: the task is listed under "Shared with you" in the sidebar', async () => {
    await c.waitFor(`[data-shared-tasks] [data-task-row="${taskId}"]`, 20000);
    // The row's tooltip names who shared it by email, never an internal user id.
    const title = await c.eval(`document.querySelector('[data-shared-tasks] [data-task-row="${taskId}"] a')?.title ?? ''`);
    console.log("    shared row title:", title);
    return (await c.has("text=Shared with you")) && /shared by [^)]*@/.test(title);
  });
  await c.shot(`${SHOTS}/02-collab-sidebar.png`);
  await step("collaborator: the shared row offers no owner menu", async () => {
    await c.hover(`[data-shared-tasks] [data-task-row="${taskId}"]`, 400);
    return !(await c.eval(`!!document.querySelector('[data-shared-tasks] [data-task-row="${taskId}"] button')`));
  });

  await step("collaborator: opening it shows the transcript", async () => {
    await c.click(`[data-shared-tasks] [data-task-row="${taskId}"] a`, 4500);
    const path = await c.eval("location.pathname");
    const body = await c.eval("document.body.innerText");
    return path.endsWith(taskId) && /Reply with the single word ok/.test(body) && /\bok\b/i.test(body.split("Reply with the single word ok").pop() ?? "");
  });
  await c.shot(`${SHOTS}/03-collab-task.png`);

  await step("collaborator: Share, the task menu, invite field and live computer are not offered", async () => {
    const share = await c.has('header button[aria-label="Share"]') || (await c.eval(`[...document.querySelectorAll('header button')].some((b) => b.innerText.trim() === 'Share')`));
    const more = await c.has('header button[aria-label="More"]');
    const label = await c.eval(`document.querySelector('button[aria-label="Collaborate"]')?.innerText.trim() ?? ''`);
    await c.click('button[aria-label="Collaborate"]', 700);
    const invite = await c.has('input[aria-label="Email to invite"]');
    const remove = await c.has(`button[aria-label="Remove ${email}"]`);
    await c.press("Escape");
    // The step thumbnail and panel replay the agent's tool steps (part of the transcript); the live desktop
    // (noVNC canvas, from the owner-only /computer route) must never load for a collaborator.
    const thumb = await c.has('button[aria-label$="desktop"]');
    if (thumb) { await c.click('button[aria-label$="desktop"]', 2500); await c.shot(`${SHOTS}/03b-collab-panel.png`); }
    // Live view = a noVNC canvas, the owner-only /computer route, or a websocket to the desktop (the noVNC JS chunk
    // itself may load with the panel; it connects to nothing without the route's URL).
    const hits = await c.eval(`[...performance.getEntriesByType("resource")].map((e) => e.name).filter((n) => !n.includes("/_next/") && /\\/computer(\\?|$)|websockify|vnc-password/.test(n))`);
    const vnc = (await c.eval("document.querySelectorAll('canvas').length")) > 0 || hits.length > 0;
    console.log("    collaborator UI:", JSON.stringify({ share, more, label, invite, remove, thumb, vnc, hits }));
    return !share && !more && /shared with you/i.test(label) && !invite && !remove && !vnc;
  });

  await step("collaborator: sends a message from the composer and the owner's agent answers", async () => {
    const before = (await api(`/api/tasks/${taskId}`)).body?.events?.filter((e) => e.type === "user.message").length ?? 0;
    await c.click("main textarea", 200);
    await c.type("Reply with the single word ok again. Use no tools.");
    await c.press("Enter");
    await sleep(2500);
    const done = await waitTask(taskId, 120000);
    const users = done?.events?.filter((e) => e.type === "user.message") ?? [];
    await sleep(2500);
    const body = await c.eval("document.body.innerText");
    return users.length === before + 1 && /single word ok again/.test(body) && done?.task?.status === "completed";
  });
  await c.shot(`${SHOTS}/04-collab-prompted.png`);

  await step("collaborator: owner-only APIs are refused (403) and the owner's other data stays hidden (404)", async () => {
    const own = "Only the task's owner";
    const rename = await apiIn(c, `/api/tasks/${taskId}`, json("PATCH", { title: "hijack" }));
    const archive = await apiIn(c, `/api/tasks/${taskId}`, json("PATCH", { archived: true }));
    const move = await apiIn(c, `/api/tasks/${taskId}`, json("PATCH", { projectId: null }));
    const del = await apiIn(c, `/api/tasks/${taskId}`, json("DELETE"));
    const invite = await apiIn(c, `/api/tasks/${taskId}/members`, json("POST", { email: "someone-else@example.com" }));
    const remove = await apiIn(c, `/api/tasks/${taskId}/members`, json("DELETE", { email }));
    const computer = await apiIn(c, `/api/tasks/${taskId}/computer`);
    const branch = await apiIn(c, `/api/tasks/${taskId}/branch`, json("POST", {}));
    const share = await apiIn(c, "/api/shares", json("POST", { taskId, visibility: "public" }));
    const shareGet = await apiIn(c, `/api/shares?taskId=${taskId}`);
    const list = await apiIn(c, "/api/tasks");
    const projects = await apiIn(c, "/api/projects");
    const refused = [rename, archive, move, del, invite, remove, computer, branch];
    const statuses = Object.fromEntries(Object.entries({ rename, archive, move, del, invite, remove, computer, branch, share, shareGet }).map(([k, v]) => [k, v.status]));
    console.log("    collaborator API:", statuses);
    const title = (await api(`/api/tasks/${taskId}`)).body?.task;
    return (
      refused.every((r) => r.status === 403 && String(r.body?.error ?? "").startsWith(own)) &&
      share.status === 404 && shareGet.status === 404 &&
      !(list.body?.tasks ?? []).some((t) => t.id === taskId) &&
      (projects.body?.projects ?? []).length === 0 &&
      title?.title !== "hijack" && title?.archived !== true
    );
  });

  /* ---- owner removes; access ends ---- */
  await step("owner: removes the collaborator from the popover", async () => {
    await p.reload(3500);
    await p.click('button[aria-label="Collaborate"]', 700);
    await p.click(`button[aria-label="Remove ${email}"]`, 800);
    const gone = await p.waitGone(`[data-member="${email}"]`, 6000);
    await p.press("Escape");
    return gone;
  });
  await step("collaborator: after removal the task is gone from the sidebar and cannot be opened", async () => {
    const r = await apiIn(c, `/api/tasks/${taskId}`);
    await c.goto("/app", 4000);
    const listed = await c.has(`[data-task-row="${taskId}"]`);
    await c.goto(`/app/task/${taskId}`, 4500);
    const body = await c.eval("document.body.innerText");
    await c.shot(`${SHOTS}/05-collab-removed.png`);
    console.log("    after removal:", { status: r.status, listed, leaks: /single word ok again/.test(body) });
    return r.status === 404 && !listed && !/single word ok again/.test(body);
  });
  const logs = c.takeLogs().filter((l) => !/404|Failed to load resource/.test(l));
  if (logs.length) console.log("  collaborator console:\n    " + logs.join("\n    "));
} finally {
  if (c) await c.close();
  if (taskId) await api(`/api/tasks/${taskId}`, json("DELETE")).catch(() => null);
  await second.cleanup().catch((e) => console.log("  cleanup failed:", e.message));
}
