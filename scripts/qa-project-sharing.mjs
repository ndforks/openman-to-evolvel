// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Scenario: project sharing with TWO real browser sessions. The owner (dev user) makes a project with instructions
// and a file, opens the Share dialog and invites a throwaway signed-in user as Member; the member's browser lists the
// project with a "shared" marker, opens it, sees the instructions and files but no edit, upload, delete, share or
// rename controls, and the API refuses changes; the owner makes them Editor and the member can edit the instructions;
// the member leaves; the owner invites again and removes them. Deletes the project and the throwaway rows at the end.
// Run: node scripts/qa.mjs scripts/qa-project-sharing.mjs     Screenshots: /tmp/om-shots/projects-share/
const dir = "file://" + process.cwd() + "/scripts/";
const { launch } = await import(new URL("./cdp.mjs", dir).href);
const { mintSecondSession, setCookieIn } = await import(new URL("./second-session.mjs", dir).href);

const SHOTS = "/tmp/om-shots/projects-share";
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const apiIn = (page, path, init) => page.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init ?? {})}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
const api = (path, init) => apiIn(p, path, init);
const clickText = (page, scope, label) => page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
const setSelect = (page, sel, value) => page.eval(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

const second = await mintSecondSession({ name: "QA Project Member" });
const email = second.email;
let projectId = null;
let m = null;

try {
  await p.goto("/app", 3000);
  await step("owner: project with instructions and a file", async () => {
    const r = await api("/api/projects", json("POST", { name: `QA shared ${Date.now().toString(36)}`, instructions: "Answer like a pirate." }));
    projectId = r.body?.project?.id ?? null;
    if (!projectId) return false;
    const f = await api(`/api/projects/${projectId}/files`, json("POST", { name: "style-guide.md", content: "# Style\nShort sentences.", mime: "text/markdown" }));
    return f.status === 201;
  });

  await step("owner: invites the second user as Member from the Share dialog", async () => {
    await p.goto(`/app/project/${projectId}`, 4000);
    await clickText(p, "header button", "Share");
    await p.waitFor('input[aria-label="Email address"]', 6000);
    await p.click('input[aria-label="Email address"]', 200);
    await p.type(email);
    await clickText(p, '[role="dialog"] button', "Invite");
    await p.waitFor(`[aria-label="Project members"] li`, 8000);
    const listed = await p.eval(`document.querySelector('[aria-label="Project members"]').innerText`);
    return listed.includes(email);
  });
  await p.shot(`${SHOTS}/01-owner-share-dialog.png`);
  await p.press("Escape");
  await sleep(500);

  await step("owner: sidebar row and header show the project as shared", async () => {
    await p.goto(`/app/project/${projectId}`, 4000);
    const marker = await p.eval(`!!document.querySelector('[data-project-row="${projectId}"] [data-shared-marker]')`);
    const header = await p.eval(`[...document.querySelectorAll('header button')].some((b) => /Shared · 1/.test(b.innerText))`);
    return marker && header;
  });

  /* ---- member: a second browser ---- */
  m = await launch({ width: 1280, height: 800, outDir: SHOTS });
  await setCookieIn(m, second);
  await m.goto("/app", 4500);

  await step("member: the project is listed with the shared marker", async () => {
    await m.waitFor(`[data-project-row="${projectId}"] [data-shared-marker]`, 20000);
    const title = await m.eval(`document.querySelector('[data-project-row="${projectId}"] button')?.title ?? ''`);
    return /shared by .*@/.test(title);
  });
  await m.shot(`${SHOTS}/02-member-sidebar.png`);

  await step("member: the project page opens (no setup screen) with instructions and files, read-only", async () => {
    await m.goto(`/app/project/${projectId}`, 5000);
    const text = await m.eval("document.body.innerText");
    const ok = text.includes("Answer like a pirate.") && text.includes("style-guide.md") && /Shared by .*Member/.test(text) && !text.includes("Setting up your computer");
    const noEdit = await m.eval(`![...document.querySelectorAll('button')].some((b) => b.offsetParent && /^(Edit|Upload|Share)$/.test(b.innerText.trim()))`);
    const noDelete = await m.eval(`![...document.querySelectorAll('button[aria-label^="Delete "]')].some((b) => getComputedStyle(b).display !== 'none')`);
    const leave = await m.eval(`[...document.querySelectorAll('header button')].some((b) => b.innerText.trim() === 'Leave')`);
    return ok && noEdit && noDelete && leave;
  });
  await m.shot(`${SHOTS}/03-member-project.png`);

  await step("member: the API refuses changes and owner-only actions", async () => {
    const patch = await apiIn(m, `/api/projects/${projectId}`, json("PATCH", { instructions: "hijack" }));
    const rename = await apiIn(m, `/api/projects/${projectId}`, json("PATCH", { name: "mine now" }));
    const del = await apiIn(m, `/api/projects/${projectId}`, json("DELETE"));
    const upload = await apiIn(m, `/api/projects/${projectId}/files`, json("POST", { name: "x.txt", content: "x" }));
    const invite = await apiIn(m, `/api/projects/${projectId}/members`, json("POST", { email: "someone@example.com", role: "editor" }));
    const members = await apiIn(m, `/api/projects/${projectId}/members`);
    const files = await apiIn(m, `/api/projects/${projectId}/files`);
    console.log("    statuses:", patch.status, rename.status, del.status, upload.status, invite.status, members.status, files.status);
    return patch.status === 403 && rename.status === 403 && del.status === 403 && upload.status === 403 && invite.status === 403 && members.body?.members?.length === 0 && files.body?.files?.length === 1;
  });

  await step("member: sees none of the owner's tasks in the project", async () => {
    const r = await apiIn(m, `/api/projects/${projectId}`);
    return r.status === 200 && r.body?.role === "member" && Array.isArray(r.body?.tasks) && r.body.tasks.length === 0 && !("members" in r.body);
  });

  await step("member: starts a task in the project (their own account); the owner does not see it", async () => {
    // The throwaway user has no computer, so the run itself stops with "not set up"; the task stays theirs, filed in the project.
    const t = await apiIn(m, "/api/tasks", json("POST", { prompt: "Say hi.", mode: "lite", projectId }));
    const theirs = await apiIn(m, `/api/projects/${projectId}`);
    const owners = await api(`/api/projects/${projectId}`);
    const id = t.body?.task?.id;
    return t.status === 201 && t.body?.task?.projectId === projectId && theirs.body?.tasks?.some((x) => x.id === id) && !owners.body?.tasks?.some((x) => x.id === id);
  });

  await step("owner: makes them Editor from the dialog", async () => {
    await p.goto(`/app/project/${projectId}`, 3500);
    await clickText(p, "header button", "Shared · 1");
    await p.waitFor(`[aria-label="Project members"] li`, 8000);
    await setSelect(p, `select[aria-label="Role of ${email}"]`, "editor");
    await sleep(1500);
    const r = await api(`/api/projects/${projectId}/members`);
    return r.body?.members?.[0]?.role === "editor";
  });
  await p.press("Escape");

  await step("editor: can change the instructions from the page, and the owner sees it", async () => {
    await m.goto(`/app/project/${projectId}`, 4500);
    const edit = await clickText(m, "aside button", "Edit");
    if (!edit) return false;
    await m.waitFor('textarea[aria-label="Project instructions"]', 5000);
    await m.click('textarea[aria-label="Project instructions"]', 200);
    await m.press("End");
    await m.type(" Keep it short.");
    await clickText(m, '[role="dialog"] button', "Save");
    await sleep(1500);
    const r = await api(`/api/projects/${projectId}`);
    const rename = await apiIn(m, `/api/projects/${projectId}`, json("PATCH", { name: "editor rename" }));
    return /Keep it short\./.test(r.body?.project?.instructions ?? "") && rename.status === 403;
  });
  await m.shot(`${SHOTS}/04-editor-edited.png`);

  await step("member: leaves from the page; the project disappears for them", async () => {
    await m.goto(`/app/project/${projectId}`, 4000);
    await m.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    await m.eval("window.confirm = () => true");
    await clickText(m, "header button", "Leave");
    await sleep(2500);
    const r = await apiIn(m, `/api/projects/${projectId}`);
    const list = await apiIn(m, "/api/projects");
    return r.status === 404 && !(list.body?.projects ?? []).some((x) => x.id === projectId);
  });

  await step("owner: invite again, then remove; access ends", async () => {
    const a = await api(`/api/projects/${projectId}/members`, json("POST", { email, role: "member" }));
    const seen = await apiIn(m, `/api/projects/${projectId}`);
    const rm = await api(`/api/projects/${projectId}/members`, json("DELETE", { email }));
    const gone = await apiIn(m, `/api/projects/${projectId}`);
    return a.status === 201 && seen.status === 200 && rm.status === 200 && gone.status === 404;
  });
} finally {
  if (projectId) await api(`/api/projects/${projectId}`, json("DELETE")).catch(() => null);
  if (m) await m.close();
  await second.cleanup();
}
