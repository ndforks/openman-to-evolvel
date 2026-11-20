// Full-stack site server (OpenMan template). No dependencies: Node 22+ with node:sqlite.
// - Database: SQLite at <site>/.openman/data/app.db (never published, never committed). Tables are made in routes.mjs.
// - Sign-in: email + password (scrypt), session cookie, roles ("admin" for the first account, then "user").
// - Files: POST /api/uploads (signed in) stores into <site>/.openman/uploads, served at /uploads/<name>.
// - Secrets: <site>/.env (written by the app from the dashboard's Secrets tab; never published or committed), in process.env.
// - AI: POST /api/ai for signed-in users when the owner turned AI on (OM_AI_ENABLED=1); the model credential stays on
//   this computer and is never sent to the browser.
// - Your API: routes.mjs. Your pages: public/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createAnalytics, loadEnv, PUBLISHED, safePath, serveInspector, serveStatic, startCron, typeOf } from "./om-runtime.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const siteDir = path.resolve(process.env.OM_SITE_DIR || here);
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(here, "public");
const dataDir = path.join(siteDir, ".openman", "data");
const uploadDir = path.join(siteDir, ".openman", "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
loadEnv(siteDir);

/* ---------------------------------------------------------------- database */

export const db = new DatabaseSync(path.join(dataDir, "app.db"));
db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL, stored TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, type TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0);
`);

/* ---------------------------------------------------------------- helpers */

const sha = (s) => createHash("sha256").update(s).digest("hex");
const hashPassword = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("hex")}`;
};
const checkPassword = (pw, stored) => {
  const [, salt, hex] = String(stored).split("$");
  if (!salt || !hex) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

export function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req, max = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error("Too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const secure = (req) => String(req.headers["x-forwarded-proto"] || "").includes("https");
const sessionCookie = (req, token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? "; Secure" : ""}`;

/** The signed-in user ({ id, email, name, role }) or null. */
export function currentUser(req) {
  const token = cookies(req).sid;
  if (!token) return null;
  const row = db.prepare("SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").get(sha(token), Date.now());
  return row ? { ...row } : null;
}

function startSession(req, res, userId) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, Date.now() + 30 * 86400_000);
  res.setHeader("Set-Cookie", sessionCookie(req, token, 30 * 86400));
}

const attempts = new Map();
function limited(req, key, max = 10, windowMs = 10 * 60_000) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const k = `${key}|${ip}`;
  const now = Date.now();
  const list = (attempts.get(k) || []).filter((t) => now - t < windowMs);
  list.push(now);
  attempts.set(k, list);
  return list.length > max;
}

/* ---------------------------------------------------------------- router */

const routes = [];
const add = (method) => (pattern, handler) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => (keys.push(k), "/([^/]+)")) + "/?$");
  routes.push({ method, re, keys, handler });
};
export const app = {
  db,
  get: add("GET"),
  post: add("POST"),
  put: add("PUT"),
  patch: add("PATCH"),
  delete: add("DELETE"),
  json,
  currentUser,
  /** Throws 401 unless signed in; returns the user. */
  requireUser(req) {
    const u = currentUser(req);
    if (!u) throw Object.assign(new Error("Sign in first."), { status: 401 });
    return u;
  },
  /** Throws 403 unless the signed-in user has one of `roles`. */
  requireRole(req, ...roles) {
    const u = app.requireUser(req);
    if (!roles.includes(u.role)) throw Object.assign(new Error("Not allowed."), { status: 403 });
    return u;
  },
};

/* ---------------------------------------------------------------- built-in API */

app.post("/api/auth/signup", async (req, res, { body }) => {
  if (limited(req, "signup", 20)) return json(res, 429, { error: "Too many attempts. Try again later." });
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Enter a valid email." });
  if (password.length < 8) return json(res, 400, { error: "Use at least 8 characters for the password." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return json(res, 409, { error: "That email already has an account." });
  const first = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
  const r = db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run(email, String(body.name || "").slice(0, 120) || null, hashPassword(password), first ? "admin" : "user");
  startSession(req, res, Number(r.lastInsertRowid));
  json(res, 201, { user: currentUserById(Number(r.lastInsertRowid)) });
});

const currentUserById = (id) => ({ ...db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(id) });

app.post("/api/auth/login", async (req, res, { body }) => {
  if (limited(req, "login")) return json(res, 429, { error: "Too many attempts. Try again later." });
  const row = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(String(body.email || "").trim().toLowerCase());
  if (!row || !checkPassword(String(body.password || ""), row.password_hash)) return json(res, 401, { error: "Wrong email or password." });
  startSession(req, res, row.id);
  json(res, 200, { user: currentUserById(row.id) });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = cookies(req).sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
});

app.get("/api/auth/me", async (req, res) => json(res, 200, { user: currentUser(req) }));

app.post("/api/uploads", async (req, res, { query, raw }) => {
  const user = app.requireUser(req);
  const name = String(query.get("name") || "file").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100) || "file";
  const stored = `${randomBytes(8).toString("hex")}-${name}`;
  const bytes = raw;
  fs.writeFileSync(path.join(uploadDir, stored), bytes);
  db.prepare("INSERT INTO files (user_id, name, stored, size, type) VALUES (?, ?, ?, ?, ?)").run(user.id, name, stored, bytes.length, typeOf(name));
  json(res, 201, { url: `/uploads/${stored}`, name, size: bytes.length });
});

app.post("/api/ai", async (req, res, { body }) => {
  app.requireUser(req);
  if (process.env.OM_AI_ENABLED !== "1") return json(res, 403, { error: "AI features are off for this site." });
  const day = new Date().toISOString().slice(0, 10);
  const limit = Number(process.env.OM_AI_DAILY_LIMIT || 200);
  db.prepare("INSERT INTO ai_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1").run(day);
  if (db.prepare("SELECT calls FROM ai_usage WHERE day = ?").get(day).calls > limit) return json(res, 429, { error: "The site's AI limit for today is used up." });
  const text = await askModel(String(body.prompt || "").slice(0, 20000), body.system ? String(body.system).slice(0, 8000) : undefined, Math.min(Number(body.max_tokens) || 1024, 4096));
  json(res, 200, { text });
});

/** The computer's own model credential (the one its agent uses, billed to the computer owner's Orgo account). */
function modelCredential() {
  const vars = {};
  try {
    for (const line of fs.readFileSync("/root/.hermes/.env", "utf8").split("\n")) {
      const m = line.match(/^(ANTHROPIC_API_KEY|ANTHROPIC_BASE_URL)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // none
  }
  return { key: vars.ANTHROPIC_API_KEY, base: (vars.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "") };
}

export async function askModel(prompt, system, maxTokens = 1024) {
  const { key, base } = modelCredential();
  if (!key) throw Object.assign(new Error("This computer has no model credential."), { status: 503 });
  const r = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.OM_AI_MODEL || "claude-haiku-5-5", max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error("The model could not answer."), { status: 502 });
  return (j?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}
app.askModel = askModel;

/* ---------------------------------------------------------------- your routes */

try {
  const mod = await import(path.join(here, "routes.mjs"));
  if (typeof mod.default === "function") await mod.default(app);
} catch (err) {
  if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
}

/* ---------------------------------------------------------------- server */

const log = createAnalytics(siteDir);

http
  .createServer(async (req, res) => {
    loadEnv(siteDir);
    const url = new URL(req.url || "/", "http://local");
    try {
      if (url.pathname.startsWith("/api/")) {
        // Cross-site form posts are refused: a browser request from another origin must not act for a signed-in user.
        const origin = req.headers.origin;
        if (req.method !== "GET" && req.method !== "HEAD" && origin) {
          let host = "";
          try {
            host = new URL(origin).host;
          } catch {
            host = "";
          }
          if (host !== req.headers.host) return json(res, 403, { error: "Cross-site request refused." });
        }
        const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
        if (!route) return json(res, 404, { error: "Not found." });
        const m = url.pathname.match(route.re);
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        let raw = Buffer.alloc(0);
        let body = {};
        if (req.method !== "GET" && req.method !== "HEAD") {
          raw = await readBody(req, url.pathname === "/api/uploads" ? 20 * 1024 * 1024 : 1024 * 1024);
          if (String(req.headers["content-type"] || "").includes("application/json") && raw.length) body = JSON.parse(raw.toString("utf8"));
        }
        return await route.handler(req, res, { params, query: url.searchParams, body, raw, user: currentUser(req), db, env: process.env });
      }
      if (url.pathname.startsWith("/uploads/")) {
        const file = safePath(uploadDir, url.pathname.slice("/uploads".length));
        if (!file || !fs.existsSync(file)) return json(res, 404, { error: "Not found." });
        const type = typeOf(file);
        const risky = /html|svg|xml|javascript/.test(type);
        res.writeHead(200, { "Content-Type": risky ? "application/octet-stream" : type, "X-Content-Type-Options": "nosniff", ...(risky ? { "Content-Disposition": "attachment" } : {}) });
        return fs.createReadStream(file).pipe(res);
      }
      if (serveInspector(req, res)) return;
      const status = req.method === "GET" || req.method === "HEAD" ? serveStatic(publicDir, req, res) : 0;
      if (status) return log(req, status);
      // Single-page apps: unknown paths without an extension get index.html.
      if (req.method === "GET" && !path.extname(url.pathname) && safePath(publicDir, url.pathname) && fs.existsSync(path.join(publicDir, "index.html"))) {
        const original = req.url;
        req.url = "/";
        const sent = serveStatic(publicDir, req, res);
        req.url = original;
        return log(req, sent);
      }
      json(res, 404, { error: "Not found." });
    } catch (err) {
      const status = err?.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? "Something went wrong." : err.message });
      else res.end();
    }
  })
  .listen(port, "0.0.0.0", () => console.log(`${PUBLISHED ? "published" : "preview"} app on :${port}`));

startCron(siteDir, port);
