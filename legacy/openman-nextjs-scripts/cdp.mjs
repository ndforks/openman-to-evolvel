// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Small Chrome DevTools Protocol driver for integration checks. No dependencies.
// Used by scripts/qa.mjs. Extends the idea in scripts/shot.mjs with click, hover, type and wait helpers.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The dev server under test. The build copy runs on 3001; never point this at the owner's 3000 by default. */
export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** Runs in the page. Finds the first visible element for a selector.
 *  Selector forms: CSS; `text=Exact label`; `text~=part of label`; append ` >> N` to take the Nth match (0-based). */
const FIND = `(function(sel){
  let idx = 0; const m = sel.match(/^(.*?)\\s*>>\\s*(\\d+)$/); if (m) { sel = m[1]; idx = +m[2]; }
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.01; };
  let list = [];
  if (sel.startsWith('text=') || sel.startsWith('text~=')) {
    const exact = sel.startsWith('text='); const want = sel.slice(exact ? 5 : 6).trim().toLowerCase();
    const all = [...document.querySelectorAll('body *')].filter((el) => !['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName));
    const norm = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const hits = all.filter((el) => { const t = norm(el); return exact ? t === want : t.includes(want); }).filter(visible);
    // keep the innermost matches only
    list = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
  } else { list = [...document.querySelectorAll(sel)].filter(visible); }
  const el = list[idx]; if (!el) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, w: r.width, h: r.height, left: r.left, top: r.top, count: list.length, tag: el.tagName, text: (el.innerText || '').slice(0, 80), covered: !!top && top !== el && !el.contains(top) && !top.contains(el) ? (top.tagName + '.' + String(top.className).slice(0, 60)) : null };
})`;

export async function launch({ width = 1280, height = 800, outDir = "/tmp/om-shots" } = {}) {
  mkdirSync(outDir, { recursive: true });
  const port = 9400 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${outDir}/profile-qa-${port}`, `--window-size=${width},${height}`, ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(/\s+/) : []), "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); let logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    if (d.method === "Runtime.exceptionThrown") logs.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 600));
    if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) logs.push((d.params.type === "error" ? "ERR " : "WARN ") + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 900));
    if (d.method === "Log.entryAdded" && (d.params.entry.level === "error")) logs.push("LOG " + d.params.entry.text.slice(0, 300) + " " + (d.params.entry.url || ""));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  // Let "copy" buttons work without a permission prompt.
  await send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});

  const p = {
    send, outDir,
    /** Evaluate an expression (string) in the page and return its JSON value. */
    async eval(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
    async goto(url, wait = 2500) { if (url.startsWith("/")) url = BASE_URL + url; await send("Page.navigate", { url }); await sleep(wait); },
    async reload(wait = 2500) { await send("Page.reload"); await sleep(wait); },
    find(sel) { return p.eval(`${FIND}(${JSON.stringify(sel)})`); },
    async has(sel) { return !!(await p.find(sel)); },
    async waitFor(sel, timeout = 6000) { const t0 = Date.now(); for (;;) { const f = await p.find(sel); if (f) return f; if (Date.now() - t0 > timeout) throw new Error("waitFor timeout: " + sel); await sleep(150); } },
    async waitGone(sel, timeout = 4000) { const t0 = Date.now(); for (;;) { if (!(await p.find(sel))) return true; if (Date.now() - t0 > timeout) return false; await sleep(150); } },
    async moveTo(x, y) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); },
    async clickAt(x, y) { await p.moveTo(x, y); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); },
    /** Real mouse click at the centre of the first visible match. Returns what it found. */
    async click(sel, wait = 450) { const f = await p.find(sel); if (!f) throw new Error("click: not found: " + sel); if (f.covered) console.log(`  ! ${sel} is covered by ${f.covered}`); await p.clickAt(f.x, f.y); await sleep(wait); await p.keepFront(); return f; },
    async hover(sel, wait = 500) { const f = await p.find(sel); if (!f) throw new Error("hover: not found: " + sel); await p.moveTo(f.x - 2, f.y - 2); await p.moveTo(f.x, f.y); await sleep(wait); return f; },
    async type(text) { await send("Input.insertText", { text }); await sleep(150); },
    /** Press a key by name: Escape, Enter, Tab, ArrowDown, Backspace, or a single character. `mods`: 1 alt, 2 ctrl, 4 meta, 8 shift. */
    async press(key, mods = 0) {
      const codes = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, " ": 32 };
      const vk = codes[key] ?? key.toUpperCase().charCodeAt(0);
      // macOS key codes. A missing or wrong one makes Chrome treat the key as a browser shortcut
      // (the page loses focus, or an About tab opens) instead of delivering it to the page.
      const mac = { Escape: 53, Enter: 36, Tab: 48, Backspace: 51, ArrowDown: 125, ArrowUp: 126, ArrowLeft: 123, ArrowRight: 124, " ": 49, a: 0, k: 40, o: 31 };
      const base = { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: mac[key] ?? mac[key.toLowerCase()] ?? 0, modifiers: mods };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", text: "\r", ...base });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }); await sleep(300);
      await p.keepFront();
    },
    /** Closes any other tab (opened by a target="_blank" link or a browser shortcut) so this page stays visible and animating. */
    async keepFront() {
      const others = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === "page" && t.id !== target.id);
      if (others.length === 0) return;
      for (const t of others) await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
      await send("Page.bringToFront").catch(() => {});
      console.log(`  (closed ${others.length} extra tab: ${others.map((t) => t.url).join(", ")})`);
    },
    /** Empties the focused text field (select all, then delete). */
    async clearField() {
      const base = { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 0, modifiers: 4 };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, commands: ["selectAll"] });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await p.press("Backspace");
    },
    async shot(name, opts = {}) { const file = name.startsWith("/") ? name : `${outDir}/${name}.png`; mkdirSync(dirname(file), { recursive: true }); const { data } = await send("Page.captureScreenshot", { format: "png", ...opts }); writeFileSync(file, Buffer.from(data, "base64")); return file; },
    url() { return p.eval("location.pathname + location.search"); },
    /** Every tab in this browser: a link with target="_blank" opens a second one and sends ours to the background. */
    async tabs() { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === "page").map((t) => t.url); },
    /** Console errors and warnings since the last call (deduplicated). */
    takeLogs() { const out = [...new Set(logs)]; logs = []; return out; },
    async close() { try { ws.close(); } catch {} chrome.kill(); },
  };
  return p;
}

/** Runs in the page: lists the interactive controls inside `scope` (outermost only), each with a stable key.
 *  With `wantKey`, scrolls that one control into view and returns it with fresh coordinates. */
const LIST_CONTROLS = `(function(scopeSel, wantKey){
  const scope = scopeSel ? [...document.querySelectorAll(scopeSel)].pop() : document.body; if (!scope) return null;
  const SEL = 'button, [role="button"], [role="switch"], [role="tab"], [role="radio"], [role="checkbox"], [role="combobox"], [role="option"], [role="menuitem"], a[href], summary, select, input[type="checkbox"], input[type="radio"], input[type="range"]';
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.01 && s.pointerEvents !== 'none'; };
  const all = [...scope.querySelectorAll(SEL)].filter(visible);
  const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  const seen = {};
  const items = outer.map((el) => {
    const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    const kind = el.getAttribute('role') || el.tagName.toLowerCase();
    const base = kind + '|' + label; seen[base] = (seen[base] || 0) + 1;
    const on = (a) => el.getAttribute(a) === 'true';
    return { el, key: base + '#' + seen[base], kind, label, disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled'), href: el.tagName === 'A' ? el.getAttribute('href') : null, target: el.getAttribute('target'), current: (kind === 'tab' && on('aria-selected')) || (kind === 'radio' && on('aria-checked')) || (el.tagName === 'INPUT' && document.activeElement === el) || el.getAttribute('aria-current') === 'page' || (on('aria-pressed') && !!el.parentElement?.closest('[role="group"]')), native: el.tagName === 'SELECT' };
  });
  if (wantKey === undefined) return items.map(({ el, ...rest }) => rest);
  const hit = items.find((i) => i.key === wantKey); if (!hit) return null;
  hit.el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = hit.el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y);
  const { el, ...rest } = hit;
  return { ...rest, x, y, covered: !!top && top !== el && !el.contains(top) && !top.contains(el) };
})`;

/** Runs in the page: a cheap fingerprint of everything a click could visibly change. */
const FINGERPRINT = `(function(scopeSel){
  const scope = scopeSel ? [...document.querySelectorAll(scopeSel)].pop() : document.body;
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const overlays = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]').length;
  const live = [...document.querySelectorAll('[role="status"], [role="alert"], [data-toast]')].map((e) => e.innerText).join('|');
  const active = document.activeElement; const focus = active && /INPUT|TEXTAREA/.test(active.tagName) ? (active.getAttribute('aria-label') || active.name || active.placeholder || 'input') : '';
  return { scope: !!scope, html: scope ? hash(scope.innerHTML.replace(/ style="[^"]*"/g, '')) : 0, body: hash(document.body.innerText), overlays, live, url: location.pathname + location.search + location.hash, focus };
})`;

/**
 * Clicks every control inside `scopeSel` and reports the ones that change nothing visible.
 * `reopen()` is called when a click navigated away or closed the scope. `skip` is a regex on the label.
 * Returns { total, dead: [...], stuck: [...], notes: [...] }.
 */
export async function auditControls(p, scopeSel, { skip = /sign out|log out/i, reopen = null, only = null, settle = 380 } = {}) {
  const list = (await p.eval(`${LIST_CONTROLS}(${JSON.stringify(scopeSel)})`)) || [];
  const out = { total: 0, dead: [], stuck: [], notes: [], external: [] };
  for (const c of list) {
    if (skip && skip.test(c.label)) { out.notes.push(`skipped: ${c.key}`); continue; }
    if (only && !only.test(c.label)) continue;
    if (c.disabled) { out.notes.push(`disabled: ${c.key}`); continue; }
    // The selected tab or radio, or the field that already has focus: clicking it again rightly changes nothing.
    if (c.current) { out.notes.push(`already active: ${c.key}`); continue; }
    // A native <select> opens the browser's own picker, which is not in the page: a click shows nothing to compare.
    if (c.native) { out.notes.push(`native select: ${c.key}`); continue; }
    if (c.href && (c.target === "_blank" || /^(https?:|mailto:)/.test(c.href))) { out.external.push(`${c.label} -> ${c.href}`); if (c.href === "#" || c.href === "") out.dead.push(c.key + " (empty href)"); continue; }
    out.total++;
    let cur = await p.eval(`${LIST_CONTROLS}(${JSON.stringify(scopeSel)}, ${JSON.stringify(c.key)})`);
    // An earlier click may have replaced the view (a sub-page, another tab): restore it once and look again.
    if (!cur && reopen) { await reopen(); cur = await p.eval(`${LIST_CONTROLS}(${JSON.stringify(scopeSel)}, ${JSON.stringify(c.key)})`); }
    if (!cur) { out.notes.push(`gone before click: ${c.key}`); continue; }
    await sleep(60);
    if (process.env.VERBOSE) console.log(`    click ${c.key}`);
    const before = await p.eval(`${FINGERPRINT}(${JSON.stringify(scopeSel)})`);
    await p.clickAt(cur.x, cur.y); await sleep(settle);
    const after = await p.eval(`${FINGERPRINT}(${JSON.stringify(scopeSel)})`);
    const changed = before.html !== after.html || before.body !== after.body || before.overlays !== after.overlays || before.live !== after.live || before.url !== after.url || before.focus !== after.focus;
    if (!changed) out.dead.push(c.key + (cur.covered ? " (covered)" : ""));
    if (after.overlays > before.overlays) {
      let now = after.overlays;
      for (let i = 0; i < 3 && now > before.overlays; i++) { await p.press("Escape"); now = (await p.eval(`${FINGERPRINT}(${JSON.stringify(scopeSel)})`)).overlays; }
      if (now > before.overlays) { out.stuck.push(c.key); }
    }
    const end = await p.eval(`${FINGERPRINT}(${JSON.stringify(scopeSel)})`);
    if ((!end.scope || end.url !== before.url || end.overlays < before.overlays) && reopen) { out.notes.push(`left the view: ${c.key} (url ${end.url})`); await reopen(); }
  }
  return out;
}
