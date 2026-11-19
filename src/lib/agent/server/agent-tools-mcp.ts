// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The app's task tools on the user's home computer: a stdio MCP server (`omtools`, Python standard library only)
 * and the `om-chat` Hermes profile (Chat and Plan modes: web, vision, file, clarify, skills and these tools; no
 * terminal, browser, code or desktop).
 *
 * How a call reaches the app without any credential on the computer: the server writes the call to
 * `~/.openman/calls/<task>.<id>.req` and waits for `<id>.res`. The relay, which already follows the run's events,
 * sees the tool start, reads the call through the owner's Orgo key, answers it from the app's data scoped to that
 * owner and that task, and writes the result back (see `bridge.ts`). The same tools are also served over HTTP to the
 * signed-in user at `/api/agent-tools/mcp`.
 *
 * Kept as a TypeScript string so provisioning can install it on any user's home computer.
 */
export const AGENT_TOOLS_VERSION = "6";
export const CHAT_PROFILE = "om-chat";
export const CHAT_TOOLSETS = ["web", "vision", "file", "clarify", "skills", "todo", "mcp-omtools"];

export const AGENT_TOOLS_SOURCE = String.raw`#!/usr/bin/env python3
# OpenMan task tools (MCP over stdio). Version ${AGENT_TOOLS_VERSION}.
import json, os, re, sys, time, uuid, pwd

CALLS = os.path.join(pwd.getpwuid(os.getuid()).pw_dir, ".openman", "calls")
HANDLE = re.compile(r"^[A-Za-z0-9]{8,64}$")
T = {"type": "string", "description": "This task's handle, exactly as given in your instructions."}

def schema(props, required):
    return {"type": "object", "properties": dict(task=T, **props), "required": ["task"] + required}

REF = {"type": "string", "description": "Id of the referenced task (from your instructions)."}
TOOLS = [
    ("task_outline", "Outline of an earlier task the user referenced: title, status, its messages as numbered parts with a one-line preview each, and its files. Read this first, then read only the parts you need.",
     schema({"ref": REF}, ["ref"]), 60),
    ("task_search", "Search one referenced task (or every referenced task when ref is omitted) for words; returns the matching parts with a snippet.",
     schema({"ref": REF, "query": {"type": "string"}}, ["query"]), 60),
    ("task_read", "Read parts of a referenced task in full, by part number (from task_outline or task_search).",
     schema({"ref": REF, "from": {"type": "integer"}, "to": {"type": "integer"}}, ["ref", "from"]), 60),
    ("create_parallel_tasks", "Start separate tasks that run in parallel with this one, each with its own short brief (they do not see this conversation). Use only when the user asked for work to be split into parallel tasks. The user is asked to allow it first.",
     schema({"tasks": {"type": "array", "maxItems": 10, "items": {"type": "object", "properties": {"title": {"type": "string"}, "brief": {"type": "string", "description": "Everything the task needs to know, written as a task."}}, "required": ["title", "brief"]}}}, ["tasks"]), 320),
    ("parallel_tasks_status", "Progress of the parallel tasks this task started: status and a short result for each.", schema({}, []), 60),
    ("read_parallel_result", "The full final answer of one parallel task this task started.", schema({"ref": {"type": "string", "description": "Id of the parallel task."}}, ["ref"]), 60),
    ("create_automation", "Create an automation the user sees on their Automations page: the instruction runs as a new task at the chosen times or when a trigger fires. Use when the user asks for something on a schedule ('every weekday at 9', 'tomorrow at 3pm', 'in 5 minutes') or when something happens (a webhook call, new items in an RSS feed).",
     schema({"instruction": {"type": "string", "description": "What to do on each run, written as a task for yourself."},
             "when": {"type": "string", "description": "Plain-language timing or trigger, e.g. 'every weekday at 9am', 'every 30 minutes', 'tomorrow at 15:00', 'when the webhook is called'."},
             "repeat": {"type": "object", "description": "Exact timing instead of when. One of {freq:'once',date:'YYYY-MM-DD',time:'HH:MM'}, {freq:'daily',time}, {freq:'weekdays',time}, {freq:'weekly',days:[0-6],time}, {freq:'monthly',dates:[1-31],time}, {freq:'interval',everyMinutes}."},
             "timezone": {"type": "string", "description": "IANA time zone of the user, e.g. America/Los_Angeles. Defaults to UTC."},
             "name": {"type": "string", "description": "Short name shown on the card."},
             "run_in": {"type": "string", "enum": ["new", "same"]}}, ["instruction"]), 60),
    ("list_automations", "List the user's automations with their timing, status and next run.", schema({}, []), 60),
    ("update_automation", "Change an automation: instruction, timing, name, or pause/resume it (enabled).",
     schema({"id": {"type": "string"}, "instruction": {"type": "string"}, "when": {"type": "string"}, "repeat": {"type": "object"}, "timezone": {"type": "string"}, "name": {"type": "string"}, "enabled": {"type": "boolean"}}, ["id"]), 60),
    ("delete_automation", "Delete an automation and its run history.", schema({"id": {"type": "string"}}, ["id"]), 60),
    ("run_automation_now", "Start a test run of an automation right away.", schema({"id": {"type": "string"}}, ["id"]), 60),
    ("generate_speech", "Turn text into natural speech (ElevenLabs) and save it as an MP3 in this task's audio/ folder. Counts against the user's daily speech limit, so render each script once. Returns the file path.",
     schema({"text": {"type": "string", "description": "The words to speak, at most 5000 characters."},
             "voice": {"type": "string", "description": "Voice name (e.g. a premade ElevenLabs voice); omit for the default."},
             "file": {"type": "string", "description": "File name without folder, e.g. intro.mp3."}}, ["text"]), 200),
    ("generate_sound_effect", "Generate a sound effect from a description (ElevenLabs) and save it as an MP3 in this task's audio/ folder. Counts against the user's daily limit. Returns the file path.",
     schema({"prompt": {"type": "string", "description": "What the sound is, e.g. 'heavy wooden door creaking open'."},
             "seconds": {"type": "number", "description": "Length in seconds (0.5 to 22); omit to let the model choose."},
             "file": {"type": "string", "description": "File name without folder, e.g. door.mp3."}}, ["prompt"]), 200),
    ("propose_project_update", "Only when the user asks to update the project from this conversation: propose changes to the project's instructions, knowledge files or skills. The user sees them as a diff and approves; nothing changes before that.",
     schema({"summary": {"type": "string", "description": "One or two sentences: what changes and why."},
             "instructions": {"type": "string", "description": "The full new project instructions (omit to keep them)."},
             "add_files": {"type": "array", "maxItems": 10, "items": {"type": "object", "properties": {"name": {"type": "string"}, "content": {"type": "string", "description": "Text content (Markdown is best)."}}, "required": ["name", "content"]}},
             "remove_files": {"type": "array", "items": {"type": "string", "description": "Name of a knowledge file to remove."}},
             "skills": {"type": "array", "items": {"type": "string"}, "description": "The full new list of the project's skill names (omit to keep them)."}}, ["summary"]), 60),
]

def reply(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error is not None: msg["error"] = error
    else: msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n"); sys.stdout.flush()

def text(s, err=False):
    out = {"content": [{"type": "text", "text": s}]}
    if err: out["isError"] = True
    return out

def call(name, args, wait):
    task = args.get("task")
    if not isinstance(task, str) or not HANDLE.match(task):
        return text(json.dumps({"error": "Pass this task's handle as task, exactly as given in your instructions."}), True)
    os.makedirs(CALLS, mode=0o700, exist_ok=True)
    cid = uuid.uuid4().hex
    base = os.path.join(CALLS, "%s.%s" % (task, cid))
    with open(base + ".tmp", "w") as f:
        json.dump({"id": cid, "task": task, "tool": name, "args": args, "at": time.time()}, f)
    os.replace(base + ".tmp", base + ".req")
    deadline = time.time() + wait
    try:
        while time.time() < deadline:
            if os.path.exists(base + ".res"):
                with open(base + ".res") as f:
                    body = json.load(f)
                return text(body.get("text", ""), bool(body.get("error")))
            time.sleep(0.4)
        return text(json.dumps({"error": "The app did not answer in time. Try again in a moment."}), True)
    finally:
        for ext in (".req", ".res"):
            try: os.remove(base + ext)
            except OSError: pass

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try: msg = json.loads(line)
        except Exception: continue
        method, id_ = msg.get("method"), msg.get("id")
        if id_ is None: continue
        if method == "initialize":
            version = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
            reply(id_, {"protocolVersion": version, "capabilities": {"tools": {}}, "serverInfo": {"name": "omtools", "version": "${AGENT_TOOLS_VERSION}"}})
        elif method == "ping":
            reply(id_, {})
        elif method == "tools/list":
            reply(id_, {"tools": [{"name": n, "description": d, "inputSchema": s} for n, d, s, _ in TOOLS]})
        elif method == "tools/call":
            p = msg.get("params") or {}
            tool = next((t for t in TOOLS if t[0] == p.get("name")), None)
            if not tool:
                reply(id_, error={"code": -32602, "message": "Unknown tool"}); continue
            try:
                reply(id_, call(tool[0], p.get("arguments") or {}, tool[3]))
            except Exception as e:
                reply(id_, text(json.dumps({"error": str(e)}), True))
        else:
            reply(id_, error={"code": -32601, "message": "Method not found"})

if __name__ == "__main__":
    main()
`;

/**
 * Idempotent setup on the home computer (bash, as the agent's user): installs `omtools.py`, registers it as the
 * `omtools` MCP server in the default profile (no toolset list there, so it joins every other enabled server), and
 * creates the `om-chat` profile cloned from the default one (same model and keys, same API key) with its toolsets
 * cut down to `CHAT_TOOLSETS`. Prints `OM_TOOLS fresh=1` when anything changed, else `fresh=0`. The default profile
 * needs a gateway restart to load a new MCP server; a new profile is picked up by Hermes' own rescan.
 */
export function agentToolsSetupScript(): string {
  const source = Buffer.from(AGENT_TOOLS_SOURCE, "utf8").toString("base64");
  const toolsets = JSON.stringify(CHAT_TOOLSETS);
  return `set -e
command -v hermes >/dev/null || { echo "OM_TOOLS missing=hermes"; exit 0; }
umask 077
fresh=0
mkdir -p "$HOME/.openman/calls"
chmod 700 "$HOME/.openman" "$HOME/.openman/calls"
S="$HOME/.openman/omtools.py"
echo '${source}' | base64 -d > "$S.new"
if cmp -s "$S.new" "$S"; then rm -f "$S.new"; else mv "$S.new" "$S"; fresh=1; fi
reg() {
python3 - "$1" "$S" "$2" <<'PY'
import json, os, sys, yaml
path, script, toolsets = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = (yaml.safe_load(open(path)) if os.path.exists(path) else {}) or {}
before = yaml.safe_dump(cfg, sort_keys=True)
mcp = cfg.get("mcp_servers") or {}
mcp["omtools"] = {"command": "python3", "args": [script], "timeout": 330, "connect_timeout": 30, "enabled": True}
cfg["mcp_servers"] = mcp
if toolsets != "-":
    cfg.setdefault("platform_toolsets", {})["api_server"] = json.loads(toolsets)
if yaml.safe_dump(cfg, sort_keys=True) != before:
    with open(path + ".om-tmp", "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False)
    os.chmod(path + ".om-tmp", 0o600)
    os.replace(path + ".om-tmp", path)
    print("changed")
PY
}
[ "$(reg "$HOME/.hermes/config.yaml" -)" = "changed" ] && { fresh=1; echo OM_DEFAULT_CHANGED; }
P="$HOME/.hermes/profiles/${CHAT_PROFILE}"
if [ ! -d "$P" ]; then
  hermes profile create ${CHAT_PROFILE} --clone --no-alias --description "OpenMan: chat and plan modes (web, files, questions; no computer)" >/dev/null 2>&1
  fresh=1
fi
[ -d "$P" ] || { echo "OM_TOOLS profile=missing"; exit 0; }
grep -v '^API_SERVER_\\(KEY\\|ENABLED\\)=' "$P/.env" > "$P/.env.new" 2>/dev/null || true
grep -E '^API_SERVER_(KEY|ENABLED)=' "$HOME/.hermes/.env" >> "$P/.env.new" || true
if cmp -s "$P/.env.new" "$P/.env"; then rm -f "$P/.env.new"; else mv "$P/.env.new" "$P/.env"; chmod 600 "$P/.env"; fresh=1; fi
[ "$(reg "$P/config.yaml" '${toolsets}')" = "changed" ] && fresh=1
echo "OM_TOOLS fresh=$fresh"
`;
}
