// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * "Reach <brand> from anywhere": Telegram and Slack, through Hermes' own messaging gateway on the user's computer. Server only.
 *
 * Why this path: Hermes already runs on every user's Orgo computer and has native Telegram (long polling) and Slack
 * (Socket Mode) gateways, with its own allow-lists, DM pairing, threads, slash commands, files and voice notes. Neither
 * needs a public webhook on our side, and every conversation lands in Hermes' session store, which Orgo already reads.
 *
 * - Telegram: Orgo's one-scan pairing (`POST/GET /api/computers/{id}/agent/telegram`, key-callable). The QR opens
 *   Telegram on a ready "Create bot" screen; Orgo writes the new bot's token and its creator as the only allowed user
 *   into `~/.hermes/.env` and restarts the gateway. Unlink removes those lines and restarts.
 * - Slack: a Slack app the user creates from a manifest Hermes generates (prefilled link), then two tokens pasted here
 *   (`xoxb-` bot, `xapp-` Socket Mode). We check them with Slack, write them into `~/.hermes/.env`, restart the gateway
 *   and read back Hermes' platform state. Who may talk to the bot: Hermes' DM pairing. The first DM gets a pairing
 *   request, which the owner approves here (`PairingStore.approve_request`).
 * - Conversations: Orgo's `GET /api/computers/{id}/agent/sessions[/{sessionId}]` (Hermes' session store).
 *
 * Restarting the gateway cuts off runs in progress, so every restart first checks Hermes' `active_agents` and refuses
 * (409 `agent_busy`) unless the caller forces it.
 */
import { readAndRemove, stageSecretFile } from "@/lib/orgo/secret-file";
import { seal } from "@/lib/crypto";
import { brand } from "@/config/brand";
import { BadRequest } from "@/lib/orgo/http";
import { OrgoError, type OrgoClient } from "@/lib/orgo/user-client";
import type { ChannelSession, ChannelSessionRead, ChannelsStatus, PlatformState, SlackPairingRequest, TelegramPairingAnswer } from "./types";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const enc = encodeURIComponent;

/** Lines Hermes prints on every CLI call while an update is pending; never shown to anyone. */
const NOISE = `grep -v "previous .hermes update\\|Gateways may\\|hermes gateway restart"`;

async function run(orgo: OrgoClient, computerId: string, script: string, timeout = 60): Promise<string> {
  const res = await orgo.bash(computerId, script, timeout);
  // The answer echoes the command, which may carry a token: only `output` is read, never logged.
  const out = res.output ?? "";
  if (!res.success && !out) throw new Error(res.error || "The command failed on your computer.");
  return out;
}

function lastJson<T>(out: string, marker: string): T {
  const line = out.split("\n").reverse().find((l) => l.startsWith(marker));
  if (!line) throw new Error("Your computer gave an unexpected answer.");
  return JSON.parse(line.slice(marker.length)) as T;
}

/* ---------------------------------------------------------------- reading the computer */

/** Python (the computer's python3) that prints Hermes' channel state: `.env` key presence, gateway platform state, Slack pairing. */
const STATUS_PY = String.raw`
import json, os, re, time
H = os.path.expanduser(os.environ.get("HERMES_HOME") or "~/.hermes")
env = {}
try:
    for l in open(os.path.join(H, ".env"), encoding="utf-8"):
        m = re.match(r"^(?:export )?([A-Z0-9_]+)=(.*)$", l.strip())
        if m: env[m.group(1)] = m.group(2).strip().strip("'\"")
except OSError:
    pass
try:
    st = json.load(open(os.path.join(H, "gateway_state.json")))
except Exception:
    st = {}
plat = st.get("platforms") or {}
def p(n):
    x = plat.get(n) or {}
    return {"state": x.get("state"), "error": x.get("error_message") or x.get("error_code")}
def load(name):
    for d in ("platforms/pairing", "pairing"):
        f = os.path.join(H, d, name)
        if os.path.isfile(f):
            try: return json.load(open(f))
            except Exception: return {}
    return {}
now = time.time()
pending = []
for rid, info in (load("slack-pending.json") or {}).items():
    if not isinstance(info, dict) or not isinstance(info.get("hash"), str): continue
    c = info.get("created_at")
    if not isinstance(c, (int, float)) or now - c > 3600: continue
    pending.append([rid, info.get("user_name") or info.get("user_id") or "Someone", c])
out = {
    "tg": dict(p("telegram"), on=bool(env.get("TELEGRAM_BOT_TOKEN")), bot=env.get("ORGO_TELEGRAM_BOT") or None),
    "sl": dict(p("slack"), on=bool(env.get("SLACK_BOT_TOKEN") and env.get("SLACK_APP_TOKEN")), pending=pending, approved=len(load("slack-approved.json") or {})),
    "gw": st.get("gateway_state"),
    "active": max(st.get("active_agents") or 0, ((plat.get("api_server") or {}).get("metrics") or {}).get("active_runs") or 0),
}
print("OM_CH " + json.dumps(out))
`;

interface RawPlatform {
  state: string | null;
  error: string | null;
  on: boolean;
}
interface RawStatus {
  tg: RawPlatform & { bot: string | null };
  sl: RawPlatform & { pending: [string, string, number][]; approved: number };
  gw: string | null;
  active: number;
}

function platformState(raw: RawPlatform, gateway: string | null): PlatformState {
  if (!raw.on) return "off";
  if (gateway && gateway !== "running") return "stopped";
  const s = (raw.state ?? "").toLowerCase();
  if (s === "connected" || s === "running") return "connected";
  if (s === "connecting" || s === "starting" || s === "retrying" || s === "reconnecting") return "connecting";
  if (s === "failed" || s === "error" || s === "fatal" || s === "disconnected") return "failed";
  // Credentials written, but the gateway has not reported this platform yet (restart pending).
  return s ? "unknown" : "connecting";
}

async function readRaw(orgo: OrgoClient, computerId: string): Promise<RawStatus> {
  const out = await run(orgo, computerId, `python3 - <<'OMPY'\n${STATUS_PY}\nOMPY`, 30);
  return lastJson<RawStatus>(out, "OM_CH ");
}

export async function channelsStatus(orgo: OrgoClient, computerId: string, names: { slack?: string | null; telegram?: string | null } = {}): Promise<ChannelsStatus> {
  const raw = await readRaw(orgo, computerId);
  const pending: SlackPairingRequest[] = raw.sl.on ? raw.sl.pending.map(([id, name, at]) => ({ id, name, at: Number.isFinite(at) ? new Date(at * 1000).toISOString() : null })) : [];
  return {
    configured: true,
    activeRuns: raw.active,
    telegram: { linked: raw.tg.on, state: platformState(raw.tg, raw.gw), error: raw.tg.on ? raw.tg.error : null, bot: raw.tg.bot ?? names.telegram ?? null },
    slack: { linked: raw.sl.on, state: platformState(raw.sl, raw.gw), error: raw.sl.on ? raw.sl.error : null, name: raw.sl.on ? (names.slack ?? null) : null, pending, approved: raw.sl.approved },
  };
}

/* ---------------------------------------------------------------- changing the computer */

/** Refuses to restart while a run is in progress, unless forced. */
async function guardRestart(orgo: OrgoClient, computerId: string, force: boolean): Promise<void> {
  if (force) return;
  const raw = await readRaw(orgo, computerId).catch(() => null);
  if (raw && raw.active > 0) throw new BadRequest(`Your agent is working on ${raw.active === 1 ? "a task" : `${raw.active} tasks`}. Linking restarts it, which would stop ${raw.active === 1 ? "that task" : "them"}. Try again when it finishes, or continue anyway.`, 409);
}

/**
 * Sets and removes lines in `~/.hermes/.env` (values travel base64-encoded), then restarts the gateway and waits for
 * `platform` to leave its starting state. Returns that platform's state line from Hermes.
 */
async function editEnvAndRestart(orgo: OrgoClient, computerId: string, set: Record<string, string>, removePattern: string, platform: "telegram" | "slack"): Promise<{ state: string | null; error: string | null }> {
  // Tokens travel as a staged file (Orgo file transfer), never inside the command body.
  const load = Object.keys(set).length ? readAndRemove(await stageSecretFile(orgo, computerId, JSON.stringify(set)), "sets") : "sets = {}";
  const script = `OM_DEL='${b64(removePattern)}' python3 - <<'OMPY'
import base64, json, os, re
${load}
H = os.path.expanduser(os.environ.get("HERMES_HOME") or "~/.hermes")
p = os.path.join(H, ".env")
lines = open(p, encoding="utf-8").read().splitlines() if os.path.isfile(p) else []
dele = base64.b64decode(os.environ["OM_DEL"]).decode()
out = []
for l in lines:
    m = re.match(r"^(?:export )?([A-Z0-9_]+)=", l)
    if m and (m.group(1) in sets or (dele and re.fullmatch(dele, m.group(1)))):
        continue
    out.append(l)
for k, v in sets.items():
    out.append("%s=%s" % (k, v))
tmp = p + ".om"
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\\n".join(out) + "\\n")
os.chmod(tmp, 0o600)
os.replace(tmp, p)
print("OM_ENV_OK")
OMPY
supervisorctl restart hermes-gateway >/dev/null 2>&1 || hermes gateway restart >/dev/null 2>&1 || true
sleep 3
for i in $(seq 1 50); do
  S=$(python3 -c 'import json,os;d=json.load(open(os.path.expanduser("~/.hermes/gateway_state.json")));x=(d.get("platforms") or {}).get("${platform}") or {};print(json.dumps({"state":x.get("state"),"error":x.get("error_message") or x.get("error_code"),"gw":d.get("gateway_state")}))' 2>/dev/null)
  case "$S" in *'"state": "connected"'*|*'"state": "failed"'*|*'"state": "error"'*|*'"state": "fatal"'*) break;; esac
  ${Object.keys(set).length === 0 ? `case "$S" in *'"gw": "running"'*) ss -ltn | grep -q ':8642 ' && break;; esac` : ""}
  sleep 1
done
echo "OM_PLAT $S"`;
  const out = await run(orgo, computerId, script, 120);
  if (!out.includes("OM_ENV_OK")) throw new Error("Couldn't update the agent's settings on your computer.");
  try {
    const s = lastJson<{ state: string | null; error: string | null }>(out, "OM_PLAT ");
    return s;
  } catch {
    return { state: null, error: null };
  }
}

/* ---------------------------------------------------------------- Telegram (Orgo's pairing) */

export async function startTelegram(orgo: OrgoClient, computerId: string, replace = false): Promise<TelegramPairingAnswer> {
  const res = await orgo.request<{ handle?: string; link?: string; held?: boolean; canLeave?: boolean; status?: string; bot?: string | null }>("POST", `/computers/${enc(computerId)}/agent/telegram?agent=hermes${replace ? "&replace=1" : ""}`, {}, { timeoutMs: 60_000 });
  if (res.status === "connected") return { status: "connected", bot: res.bot ?? null };
  if (!res.handle) throw new Error("Telegram isn't answering. Try again.");
  return { status: res.held ? "connecting" : "waiting", handle: res.handle, link: res.link || undefined, canLeave: !!res.canLeave };
}

export async function pollTelegram(orgo: OrgoClient, computerId: string, handle: string): Promise<TelegramPairingAnswer> {
  try {
    const res = await orgo.request<{ status?: string; bot?: string | null }>("GET", `/computers/${enc(computerId)}/agent/telegram?agent=hermes&handle=${enc(handle)}`, undefined, { timeoutMs: 90_000 });
    const status = (["waiting", "connecting", "connected", "expired", "stuck", "refused"] as const).find((s) => s === res.status) ?? "waiting";
    return { status, bot: res.bot ?? null };
  } catch (err) {
    if (err instanceof OrgoError && err.code === "agent_unmanaged") return { status: "refused" };
    throw err;
  }
}

export async function unlinkTelegram(orgo: OrgoClient, computerId: string, force: boolean): Promise<void> {
  await guardRestart(orgo, computerId, force);
  await editEnvAndRestart(orgo, computerId, {}, "TELEGRAM_[A-Z0-9_]+|ORGO_TELEGRAM_BOT", "telegram");
}

/* ---------------------------------------------------------------- Slack (user's own app, Socket Mode) */

/** Slash commands kept in the manifest: the useful ones, so the prefilled link stays short. */
const SLACK_COMMANDS = new Set(["/new", "/stop", "/retry", "/undo", "/status", "/help", "/btw", "/queue", "/model", "/compress"]);
const manifestCache = new Map<string, { at: number; manifest: Record<string, unknown> }>();

/** Hermes' own Slack manifest (scopes, events, Socket Mode, Agent view), named after the product, trimmed. */
export async function slackManifest(orgo: OrgoClient, computerId: string): Promise<{ manifest: Record<string, unknown>; createUrl: string }> {
  const cached = manifestCache.get(computerId);
  let manifest = cached && Date.now() - cached.at < 3600_000 ? cached.manifest : null;
  if (!manifest) {
    const name = brand.name.replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, 35) || "Agent";
    const out = await run(orgo, computerId, `hermes slack manifest --agent-view --name '${name}' --description 'Your ${name} agent in Slack' 2>/dev/null | ${NOISE}`, 60);
    const start = out.indexOf("{");
    if (start < 0) throw new Error("Your agent couldn't produce a Slack app manifest. Update the agent and try again.");
    manifest = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const features = (manifest.features ?? {}) as { slash_commands?: { command: string }[] };
    if (Array.isArray(features.slash_commands)) features.slash_commands = features.slash_commands.filter((c) => SLACK_COMMANDS.has(c.command));
    manifestCache.set(computerId, { at: Date.now(), manifest });
  }
  return { manifest, createUrl: `https://api.slack.com/apps?new_app=1&manifest_json=${enc(JSON.stringify(manifest))}` };
}

async function slackCall(method: string, token: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new BadRequest("Slack couldn't be reached. Try again.", 502);
  }
  return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

const SLACK_ERRORS: Record<string, string> = {
  invalid_auth: "Slack doesn't accept that token. Copy it again.",
  not_authed: "Slack doesn't accept that token. Copy it again.",
  token_revoked: "That token was revoked. Make a new one.",
  account_inactive: "That token belongs to an app that was uninstalled. Install it again.",
  not_allowed_token_type: "That token is the wrong kind.",
};

/** Checks both tokens with Slack: the bot token names the workspace and bot; the app token must open a Socket Mode connection. */
export async function checkSlackTokens(botToken: string, appToken: string): Promise<{ teamId: string; name: string }> {
  if (!/^xoxb-[A-Za-z0-9-]{20,}$/.test(botToken)) throw new BadRequest("The Bot User OAuth Token starts with xoxb-.");
  if (!/^xapp-[A-Za-z0-9-]{20,}$/.test(appToken)) throw new BadRequest("The App-Level Token starts with xapp-.");
  const auth = await slackCall("auth.test", botToken);
  if (auth.ok !== true) throw new BadRequest(`Bot token: ${SLACK_ERRORS[String(auth.error)] ?? `Slack said ${String(auth.error ?? "no")}.`}`);
  const socket = await slackCall("apps.connections.open", appToken);
  if (socket.ok !== true) {
    const why = String(socket.error ?? "");
    throw new BadRequest(why === "not_allowed_token_type" || why === "invalid_auth" ? "App-Level Token: Slack doesn't accept it. Make one with the connections:write scope under Basic Information → App-Level Tokens." : `App-Level Token: ${SLACK_ERRORS[why] ?? `Slack said ${why || "no"}. Check Socket Mode is on.`}`);
  }
  const team = typeof auth.team === "string" ? auth.team : "Slack";
  const bot = typeof auth.user === "string" ? auth.user : null;
  return { teamId: typeof auth.team_id === "string" ? auth.team_id : "", name: bot ? `${team} · @${bot}` : team };
}

export async function linkSlack(orgo: OrgoClient, computerId: string, botToken: string, appToken: string, force: boolean): Promise<{ teamId: string; name: string; secretEnc: string; state: PlatformState; error: string | null }> {
  const who = await checkSlackTokens(botToken, appToken);
  await guardRestart(orgo, computerId, force);
  // SLACK_ALLOWED_USERS stays unset: Hermes then answers a stranger's DM with a pairing request the owner approves here.
  const s = await editEnvAndRestart(orgo, computerId, { SLACK_BOT_TOKEN: botToken, SLACK_APP_TOKEN: appToken }, "SLACK_(BOT_TOKEN|APP_TOKEN)", "slack");
  return { ...who, secretEnc: seal(JSON.stringify({ botToken, appToken })), state: platformState({ state: s.state, error: s.error, on: true }, null), error: s.error };
}

export async function unlinkSlack(orgo: OrgoClient, computerId: string, force: boolean): Promise<void> {
  await guardRestart(orgo, computerId, force);
  await editEnvAndRestart(orgo, computerId, {}, "SLACK_[A-Z0-9_]+", "slack");
}

/** Approves one pending Slack pairing request with Hermes' own PairingStore (run under Hermes' runtime). */
export async function approveSlackRequest(orgo: OrgoClient, computerId: string, requestId: string, deny = false): Promise<{ name: string } | null> {
  if (!/^[0-9a-f]{8,64}$/i.test(requestId)) throw new BadRequest("Which request?");
  const py = deny
    ? `import json\nfrom gateway.pairing import PairingStore\ns = PairingStore()\np = s._pending_path("slack")\nd = s._load_json(p)\nr = d.pop(${JSON.stringify(requestId.toLowerCase())}, None)\ns._save_json(p, d)\nprint("OM_APPROVE " + json.dumps({"user_name": "", "denied": bool(r)}))\n`
    : `import json\nfrom gateway.pairing import PairingStore\nr = PairingStore().approve_request("slack", ${JSON.stringify(requestId.toLowerCase())})\nprint("OM_APPROVE " + json.dumps(r))\n`;
  const script = `cat > /tmp/om-pair.py <<'OMPY'
${py}OMPY
OM_PY=/tmp/om-pair.py python3 -c '
import json, os, subprocess, sys
rt = json.loads(subprocess.run(["hermes", "--print-runtime-command"], capture_output=True, text=True).stdout)
code = rt[-1]
i = code.find("runpy.run_module(")
rt[-1] = code[:i] + "exec(compile(open(os.environ[\\"OM_PY\\"]).read(), \\"om\\", \\"exec\\"))"
os.execv(rt[0], rt)
' 2>&1 | grep OM_APPROVE; rm -f /tmp/om-pair.py`;
  const out = await run(orgo, computerId, script, 60);
  const r = lastJson<{ user_name?: string } | null>(out, "OM_APPROVE ");
  return r ? { name: r.user_name || "" } : null;
}

/* ---------------------------------------------------------------- conversations (Hermes' session store, via Orgo) */

/** Channel conversations only: Telegram, Slack and the other chat apps (not our own API runs, schedules or the terminal). */
const CHAT_CHANNELS = new Set(["telegram", "slack", "discord", "whatsapp", "signal", "sms", "email"]);

export async function channelSessions(orgo: OrgoClient, computerId: string): Promise<ChannelSession[]> {
  const res = await orgo.request<{ sessions?: { id: string; channel: string; title: string; started_at: string | null; last_at: string | null; messages: number }[] }>("GET", `/computers/${enc(computerId)}/agent/sessions`, undefined, { timeoutMs: 60_000 });
  return (res.sessions ?? []).filter((s) => CHAT_CHANNELS.has(s.channel)).map((s) => ({ id: s.id, channel: s.channel, title: s.title, startedAt: s.started_at, lastAt: s.last_at, messages: s.messages }));
}

export async function channelSession(orgo: OrgoClient, computerId: string, sessionId: string): Promise<ChannelSessionRead> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(sessionId)) throw new BadRequest("Which conversation?", 404);
  const res = await orgo.request<{ id: string; channel: string; title: string; messages: ChannelSessionRead["messages"]; total: number }>("GET", `/computers/${enc(computerId)}/agent/sessions/${enc(sessionId)}`, undefined, { timeoutMs: 60_000 });
  return { id: res.id, channel: res.channel, title: res.title, messages: res.messages ?? [], total: res.total ?? (res.messages ?? []).length };
}
