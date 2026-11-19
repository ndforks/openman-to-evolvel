// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The small program the server (and the agent) runs on the user's computer for generator work:
 * set up the Python environment, read a task's generator state, bundle a deck for the viewer,
 * render slide thumbnails, and export a deck to PDF, PPTX or a single web page.
 *
 * Installed on demand at `~/.openman/bin/om_gen.py` (refreshed when this text changes). Runs with the
 * system python3 for everything that needs only the standard library; exports use the venv.
 */
export const HELPER_PY = String.raw`#!/usr/bin/env python3
import base64, glob, gzip, html, json, mimetypes, os, re, shutil, subprocess, sys, tempfile, time

HOME = os.path.expanduser("~")
OM = os.path.join(HOME, ".openman")
VENV = os.path.join(OM, "venv")
VPY = os.path.join(VENV, "bin", "python")
PKGS = ["python-pptx", "matplotlib", "pandas", "openpyxl", "edge-tts", "pypdf"]

def out(obj):
    sys.stdout.write(json.dumps(obj))
    sys.stdout.flush()

def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def inside(folder, rel):
    p = os.path.realpath(os.path.join(folder, rel))
    root = os.path.realpath(folder)
    return p if (p == root or p.startswith(root + os.sep)) else None

# ------------------------------------------------------------------ bootstrap

def bootstrap():
    os.makedirs(OM, exist_ok=True)
    ok = os.path.exists(VPY) and subprocess.run([VPY, "-c", "import pptx, matplotlib, pandas, openpyxl, edge_tts, pypdf"], capture_output=True).returncode == 0
    if ok:
        return out({"ok": True, "python": VPY, "installed": False})
    env = dict(os.environ, PATH=os.path.join(HOME, ".local", "bin") + ":" + os.environ.get("PATH", ""))
    if not shutil.which("uv", path=env["PATH"]):
        subprocess.run("curl -LsSf https://astral.sh/uv/install.sh | sh", shell=True, capture_output=True, env=env)
    uv = shutil.which("uv", path=env["PATH"])
    if not uv:
        return out({"ok": False, "error": "could not install uv"})
    if not os.path.exists(VPY):
        subprocess.run([uv, "venv", "-q", VENV], capture_output=True, env=env)
    r = subprocess.run([uv, "pip", "install", "-q", "--python", VPY] + PKGS, capture_output=True, text=True, env=env)
    ok = r.returncode == 0
    out({"ok": ok, "python": VPY, "installed": True, "error": None if ok else r.stderr[-400:]})

# ---------------------------------------------------------------------- probe

def probe():
    env_names = set()
    try:
        for line in open(os.path.join(HOME, ".hermes", ".env"), encoding="utf-8"):
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(\S+)", line)
            if m:
                env_names.add(m.group(1))
    except Exception:
        pass
    toolsets = []
    try:
        cfg = open(os.path.join(HOME, ".hermes", "config.yaml"), encoding="utf-8").read()
        m = re.search(r"\n  api_server:\n((?:    - .*\n)+)", cfg)
        if m:
            toolsets = [t.strip()[2:].strip() for t in m.group(1).splitlines()]
    except Exception:
        pass
    chrome = next((c for c in ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"] if os.path.exists(c)), shutil.which("google-chrome"))
    out({
        "python3": bool(shutil.which("python3")),
        "chrome": bool(chrome),
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "venv": os.path.exists(VPY),
        "fetch": bool(shutil.which("curl")),
        "toolsets": toolsets,
        "keys": sorted(k for k in env_names if k in ("FAL_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "KREA_API_KEY", "ELEVENLABS_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "REPLICATE_API_TOKEN")),
    })

# ---------------------------------------------------------------------- state

def mtime(p):
    try:
        return int(os.path.getmtime(p) * 1000)
    except Exception:
        return 0

def state(folder):
    marker = read_json(os.path.join(folder, ".openman", "generator.json"))
    res = {"folder": folder, "marker": marker}
    kind = (marker or {}).get("kind")
    if kind == "slides":
        deck_path = os.path.join(folder, "slides", "deck.json")
        res["deck"] = read_json(deck_path)
        stamps = [mtime(deck_path)] + [mtime(p) for p in glob.glob(os.path.join(folder, "slides", "*.html"))] + [mtime(os.path.join(folder, "slides", "theme.css"))]
        res["updatedAt"] = max(stamps) if stamps else 0
        res["exports"] = exports(folder)
    elif kind == "data":
        res["analysis"] = read_json(os.path.join(folder, "analysis", "analysis.json"))
    elif kind == "research":
        res["plan"] = read_json(os.path.join(folder, "research", "plan.json"))
        res["progress"] = read_json(os.path.join(folder, "research", "progress.json"))
        res["result"] = read_json(os.path.join(folder, "research", "research.json"))
        done, failed = [], []
        for p in sorted(glob.glob(os.path.join(folder, "research", "items", "*.json"))):
            item = read_json(p)
            iid = os.path.splitext(os.path.basename(p))[0]
            if isinstance(item, dict) and item.get("status") == "failed":
                failed.append(iid)
            elif item is not None:
                done.append(iid)
        res["done"], res["failed"] = done, failed
    elif kind == "audio":
        res["audio"] = read_json(os.path.join(folder, "audio", "audio.json"))
    out(res)

def exports(folder):
    found = {}
    d = os.path.join(folder, "slides", "exports")
    for fmt, ext in (("pdf", ".pdf"), ("pptx", ".pptx"), ("html", ".html")):
        hits = sorted(glob.glob(os.path.join(d, "*" + ext)), key=mtime)
        if hits:
            found[fmt] = os.path.relpath(hits[-1], folder)
    return found

# ---------------------------------------------------------------- compose

LINK = re.compile(r"<link\b[^>]*>", re.I)
SRC = re.compile(r"""(\bsrc\s*=\s*)(["'])([^"']+)\2""", re.I)
URL = re.compile(r"""url\(\s*(["']?)([^)"']+)\1\s*\)""", re.I)

def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode())

def local(base, ref, root):
    if re.match(r"^(?:[a-z]+:|//|#|data:)", ref, re.I):
        return None
    ref = ref.split("#")[0].split("?")[0]
    p = os.path.realpath(os.path.join(base, ref))
    r = os.path.realpath(root)
    return p if p.startswith(r + os.sep) and os.path.isfile(p) else None

def inline_css(css, base, root):
    def sub(m):
        p = local(base, m.group(2), root)
        return "url(%s)" % data_uri(p) if p else m.group(0)
    return URL.sub(sub, css)

def compose(folder, file):
    root = folder
    slides = os.path.join(folder, "slides")
    p = inside(slides, file)
    if not p or not os.path.isfile(p):
        return "<!doctype html><html><body style='margin:0;display:flex;align-items:center;justify-content:center;height:720px;font:24px sans-serif;color:#888;background:#111'>Slide not written yet</body></html>"
    base = os.path.dirname(p)
    doc = open(p, encoding="utf-8", errors="replace").read()
    def link_sub(m):
        tag = m.group(0)
        if not re.search(r"""rel\s*=\s*["']?stylesheet""", tag, re.I):
            return tag
        h = re.search(r"""href\s*=\s*(["'])([^"']+)\1""", tag, re.I)
        lp = local(base, h.group(2), root) if h else None
        if not lp:
            return tag
        css = open(lp, encoding="utf-8", errors="replace").read()
        return "<style>%s</style>" % inline_css(css, os.path.dirname(lp), root)
    doc = LINK.sub(link_sub, doc)
    def src_sub(m):
        sp = local(base, m.group(3), root)
        return "%s%s%s%s" % (m.group(1), m.group(2), data_uri(sp) if sp else m.group(3), m.group(2))
    doc = SRC.sub(src_sub, doc)
    doc = re.sub(r"(<style\b[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + inline_css(m.group(2), base, root) + m.group(3), doc, flags=re.S | re.I)
    doc = re.sub(r"""(style\s*=\s*")([^"]*)(")""", lambda m: m.group(1) + inline_css(m.group(2), base, root) + m.group(3), doc, flags=re.I)
    return doc

def deck_bundle(folder, dest):
    deck = read_json(os.path.join(folder, "slides", "deck.json"))
    if not isinstance(deck, dict):
        return out({"ok": False, "error": "no deck yet"})
    docs = [compose(folder, s.get("file", "")) for s in deck.get("slides", [])]
    stamps = [mtime(os.path.join(folder, "slides", "deck.json"))] + [mtime(p) for p in glob.glob(os.path.join(folder, "slides", "*.html"))]
    body = json.dumps({"deck": deck, "html": docs, "exports": exports(folder), "updatedAt": max(stamps)})
    with gzip.open(dest, "wb") as f:
        f.write(body.encode("utf-8"))
    out({"ok": True, "path": dest, "size": os.path.getsize(dest)})

# -------------------------------------------------------------------- render

def chrome_bin():
    for c in ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]:
        if os.path.exists(c):
            return c
    return shutil.which("google-chrome") or shutil.which("chromium")

def chrome(args, timeout=90):
    prof = tempfile.mkdtemp(prefix="om-chrome-")
    try:
        cmd = [chrome_bin(), "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--user-data-dir=" + prof, "--virtual-time-budget=4000"] + args
        subprocess.run(cmd, capture_output=True, timeout=timeout)
    finally:
        shutil.rmtree(prof, ignore_errors=True)

def staged(folder, deck, page_css=""):
    """Each slide composed into a temp folder (self-contained), so Chrome renders exactly what the viewer shows."""
    tmp = tempfile.mkdtemp(prefix="om-deck-")
    paths = []
    for i, s in enumerate(deck.get("slides", [])):
        doc = compose(folder, s.get("file", ""))
        if page_css:
            tag = "<style>" + page_css + "</style>"
            doc = doc.replace("</head>", tag + "</head>", 1) if "</head>" in doc else tag + doc
        p = os.path.join(tmp, "%02d.html" % (i + 1))
        open(p, "w", encoding="utf-8").write(doc)
        paths.append(p)
    return tmp, paths

def safe_name(title):
    n = re.sub(r"[^A-Za-z0-9 _-]+", "", title or "deck").strip().replace(" ", "-")
    return (n or "deck")[:60]

def thumbs(folder):
    deck = read_json(os.path.join(folder, "slides", "deck.json"))
    if not isinstance(deck, dict):
        return out({"ok": False, "error": "no deck.json"})
    tmp, paths = staged(folder, deck)
    d = os.path.join(folder, "slides", "thumbs")
    os.makedirs(d, exist_ok=True)
    made = []
    for i, p in enumerate(paths):
        dest = os.path.join(d, "%02d.png" % (i + 1))
        chrome(["--window-size=1280,720", "--screenshot=" + dest, "file://" + p])
        if os.path.exists(dest):
            made.append(dest)
    shutil.rmtree(tmp, ignore_errors=True)
    out({"ok": True, "thumbs": made})

def export(folder, fmt):
    deck = read_json(os.path.join(folder, "slides", "deck.json"))
    if not isinstance(deck, dict) or not deck.get("slides"):
        return out({"ok": False, "error": "The deck has no slides yet."})
    d = os.path.join(folder, "slides", "exports")
    os.makedirs(d, exist_ok=True)
    name = safe_name(deck.get("title"))
    if fmt == "html":
        return export_html(folder, deck, os.path.join(d, name + ".html"))
    if not os.path.exists(VPY):
        return out({"ok": False, "error": "The export tools are not installed yet."})
    if fmt == "pdf":
        tmp, paths = staged(folder, deck, "@page{size:1280px 720px;margin:0}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}")
        pdfs = []
        for p in paths:
            dest = p[:-5] + ".pdf"
            chrome(["--no-pdf-header-footer", "--print-to-pdf=" + dest, "file://" + p])
            if os.path.exists(dest):
                pdfs.append(dest)
        if not pdfs:
            return out({"ok": False, "error": "Chrome made no PDF."})
        dest = os.path.join(d, name + ".pdf")
        script = "import sys\nfrom pypdf import PdfWriter, PdfReader\nw=PdfWriter()\nfor p in sys.argv[2:]:\n  r=PdfReader(p)\n  w.add_page(r.pages[0])\nw.write(sys.argv[1])\n"
        r = subprocess.run([VPY, "-c", script, dest] + pdfs, capture_output=True, text=True)
        shutil.rmtree(tmp, ignore_errors=True)
        if r.returncode != 0:
            return out({"ok": False, "error": r.stderr[-300:]})
        return out({"ok": True, "path": os.path.relpath(dest, folder), "pages": len(pdfs)})
    if fmt == "pptx":
        tmp, paths = staged(folder, deck)
        pngs = []
        for p in paths:
            dest = p[:-5] + ".png"
            chrome(["--window-size=1280,720", "--force-device-scale-factor=2", "--screenshot=" + dest, "file://" + p])
            pngs.append(dest if os.path.exists(dest) else "")
        spec = {"title": deck.get("title", ""), "slides": [{"image": png, "title": s.get("title", ""), "notes": s.get("notes", "")} for png, s in zip(pngs, deck.get("slides", []))]}
        spec_path = os.path.join(tmp, "spec.json")
        json.dump(spec, open(spec_path, "w"))
        dest = os.path.join(d, name + ".pptx")
        script = r'''
import json, sys
from pptx import Presentation
from pptx.util import Emu
spec = json.load(open(sys.argv[1]))
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
blank = prs.slide_layouts[6]
prs.core_properties.title = spec["title"]
for s in spec["slides"]:
    slide = prs.slides.add_slide(blank)
    if s["image"]:
        slide.shapes.add_picture(s["image"], 0, 0, width=prs.slide_width, height=prs.slide_height)
    slide.name = s["title"][:200]
    if s["notes"]:
        slide.notes_slide.notes_text_frame.text = s["notes"]
prs.save(sys.argv[2])
'''
        r = subprocess.run([VPY, "-c", script, spec_path, dest], capture_output=True, text=True)
        shutil.rmtree(tmp, ignore_errors=True)
        if r.returncode != 0:
            return out({"ok": False, "error": r.stderr[-300:]})
        return out({"ok": True, "path": os.path.relpath(dest, folder), "slides": len(pngs)})
    out({"ok": False, "error": "unknown format"})

def export_html(folder, deck, dest):
    frames = []
    for i, s in enumerate(deck.get("slides", [])):
        doc = compose(folder, s.get("file", ""))
        frames.append('<section class="s" data-i="%d"><iframe sandbox="allow-scripts" srcdoc="%s"></iframe><aside>%s</aside></section>' % (i, html.escape(doc, quote=True), html.escape(s.get("notes", ""))))
    page = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title>
<style>html,body{margin:0;height:100%%;background:#0d0d0d;color:#ddd;font-family:system-ui,sans-serif;overflow:hidden}
.s{position:absolute;inset:0;display:none;align-items:center;justify-content:center}.s.on{display:flex}
.s iframe{width:1280px;height:720px;border:0;transform-origin:center;background:#000}
.s aside{display:none}body.notes .s.on aside{display:block;position:fixed;left:0;right:0;bottom:0;max-height:30vh;overflow:auto;background:#181818;padding:12px 20px;font-size:15px;white-space:pre-wrap}
.bar{position:fixed;right:16px;bottom:12px;font-size:13px;opacity:.6}</style></head><body>%s
<div class="bar"><span id="n"></span> &middot; arrows to move &middot; N for notes &middot; F for full screen</div>
<script>var s=[].slice.call(document.querySelectorAll('.s')),i=0;function fit(){var k=Math.min(innerWidth/1280,innerHeight/720);s.forEach(function(e){e.querySelector('iframe').style.transform='scale('+k+')'})}
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(e,j){e.classList.toggle('on',j===i)});document.getElementById('n').textContent=(i+1)+' / '+s.length}
addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')go(i+1);else if(e.key==='ArrowLeft'||e.key==='PageUp')go(i-1);else if(e.key==='n'||e.key==='N')document.body.classList.toggle('notes');else if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()});
addEventListener('resize',fit);fit();go(0)</script></body></html>""" % (html.escape(deck.get("title", "Slides")), "".join(frames))
    open(dest, "w", encoding="utf-8").write(page)
    out({"ok": True, "path": os.path.relpath(dest, folder), "slides": len(frames)})

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "bootstrap": bootstrap()
        elif cmd == "probe": probe()
        elif cmd == "state": state(sys.argv[2])
        elif cmd == "deck": deck_bundle(sys.argv[2], sys.argv[3])
        elif cmd == "thumbs": thumbs(sys.argv[2])
        elif cmd == "export": export(sys.argv[2], sys.argv[3])
        else: out({"ok": False, "error": "usage: om_gen.py bootstrap|probe|state|deck|thumbs|export"})
    except Exception as e:
        out({"ok": False, "error": "%s: %s" % (type(e).__name__, e)})
`;
