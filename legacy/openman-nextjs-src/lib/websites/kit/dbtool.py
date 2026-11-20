# OpenMan site database helper. Usage: python3 dbtool.py <site folder> <base64 JSON request>
# Every value is bound as a parameter; table and column names are accepted only when they exist in the database's own
# schema, and are then quoted. Prints one JSON object.
import base64, json, os, re, sqlite3, sys, time
from datetime import datetime, timedelta, timezone

SITES = os.path.realpath("/root/sites")
MASK = re.compile(r"password|passwd|secret|token|hash|api_?key", re.I)


def out(obj, code=0):
    print(json.dumps(obj, default=str))
    sys.exit(code)


def q(name):
    return '"' + name.replace('"', '""') + '"'


def tables(con):
    return [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def columns(con, table):
    return [{"name": r[1], "type": r[2] or "", "notnull": bool(r[3]), "default": r[4], "pk": bool(r[5]), "masked": bool(MASK.search(r[1]))}
            for r in con.execute("PRAGMA table_info(" + q(table) + ")")]


def check_table(con, table):
    if table not in tables(con):
        out({"error": "Unknown table."}, 2)
    sql = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0] or ""
    return "WITHOUT ROWID" not in sql.upper()


def check_values(con, table, values):
    cols = {c["name"]: c for c in columns(con, table)}
    if not isinstance(values, dict) or not values:
        out({"error": "Nothing to save."}, 2)
    clean = {}
    for k, v in values.items():
        if k not in cols:
            out({"error": "Unknown column: " + str(k)[:60]}, 2)
        if cols[k]["masked"]:
            out({"error": "Protected columns cannot be edited here: " + k}, 2)
        if isinstance(v, bool):
            v = int(v)
        if v is not None and not isinstance(v, (int, float, str)):
            out({"error": "Values must be text, numbers or null."}, 2)
        clean[k] = v
    return clean


def mask_row(cols, row):
    return [("••••" if c["masked"] and v is not None else (v if not isinstance(v, bytes) else "<%d bytes>" % len(v))) for c, v in zip(cols, row)]


def analytics(folder, days):
    path = os.path.join(folder, ".openman", "analytics.db")
    today = datetime.now(timezone.utc).date()
    span = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    if not os.path.exists(path):
        out({"days": [{"day": d, "views": 0, "visitors": 0} for d in span], "sources": [], "pages": [], "totals": {"views": 0, "visitors": 0}})
    con = sqlite3.connect("file:" + path + "?mode=ro", uri=True)
    start = span[0]
    by_day = {r[0]: (r[1], r[2]) for r in con.execute("SELECT day, COUNT(*), COUNT(DISTINCT visitor) FROM hits WHERE day >= ? GROUP BY day", (start,))}
    sources = [{"source": r[0] or "Direct", "views": r[1], "visitors": r[2]} for r in con.execute(
        "SELECT source, COUNT(*), COUNT(DISTINCT day || visitor) FROM hits WHERE day >= ? GROUP BY source ORDER BY 2 DESC LIMIT 10", (start,))]
    pages = [{"path": r[0], "views": r[1]} for r in con.execute(
        "SELECT path, COUNT(*) FROM hits WHERE day >= ? GROUP BY path ORDER BY 2 DESC LIMIT 10", (start,))]
    tot = con.execute("SELECT COUNT(*), COUNT(DISTINCT day || visitor) FROM hits WHERE day >= ?", (start,)).fetchone()
    out({"days": [{"day": d, "views": by_day.get(d, (0, 0))[0], "visitors": by_day.get(d, (0, 0))[1]} for d in span],
         "sources": sources, "pages": pages, "totals": {"views": tot[0], "visitors": tot[1]}})


def main():
    folder = os.path.realpath(sys.argv[1])
    if os.path.dirname(folder) != SITES:
        out({"error": "Not a site folder."}, 2)
    req = json.loads(base64.b64decode(sys.argv[2]).decode("utf-8"))
    op = req.get("op")
    if op == "analytics":
        analytics(folder, max(1, min(int(req.get("days") or 30), 90)))
    path = os.path.join(folder, ".openman", "data", "app.db")
    if not os.path.exists(path):
        out({"error": "This site has no database.", "code": "no_db"}, 0 if op == "tables" else 2)
    con = sqlite3.connect(path, timeout=5)
    con.execute("PRAGMA foreign_keys=ON")
    if op == "tables":
        res = []
        for t in tables(con):
            res.append({"name": t, "rows": con.execute("SELECT COUNT(*) FROM " + q(t)).fetchone()[0]})
        out({"tables": res})
    table = str(req.get("table") or "")
    has_rowid = check_table(con, table)
    if op == "schema":
        sql = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
        out({"columns": columns(con, table), "sql": sql, "editable": has_rowid})
    if op == "rows":
        cols = columns(con, table)
        limit = max(1, min(int(req.get("limit") or 50), 200))
        offset = max(0, int(req.get("offset") or 0))
        sel = ("rowid AS __rowid, " if has_rowid else "") + ", ".join(q(c["name"]) for c in cols)
        cur = con.execute("SELECT " + sel + " FROM " + q(table) + " ORDER BY " + ("rowid" if has_rowid else "1") + " DESC LIMIT ? OFFSET ?", (limit, offset))
        rows = []
        for r in cur.fetchall():
            rid, vals = (r[0], r[1:]) if has_rowid else (None, r)
            rows.append({"rowid": rid, "values": mask_row(cols, vals)})
        total = con.execute("SELECT COUNT(*) FROM " + q(table)).fetchone()[0]
        out({"columns": cols, "rows": rows, "total": total, "editable": has_rowid})
    if not has_rowid:
        out({"error": "This table cannot be edited here."}, 2)
    if op == "insert":
        vals = check_values(con, table, req.get("values"))
        keys = list(vals.keys())
        cur = con.execute("INSERT INTO " + q(table) + " (" + ", ".join(q(k) for k in keys) + ") VALUES (" + ", ".join("?" for _ in keys) + ")", [vals[k] for k in keys])
        con.commit()
        out({"ok": True, "rowid": cur.lastrowid})
    rowid = req.get("rowid")
    if not isinstance(rowid, int):
        out({"error": "Pick a row."}, 2)
    if op == "update":
        vals = check_values(con, table, req.get("values"))
        keys = list(vals.keys())
        cur = con.execute("UPDATE " + q(table) + " SET " + ", ".join(q(k) + " = ?" for k in keys) + " WHERE rowid = ?", [vals[k] for k in keys] + [rowid])
        con.commit()
        out({"ok": True, "changed": cur.rowcount})
    if op == "delete":
        cur = con.execute("DELETE FROM " + q(table) + " WHERE rowid = ?", (rowid,))
        con.commit()
        out({"ok": True, "changed": cur.rowcount})
    out({"error": "Unknown operation."}, 2)


try:
    main()
except sqlite3.Error as e:
    out({"error": "Database error: " + str(e)[:200]}, 2)
