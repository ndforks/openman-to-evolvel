// Usage: node shot.mjs <url> <out.png> [waitMs] [width] [height] [--boxes=sel1|sel2]
//   Takes a headless Chrome screenshot of <url> and prints any console errors.
//   --boxes      prints the CSS box (x,y,w,h) of the first visible match of each selector.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=")]; }));
const [url, out, waitMs = "6000", w = "1280", h = "800"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/om-shots/profile-${port}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } if (d.method === "Runtime.exceptionThrown") logs.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300)); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push("ERR " + d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(+waitMs);
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(data, "base64"));
console.log(out, logs.length ? "\n" + [...new Set(logs)].slice(0, 6).join("\n") : "(no console errors)");

if (flags.boxes) {
  for (const sel of flags.boxes.split("|")) {
    const box = await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((el) => el.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(","); })()`);
    console.log(`box ${sel}: ${box ?? "not found"}`);
  }
}

ws.close(); chrome.kill();
