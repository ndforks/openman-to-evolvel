// OpenMan site runtime: env file, static files, analytics, scheduled jobs, preview inspector.
// No dependencies (Node 22+: node:sqlite). Used by the full-stack template's server.mjs and by static-serve.mjs.
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const PUBLISHED = process.env.OM_PUBLISHED === "1";

/* ---------------------------------------------------------------- env file */

let envCache = { mtime: -1, vars: {} };
/** Reads `<site>/.env` (KEY=VALUE lines), re-reading it when it changes, and merges it into process.env. */
export function loadEnv(siteDir) {
  const file = path.join(siteDir, ".env");
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (mtime === envCache.mtime) return envCache.vars;
  const vars = {};
  if (mtime) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        try {
          v = JSON.parse(v);
        } catch {
          v = v.slice(1, -1);
        }
      }
      vars[m[1]] = v;
    }
  }
  for (const k of Object.keys(envCache.vars)) if (!(k in vars)) delete process.env[k];
  Object.assign(process.env, vars);
  envCache = { mtime, vars };
  return vars;
}

/* ---------------------------------------------------------------- static files */

const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".pdf": "application/pdf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".wasm": "application/wasm", ".map": "application/json",
};
export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

/** Resolves a URL path inside `root`; null for traversal, hidden segments or node_modules. */
export function safePath(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((s) => s.startsWith(".") || s === "node_modules")) return null;
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

const INSPECT_TAG = '<script src="/__om/inspector.js" defer></script>';

/** Serves a file under `root`. Returns the status sent, or 0 when nothing matched (caller may 404). */
export function serveStatic(root, req, res) {
  const url = req.url || "/";
  let file = safePath(root, url);
  if (!file) return 0;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
  }
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return 0;
  }
  if (!st.isFile()) return 0;
  const type = typeOf(file);
  const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff" };
  if (!PUBLISHED && type.startsWith("text/html")) {
    let html = fs.readFileSync(file, "utf8");
    html = html.includes("</body>") ? html.replace("</body>", `${INSPECT_TAG}</body>`) : html + INSPECT_TAG;
    res.writeHead(200, { ...headers, "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : html);
    return 200;
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size, "Cache-Control": PUBLISHED ? "public, max-age=60" : "no-store" });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
  return 200;
}

/** Serves `/__om/inspector.js` in preview (never in a published site). Returns true when handled. */
export function serveInspector(req, res) {
  if (PUBLISHED || !(req.url || "").startsWith("/__om/inspector.js")) return false;
  const here = path.dirname(new URL(import.meta.url).pathname);
  const candidates = ["/root/.openman/site-kit/inspector.js", path.join(here, "inspector.js")];
  const file = candidates.find((f) => fs.existsSync(f));
  res.writeHead(file ? 200 : 404, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
  res.end(file ? fs.readFileSync(file) : "");
  return true;
}

/* ---------------------------------------------------------------- analytics */

const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python-requests|headless|lighthouse|uptime/i;

/** Page-view logging for the published site, into `<site>/.openman/analytics.db`. No cookies, no third party. */
export function createAnalytics(siteDir) {
  if (!PUBLISHED) return () => undefined;
  const dir = path.join(siteDir, ".openman");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "analytics.db"));
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS hits (ts INTEGER NOT NULL, day TEXT NOT NULL, path TEXT NOT NULL, source TEXT, visitor TEXT NOT NULL); CREATE INDEX IF NOT EXISTS hits_day ON hits(day);");
  const insert = db.prepare("INSERT INTO hits (ts, day, path, source, visitor) VALUES (?, ?, ?, ?, ?)");
  const saltFile = path.join(dir, "analytics-salt.json");
  let salt = { day: "", value: "" };
  const saltFor = (day) => {
    if (salt.day === day) return salt.value;
    try {
      const s = JSON.parse(fs.readFileSync(saltFile, "utf8"));
      if (s.day === day && s.value) return (salt = s).value;
    } catch {
      // new salt below
    }
    salt = { day, value: randomBytes(16).toString("hex") };
    try {
      fs.writeFileSync(saltFile, JSON.stringify(salt), { mode: 0o600 });
    } catch {
      // keep it in memory
    }
    return salt.value;
  };
  return function log(req, status) {
    try {
      if (req.method !== "GET" || status >= 400) return;
      const url = new URL(req.url || "/", "http://x");
      const p = url.pathname;
      if (p.startsWith("/api/") || p.startsWith("/__om/") || p.startsWith("/uploads/")) return;
      const ext = path.extname(p).toLowerCase();
      if (ext && ext !== ".html" && ext !== ".htm") return;
      if (!String(req.headers.accept || "").includes("text/html")) return;
      const ua = String(req.headers["user-agent"] || "");
      if (!ua || BOT.test(ua)) return;
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const visitor = createHash("sha256").update(`${saltFor(day)}|${ip}|${ua}`).digest("hex").slice(0, 16);
      let source = url.searchParams.get("utm_source") || null;
      if (!source && req.headers.referer) {
        try {
          const ref = new URL(String(req.headers.referer));
          if (ref.host !== req.headers.host) source = ref.hostname.replace(/^www\./, "");
        } catch {
          source = null;
        }
      }
      insert.run(now.getTime(), day, p.slice(0, 300), source ? source.slice(0, 120) : null, visitor);
    } catch {
      // analytics never breaks a request
    }
  };
}

/* ---------------------------------------------------------------- scheduled jobs */

function field(spec, value, min, max) {
  return spec.split(",").some((part) => {
    const [range, stepS] = part.split("/");
    const step = stepS ? Number(stepS) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map(Number);
      lo = a;
      hi = b === undefined || Number.isNaN(b) ? (stepS ? max : a) : b;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || step < 1) return false;
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

/** Five-field cron ("m h dom mon dow"), in the computer's local time. */
export function cronMatches(expr, d) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) return false;
  const dow = d.getDay();
  return (
    field(f[0], d.getMinutes(), 0, 59) &&
    field(f[1], d.getHours(), 0, 23) &&
    field(f[2], d.getDate(), 1, 31) &&
    field(f[3], d.getMonth() + 1, 1, 12) &&
    (field(f[4], dow, 0, 7) || (dow === 0 && field(f[4], 7, 0, 7)))
  );
}

/**
 * Runs the jobs in `<site>/.openman/schedules.json` ([{ id, name, cron, command, enabled }]) inside the published
 * site's process, in the site folder, with the site's env and SITE_URL. History: `.openman/cron-runs.jsonl`.
 */
export function startCron(siteDir, port) {
  if (!PUBLISHED) return;
  const file = path.join(siteDir, ".openman", "schedules.json");
  const runsFile = path.join(siteDir, ".openman", "cron-runs.jsonl");
  const running = new Set();
  let lastMinute = "";
  const record = (entry) => {
    try {
      fs.appendFileSync(runsFile, JSON.stringify(entry) + "\n");
      const lines = fs.readFileSync(runsFile, "utf8").split("\n").filter(Boolean);
      if (lines.length > 500) fs.writeFileSync(runsFile, lines.slice(-400).join("\n") + "\n");
    } catch {
      // history is best effort
    }
  };
  const run = (job) => {
    if (running.has(job.id)) return;
    running.add(job.id);
    const startedAt = new Date().toISOString();
    loadEnv(siteDir);
    const child = spawn("sh", ["-c", String(job.command)], { cwd: siteDir, env: { ...process.env, SITE_URL: `http://127.0.0.1:${port}` } });
    let out = "";
    const take = (b) => (out = (out + b.toString()).slice(-4000));
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      running.delete(job.id);
      record({ job: job.id, name: job.name, startedAt, finishedAt: new Date().toISOString(), ok: code === 0, code, output: out.slice(-2000) });
    });
  };
  const tick = () => {
    const now = new Date();
    const minute = now.toISOString().slice(0, 16);
    if (minute === lastMinute) return;
    lastMinute = minute;
    let jobs = [];
    try {
      jobs = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return;
    }
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (!job || !job.id || !job.command) continue;
      if (job.enabled !== false && cronMatches(job.cron, now)) run(job);
    }
  };
  // "Run now" requests: `.openman/cron-now/<job id>` files, picked up within 5 s.
  const nowDir = path.join(siteDir, ".openman", "cron-now");
  const pollNow = () => {
    let names = [];
    try {
      names = fs.readdirSync(nowDir);
    } catch {
      return;
    }
    let jobs = [];
    try {
      jobs = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      jobs = [];
    }
    for (const n of names) {
      try {
        fs.unlinkSync(path.join(nowDir, n));
      } catch {
        continue;
      }
      const job = (Array.isArray(jobs) ? jobs : []).find((j) => j && j.id === n);
      if (job && job.command) run(job);
    }
  };
  setInterval(tick, 15_000).unref();
  setInterval(pollNow, 5_000).unref();
}
