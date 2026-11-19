// Real-browser driver for the task view, over the Chrome DevTools Protocol (no dependencies).
// A headless Chrome stays up between calls, so a long run can be watched step by step.
//
//   node scripts/task-drive.mjs start                 launch Chrome (1280x800) and keep it running
//   node scripts/task-drive.mjs run <file.mjs>        run a script against the open page
//   node scripts/task-drive.mjs -e "<code>"           run inline code
//   node scripts/task-drive.mjs stop                  quit Chrome
//
// The code is the body of an async function. In scope:
//   goto(url)  sleep(ms)  url()  evaluate(js)  waitFor(js, timeoutMs)  waitText(text, timeoutMs)  waitGone(text, timeoutMs)
//   click(selector)  clickText(text, { tag, exact, nth })  clickAt(x, y)  hover(selector)  hoverText(text)
//   type(text)  press(key, { meta, ctrl, shift })  drag(x1, y1, x2, y2)
//   text(selector)  count(selector)  rect(selector)  shot(path)  log(...)
// Console errors and uncaught exceptions seen on the page are printed at the end.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SHOTS = "/tmp/om-shots";
const STATE = `${SHOTS}/task-drive.json`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL ?? process.env.OM_BASE ?? "http://localhost:3001";
const [W, H] = [Number(process.env.OM_W ?? 1280), Number(process.env.OM_H ?? 800)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [command, ...rest] = process.argv.slice(2);

/** The tab this driver owns. Chrome can open tabs of its own (an update notice, for one); those are closed. */
async function pageTarget(port, id) {
  const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === "page");
  const own = (id && list.find((t) => t.id === id)) || list.find((t) => t.url.startsWith(BASE)) || list[0];
  for (const other of list) if (own && other.id !== own.id && id) await fetch(`http://127.0.0.1:${port}/json/close/${other.id}`).catch(() => undefined);
  return own;
}

if (command === "start") {
  mkdirSync(SHOTS, { recursive: true });
  if (existsSync(STATE)) {
    try {
      const { port } = JSON.parse(readFileSync(STATE, "utf8"));
      if (await pageTarget(port)) {
        console.log(`already running on ${port}`);
        process.exit(0);
      }
    } catch {
      // Stale state file: start again.
    }
  }
  const port = 9600 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", `--remote-debugging-port=${port}`, `--user-data-dir=${SHOTS}/profile-task-drive`, `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore", detached: true });
  chrome.unref();
  let target;
  for (let i = 0; i < 60 && !target; i += 1) {
    await sleep(250);
    try {
      target = await pageTarget(port);
    } catch {
      // Not listening yet.
    }
  }
  if (!target) throw new Error("Chrome did not start");
  writeFileSync(STATE, JSON.stringify({ port, pid: chrome.pid, target: target.id }));
  console.log(`started on ${port} (pid ${chrome.pid})`);
  process.exit(0);
}

if (command === "stop") {
  try {
    const { pid } = JSON.parse(readFileSync(STATE, "utf8"));
    process.kill(pid);
  } catch {
    // Already gone.
  }
  rmSync(STATE, { force: true });
  console.log("stopped");
  process.exit(0);
}

if (command !== "run" && command !== "-e") {
  console.error("usage: task-drive.mjs start | stop | run <file.mjs> | -e <code>");
  process.exit(2);
}

const code = command === "-e" ? rest.join(" ") : readFileSync(rest[0], "utf8");
const state = JSON.parse(readFileSync(STATE, "utf8"));
const { port } = state;
const target = await pageTarget(port, state.target ?? "none");
if (target.id !== state.target) writeFileSync(STATE, JSON.stringify({ ...state, target: target.id }));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const { resolve, reject } = pending.get(d.id);
    pending.delete(d.id);
    if (d.error) reject(new Error(`${d.error.message}`));
    else resolve(d.result);
  }
  if (d.method === "Runtime.exceptionThrown") logs.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 400));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push("ERR " + d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 400));
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const goto = async (url) => {
  await send("Page.navigate", { url: url.startsWith("http") ? url : BASE + url });
  await sleep(400);
  await waitFor("document.readyState === 'complete'", 30_000);
};
const url = () => evaluate("location.pathname + location.search");
const waitFor = async (expression, timeout = 15_000) => {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await evaluate(expression);
      if (last) return last;
    } catch (err) {
      last = String(err);
    }
    if (Date.now() > until) throw new Error(`waitFor timed out after ${timeout} ms: ${expression.slice(0, 160)} (last: ${String(last).slice(0, 120)})`);
    await sleep(150);
  }
};
const q = (value) => JSON.stringify(value);
const waitText = (text, timeout) => waitFor(`document.body.innerText.includes(${q(text)})`, timeout);
const waitGone = (text, timeout) => waitFor(`!document.body.innerText.includes(${q(text)})`, timeout);

/** Centre of the first visible element the expression returns, after scrolling it into view. */
const centre = async (elementExpression, what) => {
  const point = await evaluate(`(() => { const el = ${elementExpression}; if (!el) return null; el.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  if (!point || point.w === 0) throw new Error(`not found or not visible: ${what}`);
  return point;
};
const byText = (text, { tag = "button, a, [role=menuitem], [role=menuitemradio], [role=tab], [role=option], [role=button]", exact = false, nth = 0 } = {}) =>
  `[...document.querySelectorAll(${q(tag)})].filter((el) => { const t = (el.innerText || el.getAttribute("aria-label") || "").trim(); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (${exact} ? t === ${q(text)} : t.includes(${q(text)}) || (el.getAttribute("aria-label") || "").includes(${q(text)})); })[${nth}]`;

const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
const clickAt = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await mouse("mousePressed", x, y);
  await mouse("mouseReleased", x, y);
  await sleep(120);
};
const click = async (selector) => {
  const p = await centre(`document.querySelector(${q(selector)})`, selector);
  await clickAt(p.x, p.y);
};
const clickText = async (text, options) => {
  const p = await centre(byText(text, options), `text "${text}"`);
  await clickAt(p.x, p.y);
};
const hover = async (selector) => {
  const p = await centre(`document.querySelector(${q(selector)})`, selector);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await sleep(120);
};
const hoverText = async (text, options) => {
  const p = await centre(byText(text, options), `text "${text}"`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await sleep(120);
};
const drag = async (x1, y1, x2, y2) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
  await mouse("mousePressed", x1, y1);
  for (let i = 1; i <= 8; i += 1) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, button: "left", buttons: 1 });
  await mouse("mouseReleased", x2, y2);
  await sleep(120);
};
const type = async (text) => {
  await send("Input.insertText", { text });
  await sleep(80);
};
const KEYS = { Enter: [13, "\r"], Escape: [27], Tab: [9], ArrowLeft: [37], ArrowRight: [39], ArrowUp: [38], ArrowDown: [40], Backspace: [8] };
const press = async (key, { meta = false, ctrl = false, shift = false } = {}) => {
  const [keyCode, text] = KEYS[key] ?? [key.toUpperCase().charCodeAt(0), key.length === 1 ? key : undefined];
  const modifiers = (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
  const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
  await send("Input.dispatchKeyEvent", { type: text && !meta && !ctrl ? "keyDown" : "rawKeyDown", text: meta || ctrl ? undefined : text, ...base });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(120);
};
const text = (selector) => evaluate(`(document.querySelector(${q(selector)})?.innerText ?? null)`);
const count = (selector) => evaluate(`document.querySelectorAll(${q(selector)}).length`);
const rect = (selector) => evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
const shot = async (path) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const out = path.startsWith("/") ? path : `${SHOTS}/${path}`;
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log("shot", out);
};
const log = (...args) => console.log(...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))));

let failed = false;
try {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const fn = new AsyncFunction("api", `const { goto, sleep, url, evaluate, waitFor, waitText, waitGone, click, clickText, clickAt, hover, hoverText, type, press, drag, text, count, rect, shot, log, send } = api;\n${code}`);
  const result = await fn({ goto, sleep, url, evaluate, waitFor, waitText, waitGone, click, clickText, clickAt, hover, hoverText, type, press, drag, text, count, rect, shot, log, send });
  if (result !== undefined) console.log(typeof result === "string" ? result : JSON.stringify(result, null, 1));
} catch (err) {
  failed = true;
  console.error("FAILED:", err.message);
  try {
    await shot("drive-failure.png");
  } catch {
    // The page is gone.
  }
}
const unique = [...new Set(logs)];
console.log(unique.length ? `console (${unique.length}):\n` + unique.slice(-12).join("\n") : "(no console errors)");
ws.close();
process.exit(failed ? 1 : 0);
