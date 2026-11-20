// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The program that reads and writes skills on the user's computer. It runs under the guest's `python3`
 * (stdlib plus PyYAML, which Hermes images ship) through Orgo's `/bash`, one subcommand per call.
 *
 * It only touches `$HERMES_HOME/skills` and never edits Hermes' own state: the hub lock, the bundled
 * manifest and `config.yaml` are read, never written (enable/disable goes through Orgo's skills endpoint,
 * hub installs and uninstalls through the `hermes skills` CLI).
 */
export const GUEST_PY = String.raw`
import base64, io, json, os, re, shutil, sys, time, zipfile

HOME = os.environ.get("HERMES_HOME") or "/root/.hermes"
SKILLS = os.path.join(HOME, "skills")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
TEXT_MAX = 400_000
SKIP_DIRS = {".git", "__pycache__", "node_modules", ".hub", ".locks"}

try:
    import yaml
except Exception:
    yaml = None

def out(obj):
    sys.stdout.write("@@OM@@" + json.dumps(obj, default=str) + "@@OM@@")
    sys.stdout.flush()

def fail(msg, code="failed"):
    out({"ok": False, "error": msg, "code": code})
    sys.exit(0)

def front(text):
    m = re.match(r"^---\s*\n(.*?)\n---\s*(\n|$)", text, re.S)
    if not m:
        return {}, text
    fm = {}
    raw = m.group(1)
    if yaml is not None:
        try:
            fm = yaml.safe_load(raw) or {}
        except Exception:
            fm = {}
    if not isinstance(fm, dict) or not fm:
        fm = {}
        for line in raw.split("\n"):
            mm = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
            if mm:
                fm[mm.group(1)] = mm.group(2).strip().strip("'\"")
    return fm, text[m.end():]

def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def bundled_names():
    names = set()
    try:
        with open(os.path.join(SKILLS, ".bundled_manifest"), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    names.add(line.split(":", 1)[0])
    except Exception:
        pass
    return names

def hub_installed():
    lock = read_json(os.path.join(SKILLS, ".hub", "lock.json"), {})
    inst = lock.get("installed") if isinstance(lock, dict) else None
    if isinstance(inst, dict):
        return inst
    if isinstance(inst, list):
        return {e.get("name"): e for e in inst if isinstance(e, dict) and e.get("name")}
    return {}

def disabled_names():
    path = os.path.join(HOME, "config.yaml")
    try:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
    except Exception:
        return set()
    cfg = None
    if yaml is not None:
        try:
            cfg = yaml.safe_load(raw)
        except Exception:
            cfg = None
    names = set()
    if isinstance(cfg, dict):
        sk = cfg.get("skills") or {}
        if isinstance(sk, dict):
            for n in sk.get("disabled") or []:
                names.add(str(n))
            pd = sk.get("platform_disabled") or {}
            if isinstance(pd, dict):
                for n in pd.get("api_server") or []:
                    names.add(str(n))
    return names

def platform_ok(fm):
    p = fm.get("platforms")
    if not p:
        return True
    if isinstance(p, str):
        p = [p]
    return any(str(x).lower() in ("linux", "all") for x in p)

def walk_skills():
    found = []
    if not os.path.isdir(SKILLS):
        return found
    for dp, dn, fn in os.walk(SKILLS):
        dn[:] = [d for d in dn if not d.startswith(".") and d not in SKIP_DIRS]
        if "SKILL.md" in fn:
            found.append(dp)
            dn[:] = []
    return found

def mtime_of(d):
    latest = 0
    for dp, dn, fn in os.walk(d):
        dn[:] = [x for x in dn if x not in SKIP_DIRS]
        for f in fn:
            try:
                latest = max(latest, os.path.getmtime(os.path.join(dp, f)))
            except Exception:
                pass
    return latest

def info_for(d, bundled, hub, disabled):
    try:
        with open(os.path.join(d, "SKILL.md"), encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        return None
    fm, body = front(text)
    rel = os.path.relpath(d, SKILLS)
    parts = rel.split(os.sep)
    name = str(fm.get("name") or parts[-1]).strip()
    category = parts[0] if len(parts) > 1 else ""
    meta = fm.get("metadata") if isinstance(fm.get("metadata"), dict) else {}
    hmeta = meta.get("hermes") if isinstance(meta.get("hermes"), dict) else {}
    tags = hmeta.get("tags") or fm.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    h = hub.get(name) or hub.get(parts[-1])
    if h:
        source = "hub"
    elif name in bundled or parts[-1] in bundled:
        source = "builtin"
    else:
        source = "local"
    desc = fm.get("description") or ""
    if not desc:
        for line in body.split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                desc = line
                break
    return {
        "name": name,
        "dir": rel,
        "description": str(desc).strip(),
        "category": category or str(hmeta.get("category") or ""),
        "source": source,
        "hubSource": (h or {}).get("source"),
        "identifier": (h or {}).get("identifier"),
        "trust": (h or {}).get("trust_level"),
        "enabled": name not in disabled,
        "platformOk": platform_ok(fm),
        "license": fm.get("license") and str(fm.get("license")),
        "author": fm.get("author") and str(fm.get("author")),
        "version": fm.get("version") and str(fm.get("version")),
        "tags": [str(t) for t in tags][:8] if isinstance(tags, list) else [],
        "updatedAt": mtime_of(d),
    }

def find_dir(name):
    bundled, hub, disabled = set(), {}, set()
    for d in walk_skills():
        if os.path.basename(d) == name:
            return d
    for d in walk_skills():
        i = info_for(d, bundled, hub, disabled)
        if i and i["name"] == name:
            return d
    return None

def safe_rel(p):
    p = str(p).replace("\\", "/").lstrip("/")
    parts = [x for x in p.split("/") if x not in ("", ".")]
    if not parts or any(x == ".." for x in parts):
        return None
    return "/".join(parts)

def cmd_list(args):
    bundled, hub, disabled = bundled_names(), hub_installed(), disabled_names()
    rows = []
    for d in walk_skills():
        i = info_for(d, bundled, hub, disabled)
        if i:
            rows.append(i)
    out({"ok": True, "skills": rows})

def cmd_read(args):
    d = find_dir(args["name"])
    if not d:
        fail("That skill isn't on your computer.", "not_found")
    info = info_for(d, bundled_names(), hub_installed(), disabled_names())
    files = []
    total = 0
    for dp, dn, fn in os.walk(d):
        dn[:] = sorted(x for x in dn if x not in SKIP_DIRS and not x.startswith("."))
        for f in sorted(fn):
            full = os.path.join(dp, f)
            rel = os.path.relpath(full, d).replace(os.sep, "/")
            try:
                size = os.path.getsize(full)
            except Exception:
                continue
            entry = {"path": rel, "size": size}
            if size <= TEXT_MAX and total < 2_000_000:
                try:
                    with open(full, encoding="utf-8") as fh:
                        entry["content"] = fh.read()
                    total += size
                except Exception:
                    entry["binary"] = True
            files.append(entry)
            if len(files) >= 300:
                break
    out({"ok": True, "skill": info, "files": files})

def cmd_write(args):
    name = args["name"]
    if not NAME_RE.match(name):
        fail("Skill names use lower-case letters, digits, dots, dashes and underscores.", "bad_name")
    d = find_dir(name)
    if d is None:
        if not args.get("create"):
            fail("That skill isn't on your computer.", "not_found")
        cat = args.get("category") or ""
        if cat and not NAME_RE.match(cat):
            cat = ""
        d = os.path.join(SKILLS, cat, name) if cat else os.path.join(SKILLS, name)
    elif args.get("create") and not args.get("overwrite"):
        fail("A skill with that name is already installed.", "exists")
    os.makedirs(d, exist_ok=True)
    keep = set()
    for f in args.get("files") or []:
        rel = safe_rel(f.get("path", ""))
        if not rel:
            continue
        full = os.path.join(d, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        data = base64.b64decode(f.get("b64") or "") if "b64" in f else str(f.get("content") or "").encode("utf-8")
        with open(full, "wb") as fh:
            fh.write(data)
        if rel.startswith("scripts/"):
            os.chmod(full, 0o755)
        keep.add(rel)
    if args.get("prune"):
        for dp, dn, fn in os.walk(d):
            for fname in fn:
                rel = os.path.relpath(os.path.join(dp, fname), d).replace(os.sep, "/")
                if rel not in keep:
                    os.remove(os.path.join(dp, fname))
    if not os.path.isfile(os.path.join(d, "SKILL.md")):
        fail("A skill needs a SKILL.md file.", "no_skill_md")
    out({"ok": True, "skill": info_for(d, bundled_names(), hub_installed(), disabled_names())})

def cmd_delete(args):
    d = find_dir(args["name"])
    if not d:
        out({"ok": True, "gone": True})
        return
    real = os.path.realpath(d)
    if not real.startswith(os.path.realpath(SKILLS) + os.sep):
        fail("Refusing to delete outside the skills folder.", "unsafe")
    shutil.rmtree(real)
    out({"ok": True})

def cmd_zip(args):
    d = find_dir(args["name"])
    if not d:
        fail("That skill isn't on your computer.", "not_found")
    top = os.path.basename(d)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dn, fn in os.walk(d):
            dn[:] = [x for x in dn if x not in SKIP_DIRS]
            for f in fn:
                full = os.path.join(dp, f)
                z.write(full, os.path.join(top, os.path.relpath(full, d)))
    data = buf.getvalue()
    if len(data) > 20_000_000:
        fail("That skill is too large to download here.", "too_large")
    out({"ok": True, "name": top, "b64": base64.b64encode(data).decode("ascii")})

def cmd_unpack(args):
    path = args["path"]
    try:
        with open(path, "rb") as f:
            raw = base64.b64decode(f.read())
    except Exception:
        fail("The upload didn't arrive whole. Try again.", "bad_upload")
    finally:
        try:
            os.remove(path)
        except Exception:
            pass
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        fail("That file isn't a .zip or .skill archive.", "bad_archive")
    entries = [i for i in z.infolist() if not i.is_dir()]
    names = [e.filename.replace("\\", "/") for e in entries]
    names = [n for n in names if not n.startswith("__MACOSX/") and "/." not in "/" + n]
    skill_mds = sorted((n for n in names if n == "SKILL.md" or n.endswith("/SKILL.md")), key=lambda n: n.count("/"))
    if not skill_mds:
        fail("The archive has no SKILL.md.", "no_skill_md")
    root = skill_mds[0][: -len("SKILL.md")]
    files = []
    total = 0
    for e in entries:
        n = e.filename.replace("\\", "/")
        if not n.startswith(root) or n.startswith("__MACOSX/"):
            continue
        rel = safe_rel(n[len(root):])
        if not rel or any(p.startswith(".") for p in rel.split("/")) or "__pycache__" in rel:
            continue
        total += e.file_size
        if total > 50_000_000:
            fail("The archive is too large once unpacked.", "too_large")
        files.append({"path": rel, "b64": base64.b64encode(z.read(e)).decode("ascii")})
    md = next(f for f in files if f["path"] == "SKILL.md")
    fm, _ = front(base64.b64decode(md["b64"]).decode("utf-8", "replace"))
    name = str(args.get("name") or fm.get("name") or root.rstrip("/").split("/")[-1] or "").strip().lower()
    name = re.sub(r"[^a-z0-9._-]+", "-", name).strip("-")[:64]
    if not name or not NAME_RE.match(name):
        fail("The skill has no usable name. Add name: to its SKILL.md front matter.", "bad_name")
    cmd_write({"name": name, "files": files, "create": True, "overwrite": bool(args.get("overwrite")), "prune": True})

COMMANDS = {"list": cmd_list, "read": cmd_read, "write": cmd_write, "delete": cmd_delete, "zip": cmd_zip, "unpack": cmd_unpack}

def main():
    cmd = sys.argv[1]
    args = json.loads(base64.b64decode(sys.argv[2]).decode("utf-8")) if len(sys.argv) > 2 else {}
    if len(sys.argv) > 3:
        with open(sys.argv[3], encoding="utf-8") as f:
            args.update(json.loads(base64.b64decode(f.read()).decode("utf-8")))
        os.remove(sys.argv[3])
    try:
        COMMANDS[cmd](args)
    except SystemExit:
        raise
    except Exception as e:
        fail(str(e)[:300], "guest_error")

main()
`;
