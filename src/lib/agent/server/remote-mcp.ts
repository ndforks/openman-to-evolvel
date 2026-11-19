/**
 * The MCP server (stdio, Python standard library only) that the agent's "remote" Hermes profile runs on the
 * home computer. Its tools (`mcp__omtarget__shell`, `write_file`, `screenshot`, `click`...) act on another of
 * the user's Orgo computers through Orgo's Desktop API proxy
 * (`/api/desktops/{id}/proxy/<bash|screenshot|click|type|key|scroll>`).
 *
 * Every tool takes `target`: a random per-task handle. The credential for that handle lives in
 * `~/.openman/targets/<handle>.json` (mode 600) only while the task runs; the relay writes it before a run
 * and deletes it when the run ends. The remote profile has no local terminal, file, browser, code or
 * computer-use tools, so nothing the model writes can read that file.
 *
 * Kept as a TypeScript string so the server can install it on any user's home computer.
 */
export const REMOTE_MCP_VERSION = "7";

export const REMOTE_MCP_SOURCE = String.raw`#!/usr/bin/env python3
# OpenMan remote computer tools (MCP over stdio). Version ${REMOTE_MCP_VERSION}.
import base64, json, os, re, sys, urllib.request, urllib.error

import pwd
TARGETS = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".openman", "targets")
HANDLE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

def load(target):
    if not isinstance(target, str) or not HANDLE.match(target):
        raise ValueError("Unknown target.")
    path = os.path.join(TARGETS, target + ".json")
    if not os.path.exists(path):
        raise ValueError("This task's computer is no longer connected.")
    with open(path) as f:
        return json.load(f)

def call(t, endpoint, body=None, timeout=120):
    url = "%s/desktops/%s/proxy/%s" % (t["api"], t["computer_id"], endpoint)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="GET" if body is None else "POST")
    req.add_header("Authorization", "Bearer " + t["token"])
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError("The computer answered %s: %s" % (e.code, e.read().decode(errors="replace")[:300]))

def run(t, command, timeout=120):
    timeout = max(1, min(300, int(timeout or 120)))
    r = call(t, "bash", {"command": command, "timeout": timeout}, timeout + 30)
    return r.get("output") or "", r.get("exit_code"), r.get("error")

def ps_quote(s):
    return "'" + s.replace("'", "''") + "'"

def sh_quote(s):
    return "'" + s.replace("'", "'\\''") + "'"

def text(s):
    return {"content": [{"type": "text", "text": s}]}

def t_shell(a):
    t = load(a.get("target"))
    out, code, err = run(t, a["command"], a.get("timeout", 120))
    return text(json.dumps({"output": out[-20000:], "exit_code": code, "error": err}))

def t_write_file(a):
    t = load(a.get("target"))
    path, data = a["path"], base64.b64encode(a.get("content", "").encode()).decode()
    if t.get("os") == "windows":
        cmd = "$p=%s; New-Item -ItemType Directory -Force -Path (Split-Path -Parent $p) | Out-Null; [IO.File]::WriteAllBytes($p,[Convert]::FromBase64String('%s')); (Get-Item $p).Length" % (ps_quote(path), data)
    else:
        cmd = "p=%s; mkdir -p \"$(dirname \"$p\")\" && printf %%s '%s' | base64 -d > \"$p\" && wc -c < \"$p\"" % (sh_quote(path), data)
    out, code, err = run(t, cmd, 60)
    if code not in (0, None):
        return text(json.dumps({"error": err or out[-2000:], "path": path}))
    return text(json.dumps({"path": path, "bytes_written": int(re.sub(r"\D", "", out) or 0)}))

def t_read_file(a):
    t = load(a.get("target"))
    path = a["path"]
    cmd = ("Get-Content -Raw -LiteralPath %s" % ps_quote(path)) if t.get("os") == "windows" else ("head -c 200000 -- %s" % sh_quote(path))
    out, code, err = run(t, cmd, 60)
    return text(out if code in (0, None) else json.dumps({"error": err or out[-2000:]}))

def t_list_dir(a):
    t = load(a.get("target"))
    path = a.get("path") or ("$HOME" if t.get("os") != "windows" else "$env:USERPROFILE")
    cmd = ("Get-ChildItem -Force %s | Format-Table -AutoSize | Out-String -Width 200" % path) if t.get("os") == "windows" else ("ls -la %s" % (path if path == "$HOME" else sh_quote(path)))
    out, code, err = run(t, cmd, 60)
    return text(out if code in (0, None) else json.dumps({"error": err or out[-2000:]}))

def t_open_url(a):
    t = load(a.get("target"))
    url = a["url"]
    if not re.match(r"^https?://", url):
        return text(json.dumps({"error": "Only http and https URLs can be opened."}))
    os_name = t.get("os")
    if os_name == "windows":
        cmd = "Start-Process %s" % ps_quote(url)
    elif os_name == "macos":
        cmd = "open %s" % sh_quote(url)
    else:
        b = "B=$(command -v google-chrome || command -v chromium || command -v chromium-browser || command -v firefox)"
        cmd = ("[ -n \"$DISPLAY\" ] || export DISPLAY=:99; %s; "
               "if [ -z \"$B\" ]; then setsid xdg-open %s >/dev/null 2>&1 < /dev/null & "
               "elif [ \"$(basename \"$B\")\" = firefox ]; then setsid \"$B\" %s >/dev/null 2>&1 < /dev/null & "
               "else D=\"$HOME/.config/google-chrome-orgo\"; [ -d \"$D\" ] || D=\"$HOME/.config/google-chrome\"; setsid \"$B\" --no-sandbox --no-first-run --no-default-browser-check --user-data-dir=\"$D\" %s >/dev/null 2>&1 < /dev/null & fi; "
               "sleep 3; pgrep -f -i 'chrom|firefox' >/dev/null && echo running || echo not-running") % (b, sh_quote(url), sh_quote(url), sh_quote(url))
    out, code, err = run(t, cmd, 30)
    return text(json.dumps({"opened": url, "browser": out.strip()[-40:], "exit_code": code, "error": err}))

def t_screenshot(a):
    t = load(a.get("target"))
    r = call(t, "screenshot", None, 60)
    img = r.get("image")
    if not img:
        return text(json.dumps({"error": "No screenshot came back."}))
    return {"content": [{"type": "image", "data": img, "mimeType": "image/png"}]}

def t_click(a):
    t = load(a.get("target"))
    body = {"x": int(a["x"]), "y": int(a["y"]), "button": a.get("button", "left")}
    if a.get("double"): body["double"] = True
    return text(json.dumps(call(t, "click", body, 30)))

def t_type(a):
    t = load(a.get("target"))
    return text(json.dumps(call(t, "type", {"text": a.get("text", "")}, 60)))

def t_key(a):
    t = load(a.get("target"))
    return text(json.dumps(call(t, "key", {"key": a["key"]}, 30)))

def t_scroll(a):
    t = load(a.get("target"))
    body = {"x": int(a.get("x", 640)), "y": int(a.get("y", 360)), "direction": a.get("direction", "down"), "amount": int(a.get("amount", 3))}
    return text(json.dumps(call(t, "scroll", body, 30)))

T = {"type": "string", "description": "The task's computer handle, exactly as given in your instructions."}
def schema(props, required):
    return {"type": "object", "properties": dict(target=T, **props), "required": ["target"] + required}

TOOLS = [
    ("shell", t_shell, "Run a shell command on the task's computer (bash on Linux and macOS, PowerShell on Windows). Returns output and exit code.",
     schema({"command": {"type": "string"}, "timeout": {"type": "integer", "description": "Seconds, up to 300."}}, ["command"])),
    ("write_file", t_write_file, "Create or overwrite a text file on the task's computer. Use an absolute path.",
     schema({"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"])),
    ("read_file", t_read_file, "Read a text file on the task's computer.", schema({"path": {"type": "string"}}, ["path"])),
    ("list_dir", t_list_dir, "List a folder on the task's computer (its home folder when path is omitted).", schema({"path": {"type": "string"}}, [])),
    ("open_url", t_open_url, "Open a web page in the browser on the task's computer's screen.", schema({"url": {"type": "string"}}, ["url"])),
    ("screenshot", t_screenshot, "Take a screenshot of the task's computer's screen.", schema({}, [])),
    ("click", t_click, "Click at screen pixel coordinates on the task's computer.",
     schema({"x": {"type": "integer"}, "y": {"type": "integer"}, "button": {"type": "string", "enum": ["left", "right", "middle"]}, "double": {"type": "boolean"}}, ["x", "y"])),
    ("type_text", t_type, "Type text on the task's computer's keyboard.", schema({"text": {"type": "string"}}, ["text"])),
    ("press_key", t_key, "Press a key or combination on the task's computer (Enter, Tab, ctrl+c).", schema({"key": {"type": "string"}}, ["key"])),
    ("scroll", t_scroll, "Scroll the mouse wheel at a point on the task's computer's screen.",
     schema({"x": {"type": "integer"}, "y": {"type": "integer"}, "direction": {"type": "string", "enum": ["up", "down"]}, "amount": {"type": "integer"}}, ["x", "y"])),
]
BY_NAME = {name: fn for name, fn, _, _ in TOOLS}

def reply(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error is not None: msg["error"] = error
    else: msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n"); sys.stdout.flush()

SELF = os.path.abspath(__file__)
STARTED = os.path.getmtime(SELF) if os.path.exists(SELF) else 0

def tools_now():
    # A newer copy of this file was installed: use its tools without restarting the server.
    global STARTED, TOOLS, BY_NAME
    try:
        mtime = os.path.getmtime(SELF)
        if mtime != STARTED:
            ns = {"__name__": "omtarget_reload", "__file__": SELF}
            exec(compile(open(SELF).read(), SELF, "exec"), ns)
            TOOLS, BY_NAME, STARTED = ns["TOOLS"], ns["BY_NAME"], mtime
    except Exception:
        pass
    return TOOLS, BY_NAME

def main():
  for line in sys.stdin:
      line = line.strip()
      if not line: continue
      try: msg = json.loads(line)
      except Exception: continue
      method, id_ = msg.get("method"), msg.get("id")
      if id_ is None: continue  # notifications
      if method == "initialize":
          version = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
          reply(id_, {"protocolVersion": version, "capabilities": {"tools": {}}, "serverInfo": {"name": "omtarget", "version": "${REMOTE_MCP_VERSION}"}})
      elif method == "ping":
          reply(id_, {})
      elif method == "tools/list":
          reply(id_, {"tools": [{"name": n, "description": d, "inputSchema": s} for n, _, d, s in tools_now()[0]]})
      elif method == "tools/call":
          p = msg.get("params") or {}
          fn = tools_now()[1].get(p.get("name"))
          if not fn:
              reply(id_, error={"code": -32602, "message": "Unknown tool"}); continue
          try:
              reply(id_, fn(p.get("arguments") or {}))
          except Exception as e:
              reply(id_, {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}], "isError": True})
      else:
          reply(id_, error={"code": -32601, "message": "Method not found"})

if __name__ == "__main__":
    main()
`;

/** The Hermes profile tasks on another computer run in. Its runs are reached at `/p/om-remote/v1/...`. */
export const REMOTE_PROFILE = "om-remote";

/**
 * Idempotent setup on the home computer (bash, as the agent's user): the MCP server, the `om-remote`
 * profile cloned from the default one (same model and keys, same API key), and that profile's toolsets cut
 * down to web, vision, todo, skills, clarify and the remote tools. Prints `OM_SETUP fresh=1` when anything
 * changed, which Hermes picks up within about half a minute (its gateway rescans profiles), else `fresh=0`.
 * A running server picks up a newer copy of its script by itself (`tools_now`), so updates need no restart.
 */
export function remoteSetupScript(): string {
  const source = Buffer.from(REMOTE_MCP_SOURCE, "utf8").toString("base64");
  return `set -e
command -v hermes >/dev/null || { echo "OM_SETUP missing=hermes"; exit 0; }
umask 077
fresh=0
mkdir -p "$HOME/.openman/targets"
chmod 700 "$HOME/.openman" "$HOME/.openman/targets"
S="$HOME/.openman/omtarget.py"
echo '${source}' | base64 -d > "$S.new"
if cmp -s "$S.new" "$S"; then rm -f "$S.new"; else mv "$S.new" "$S"; fresh=1; fi
P="$HOME/.hermes/profiles/${REMOTE_PROFILE}"
if [ ! -d "$P" ]; then
  hermes profile create ${REMOTE_PROFILE} --clone --no-alias --description "OpenMan: works on the computer a task was given, through the omtarget tools" >/dev/null 2>&1
  fresh=1
fi
grep -v '^API_SERVER_\\(KEY\\|ENABLED\\)=' "$P/.env" > "$P/.env.new" || true
grep -E '^API_SERVER_(KEY|ENABLED)=' "$HOME/.hermes/.env" >> "$P/.env.new" || true
if cmp -s "$P/.env.new" "$P/.env"; then rm -f "$P/.env.new"; else mv "$P/.env.new" "$P/.env"; chmod 600 "$P/.env"; fresh=1; fi
rm -rf "$P/plugins/omtarget"
out=$(python3 - "$P/config.yaml" "$S" <<'PY'
import os, sys, yaml
path, script = sys.argv[1], sys.argv[2]
cfg = yaml.safe_load(open(path)) or {}
before = yaml.safe_dump(cfg, sort_keys=True)
cfg.setdefault("platform_toolsets", {})["api_server"] = ["web", "vision", "todo", "skills", "clarify", "mcp-omtarget"]
mcp = cfg.get("mcp_servers") or {}
mcp["omtarget"] = {"command": "python3", "args": [script], "timeout": 330, "connect_timeout": 30, "enabled": True}
cfg["mcp_servers"] = mcp
plugins = cfg.get("plugins") or {}
if plugins.get("enabled"):
    plugins["enabled"] = [p for p in plugins["enabled"] if p != "omtarget"]
cfg["plugins"] = plugins
if yaml.safe_dump(cfg, sort_keys=True) != before:
    with open(path + ".tmp", "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False)
    os.replace(path + ".tmp", path)
    print("changed")
PY
)
[ "$out" = "changed" ] && fresh=1
echo "OM_SETUP fresh=$fresh"
`;
}
