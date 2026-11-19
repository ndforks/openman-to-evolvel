// Your API. `app` gives: db (node:sqlite, use prepared statements with ? placeholders), get/post/put/patch/delete,
// json(res, status, body), requireUser(req), requireRole(req, "admin"), askModel(prompt, system?).
// Handlers get (req, res, { params, query, body, user, db, env }). Secrets are in process.env (or env).
export default function routes(app) {
  app.db.exec(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  app.get("/api/notes", (req, res) => {
    const user = app.requireUser(req);
    app.json(res, 200, { notes: app.db.prepare("SELECT id, body, created_at FROM notes WHERE user_id = ? ORDER BY id DESC").all(user.id) });
  });

  app.post("/api/notes", (req, res, { body }) => {
    const user = app.requireUser(req);
    const text = String(body.body || "").trim().slice(0, 2000);
    if (!text) return app.json(res, 400, { error: "Write something first." });
    const r = app.db.prepare("INSERT INTO notes (user_id, body) VALUES (?, ?)").run(user.id, text);
    app.json(res, 201, { id: Number(r.lastInsertRowid) });
  });

  // Admins only: every account.
  app.get("/api/admin/users", (req, res) => {
    app.requireRole(req, "admin");
    app.json(res, 200, { users: app.db.prepare("SELECT id, email, name, role, created_at FROM users ORDER BY id").all() });
  });
}
