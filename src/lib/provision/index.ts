// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The user's home computer: one Linux computer in their own Orgo workspace, made from Orgo's Hermes template,
 * set up by Orgo (models through Orgo's proxy, billed to the user), then by us (Hermes API server with a
 * per-computer key and our toolsets), published through an Orgo public URL with link access.
 * This is `infra/setup.sh` ported to run through the Orgo API as that user. Server only.
 *
 * Idempotent, resumable and versioned. Every step reads the real state first and only changes what is missing,
 * and each finished step is recorded on the account (`setupSteps[step] = version`), so a crash or a second call
 * picks up where the last one stopped. `SETUP_VERSION` and the per-step versions in `SETUP_STEPS` say what the
 * current recipe is: bump a step's version (and `SETUP_VERSION`) and every existing computer re-runs just that
 * step the next time its owner opens the app (`GET /api/me/provision` starts a quiet upgrade; the app stays usable).
 * One run per user at a time (single flight). For the dev user it adopts the computer in `.env.local` and only
 * reads it back (the dev computer is never changed from here).
 *
 * The person may instead pick a computer already in their workspace (`adoptComputer`, offered by the first-run screen
 * from `GET /api/me/computers`): one made from Orgo's Hermes template is configured as is; plain Linux first gets
 * Hermes from Orgo's own installer (`POST /computers/{id}/agent/install?agent=hermes`). Nothing is created then.
 *
 * The recipe reproduces everything that was set up by hand on the dev computer:
 *  1. computer      Orgo computer from the Hermes template, started, auto-stop off.
 *  2. orgo_agent    Orgo's agent setup (Hermes on Orgo's model proxy, billed to the user).
 *  3. hermes_api    Hermes API server on :8642 with a per-computer key, model, effort, our API toolsets,
 *                   headed browser, smart approvals.
 *  4. desktop_grants  Removes blanket `cua:*` entries from `command_allowlist` (default and every profile), so
 *                   each desktop action reaches the relay, which applies the user's per-app permissions.
 *  5. automations_mcp `mcp_servers.automations` -> `$APP_PUBLIC_URL/api/automations/mcp` with this user's token.
 *  6. remote_profile  The `om-remote` Hermes profile and `~/.openman/` (tasks run on a chosen computer).
 *  6b. task_tools    `omtools` (task references and parallel tasks, answered by the relay through files, no credential
 *                   on the computer) in the default profile, and the `om-chat` profile for Chat and Plan modes.
 *  7. messaging_extras  Hermes' Slack and Telegram extras (`hermes pm install --extra slack --extra telegram`), so
 *                   "Use anywhere" can link either app without a first-use install.
 *  8. connectors    Orgo's connectors refresh (re-points `mcp_servers.orgo` at the user's signed-in apps).
 *  9. custom_connectors  The user's own MCP servers and APIs (stored by us), written again on a new computer.
 * 10. restart       One gateway restart at the end when anything changed (or the API server is not listening).
 * 11. publish + verify  Orgo public URL with link access, then `/health` and `/v1/capabilities` with the key.
 */
import { randomBytes } from "node:crypto";
import { open, seal } from "@/lib/crypto";
import { getAccount, upsertAccount, type Account } from "@/lib/db/accounts";
import { OrgoError, type OrgoClient, type OrgoComputer } from "@/lib/orgo/user-client";
import { orgoFor, type Session } from "@/lib/session";
import { REMOTE_MCP_VERSION, remoteSetupScript } from "@/lib/agent/server/remote-mcp";
import { AGENT_TOOLS_VERSION, agentToolsSetupScript } from "@/lib/agent/server/agent-tools-mcp";
import { concurrentTasksFor } from "@/lib/limits/concurrency";
import { logEvent } from "@/lib/observability/log";
import { forgetConnection } from "@/lib/agent/server/connection";
import { db } from "@/lib/db/client";
import { hasHermes, rankCandidates, type Candidate } from "./candidates";

/**
 * Sets Hermes' own cap on runs at once (`gateway.api_server.max_concurrent_runs`) to the app's per-user limit, so the
 * queue in the app and the agent agree. Prints `OM_CHANGED` when the value changed (the gateway restart applies it).
 */
export function concurrencyScript(limit: number): string {
  const n = Math.max(1, Math.min(50, Math.floor(limit)));
  return `export HOME=/root
python3 - <<'PY'
import yaml, os
p = "/root/.hermes/config.yaml"
cfg = {}
if os.path.exists(p):
    with open(p) as f: cfg = yaml.safe_load(f) or {}
api = cfg.setdefault("gateway", {}).setdefault("api_server", {})
if api.get("max_concurrent_runs") != ${n}:
    api["max_concurrent_runs"] = ${n}
    tmp = p + ".om-tmp"
    with open(tmp, "w") as f: yaml.safe_dump(cfg, f, sort_keys=False)
    os.replace(tmp, p)
    print("OM_CHANGED")
print("OM_CONCURRENCY ${n}")
PY`;
}

export const HOME_COMPUTER_NAME = "openman-home";
export const HERMES_TEMPLATE = "system/hermes-agent@1.1.17"; // 2 vCPU / 8 GB, Hermes v0.23.0
export const HERMES_PORT = 8642;
const PUBLIC_NAME = "openman";
/** The recipe version. Bump it together with any step version below to roll a change out to existing computers. */
export const SETUP_VERSION = 8;
/** Per-step versions. A step runs when the account's recorded version for it differs (or the computer changed). */
export const SETUP_STEPS = {
  orgo_agent: 1,
  hermes_api: 2,
  desktop_grants: 1,
  automations_mcp: 2,
  remote_profile: Number(REMOTE_MCP_VERSION) || 1,
  task_tools: Number(AGENT_TOOLS_VERSION) || 1,
  messaging_extras: 1,
  connectors: 1,
  custom_connectors: 1,
  concurrency: 1,
} as const;
type StepName = keyof typeof SETUP_STEPS;
const TOOLSETS = "terminal, file, web, browser, code_execution, todo, delegation, vision, skills, memory, clarify, computer_use";

export type ProvisionState =
  | "idle"
  | "creating_computer"
  | "starting_computer"
  | "waiting_for_boot"
  | "orgo_agent_setup"
  | "configuring_hermes"
  | "publishing"
  | "verifying"
  | "ready"
  | "error";

export interface ProvisionStatus {
  state: ProvisionState;
  /** One line for the UI ("Creating your computer"). */
  message: string;
  /** 0..1, rough. */
  progress: number;
  homeComputerId: string | null;
  hermesBaseUrl: string | null;
  /** Set when `state` is "error": Orgo's or our sentence, safe to show. */
  error?: string;
  /** Orgo's machine code for the failure, when there is one. */
  code?: string;
  /** True while a run is in flight on this server. */
  running: boolean;
  /** Recipe version completed on the home computer (0 = never); compare with `latestSetupVersion`. */
  setupVersion?: number;
  latestSetupVersion?: number;
  /** A ready computer whose recipe is older than the current one (a quiet upgrade will run). */
  outdated?: boolean;
  /** Milliseconds per step of the last completed run on this server (diagnostics). */
  timings?: Record<string, number>;
  updatedAt: string;
}

const STEPS: Record<ProvisionState, { message: string; progress: number }> = {
  idle: { message: "Not set up yet", progress: 0 },
  creating_computer: { message: "Creating your computer", progress: 0.1 },
  starting_computer: { message: "Starting your computer", progress: 0.15 },
  waiting_for_boot: { message: "Waiting for your computer to boot", progress: 0.3 },
  orgo_agent_setup: { message: "Connecting the agent to Orgo's models", progress: 0.5 },
  configuring_hermes: { message: "Configuring the agent", progress: 0.65 },
  publishing: { message: "Publishing the agent's address", progress: 0.8 },
  verifying: { message: "Checking the agent answers", progress: 0.9 },
  ready: { message: "Your computer is ready", progress: 1 },
  error: { message: "Setup stopped", progress: 0 },
};

/* ---------------------------------------------------------------- per-user status (this process) */

// On globalThis so a dev-server reload of this module keeps following a run that is still going.
const g = globalThis as typeof globalThis & { __omProvision?: { statuses: Map<string, ProvisionStatus>; inflight: Map<string, Promise<ProvisionStatus>>; quietTries: Map<string, number>; timings: Map<string, Record<string, number>> } };
const shared = (g.__omProvision ??= { statuses: new Map(), inflight: new Map(), quietTries: new Map(), timings: new Map() });
const statuses = shared.statuses;
const inflight = shared.inflight;

function setStatus(userId: string, state: ProvisionState, extra: Partial<ProvisionStatus> = {}): ProvisionStatus {
  const prev = statuses.get(userId);
  const next: ProvisionStatus = {
    state,
    message: STEPS[state].message,
    progress: STEPS[state].progress,
    homeComputerId: extra.homeComputerId ?? prev?.homeComputerId ?? null,
    hermesBaseUrl: extra.hermesBaseUrl ?? prev?.hermesBaseUrl ?? null,
    running: inflight.has(userId),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  if (state !== "error") delete next.error;
  statuses.set(userId, next);
  return next;
}

/** A step that failed in a way the person must act on (or that should not be retried blindly). */
class ProvisionError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/* ---------------------------------------------------------------- helpers */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The home computer id for a session: the account's, or the env computer for the dev user. */
export function homeComputerId(session: Session, account: Account | null): string | null {
  if (session.dev) return process.env.ORGO_COMPUTER_ID?.trim() || null;
  return account?.homeComputerId ?? null;
}

/** How to reach this user's Hermes: base URL and bearer key. Null until provisioned. */
export async function hermesConnection(session: Session): Promise<{ baseUrl: string; apiKey: string; computerId: string | null } | null> {
  if (session.dev) {
    const baseUrl = process.env.HERMES_BASE_URL?.trim();
    const apiKey = process.env.HERMES_API_KEY?.trim();
    return baseUrl && apiKey ? { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, computerId: process.env.ORGO_COMPUTER_ID?.trim() || null } : null;
  }
  const account = await getAccount(session.userId);
  if (!account?.hermesBaseUrl || !account.hermesKeyEnc) return null;
  return { baseUrl: account.hermesBaseUrl, apiKey: open(account.hermesKeyEnc), computerId: account.homeComputerId };
}

async function findComputer(orgo: OrgoClient, workspaceId: string, id: string | null): Promise<OrgoComputer | null> {
  if (id) {
    try {
      const computer = await orgo.getComputer(id);
      if (computer.status !== "deleted") return computer;
    } catch (err) {
      if (!(err instanceof OrgoError && (err.status === 404 || err.status === 403))) throw err;
    }
  }
  // Resume after a crash between Orgo's create and our save: the computer is there under our name.
  const listed = await orgo.listComputers(workspaceId);
  return listed.find((c) => c.name === HOME_COMPUTER_NAME && c.status !== "deleted") ?? null;
}

async function bashOk(orgo: OrgoClient, id: string, command: string, timeout = 60): Promise<string> {
  const result = await orgo.bash(id, command, timeout);
  // The answer echoes the command (which may carry a key): only `output` is ever read, never logged whole.
  if (!result.success || (result.exit_code ?? 0) !== 0) throw new ProvisionError(`A setup command failed on the computer${result.error ? `: ${result.error}` : "."}`, "bash_failed");
  return result.output ?? "";
}

async function waitForBoot(orgo: OrgoClient, id: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const out = await orgo.bash(id, 'test -f /usr/local/bin/hermes -o -n "$(command -v hermes)" && echo HERMES_OK', 20);
      if (out.output?.includes("HERMES_OK")) return;
    } catch (err) {
      if (err instanceof OrgoError && err.status !== 0 && err.status !== 409 && err.status < 500) throw err;
    }
    await sleep(4000);
  }
  throw new ProvisionError("The computer did not finish booting in time. Try again in a minute.", "boot_timeout");
}

/**
 * Shell that sets Hermes' default model the way Orgo does: Sonnet 5.5 behind Orgo's model gateway
 * (`ANTHROPIC_BASE_URL=.../api/llm/computers/<id>/anthropic`, billed to the workspace's credits). A computer whose
 * owner keeps their own Anthropic key in Orgo Secrets talks to Anthropic directly; Orgo picks the model for that
 * path (Sonnet 5.5 is refused there), so it is left alone. The relay names the model on every run anyway.
 */
const MODEL_DEFAULT_SH = `if grep -Eq '^(export )?ANTHROPIC_BASE_URL=.*/api/llm/computers/' /root/.hermes/.env 2>/dev/null; then hermes config set model.default claude-sonnet-5-5 >/dev/null; fi`;

/**
 * Waits for Orgo's own follow-up after its agent setup to finish. The setup answers first and then, in the
 * background, gives Hermes the user's apps and its computer, restarting the gateway and rewriting config.yaml
 * from what it read before. Writing our settings during that window loses them: this is what put a new
 * computer's model back on the template's (Opus 5, provider as seeded) after our step had run. Settled means the
 * gateway has not been (re)started for 15 s and is listening.
 */
function settleScript(): string {
  return `export HOME=/root
L=/root/.hermes/gateway-starts.log
last=""; quiet=0
for i in $(seq 1 45); do
  cur=$(tail -n 1 "$L" 2>/dev/null)
  if [ "$cur" = "$last" ] && ss -ltn | grep -q ':${HERMES_PORT} '; then quiet=$((quiet+3)); else quiet=0; fi
  last=$cur
  [ "$quiet" -ge 15 ] && { echo OM_SETTLED; exit 0; }
  sleep 3
done
echo OM_NOT_SETTLED`;
}

/** `keyPath` is a staged secret file (`stageSecretFile`) holding the key as a JSON string; the script reads and deletes it. */
function configureScript(keyPath: string): string {
  if (!/^\/root\/\.openman\/incoming\/s-[0-9a-f]{24}\.json$/.test(keyPath)) throw new Error("Bad staged path.");
  return `set -e
umask 077
export HOME=/root
K=$(python3 -c 'import json,os,sys; p=sys.argv[1]; v=json.load(open(p)); os.remove(p); print(v)' '${keyPath}')
F=/root/.hermes/.env
mkdir -p /root/.hermes; touch "$F"
fp() { { grep -E "^[A-Za-z_][A-Za-z0-9_]*=" /root/.hermes/.env | sort; grep -v "^[[:space:]]*#" /root/.hermes/config.yaml 2>/dev/null | grep -v "^[[:space:]]*$"; } | sha256sum | cut -d" " -f1; }
BEFORE=$(fp)
grep -vE '^(export[ \\t]+)?(API_SERVER_ENABLED|API_SERVER_KEY|API_SERVER_HOST|API_SERVER_PORT)=' "$F" > "$F.tmp" || true
printf 'API_SERVER_ENABLED=true\\nAPI_SERVER_HOST=0.0.0.0\\nAPI_SERVER_PORT=${HERMES_PORT}\\nAPI_SERVER_KEY=%s\\n' "$K" >> "$F.tmp"
mv -f "$F.tmp" "$F"; chmod 600 "$F"; unset K
[ -f /root/.hermes/config.yaml.pre-openman.bak ] || cp -p /root/.hermes/config.yaml /root/.hermes/config.yaml.pre-openman.bak 2>/dev/null || true
hermes config set model.provider anthropic >/dev/null
${MODEL_DEFAULT_SH}
hermes config set agent.reasoning_effort high >/dev/null 2>&1 || true
hermes config set platform_toolsets.api_server '[${TOOLSETS}]' >/dev/null
hermes config set browser.headed true >/dev/null
hermes config set approvals.mode smart >/dev/null
echo om-setup-v${SETUP_VERSION} > /root/.hermes/.openman-setup
AFTER=$(fp)
[ "$BEFORE" != "$AFTER" ] && echo OM_CHANGED
(nohup hermes pm install chromium >/dev/null 2>&1 &) || true
echo OM_CONFIGURED`;
}

/** Drops blanket desktop-action grants (`cua:*` in `command_allowlist`) from every Hermes profile. */
function desktopGrantsScript(): string {
  return `export HOME=/root
python3 - <<'PY'
import glob, os, yaml
changed = False
for path in ["/root/.hermes/config.yaml"] + glob.glob("/root/.hermes/profiles/*/config.yaml"):
    try:
        cfg = yaml.safe_load(open(path)) or {}
    except Exception:
        continue
    allow = cfg.get("command_allowlist")
    if not isinstance(allow, list):
        continue
    kept = [a for a in allow if not (isinstance(a, str) and a.startswith("cua:"))]
    if kept != allow:
        cfg["command_allowlist"] = kept
        with open(path + ".om-tmp", "w") as f:
            yaml.safe_dump(cfg, f, sort_keys=False)
        os.chmod(path + ".om-tmp", 0o600)
        os.replace(path + ".om-tmp", path)
        changed = True
print("OM_CHANGED" if changed else "OM_SAME")
PY`;
}

/** Hermes' Slack and Telegram extras, through Hermes' own package manager; a no-op when `pm status` already lists both. */
function messagingExtrasScript(): string {
  return `export HOME=/root
have() { hermes pm status 2>/dev/null | python3 -c "import json,sys; f=set(json.load(sys.stdin).get('feature_list') or []); sys.exit(0 if {'slack','telegram'} <= f else 1)"; }
if have; then echo OM_SAME; exit 0; fi
timeout 270 hermes pm install --extra slack --extra telegram >/tmp/om-extras.log 2>&1 || true
if have; then echo OM_CHANGED; else tail -n 3 /tmp/om-extras.log | cut -c1-200; echo OM_EXTRAS_MISSING; fi`;
}

/** Restarts the gateway when asked (or when the API server is down) and waits for the port and `/health`. */
function restartScript(force: boolean): string {
  // Last line of defence against a late rewrite of config.yaml (see settleScript): the model must still talk
  // Anthropic's API (Orgo's gateway when ANTHROPIC_BASE_URL points at it), with Sonnet 5.5 as the default there.
  return `export HOME=/root
FORCE=${force ? 1 : 0}
VIA_ORGO=0; grep -Eq '^(export )?ANTHROPIC_BASE_URL=.*/api/llm/computers/' /root/.hermes/.env 2>/dev/null && VIA_ORGO=1
if ! VIA_ORGO=$VIA_ORGO python3 -c "import os,yaml,sys; m=(yaml.safe_load(open('/root/.hermes/config.yaml')) or {}).get('model') or {}; ok=m.get('provider')=='anthropic' and not m.get('base_url') and (os.environ['VIA_ORGO']!='1' or m.get('default')=='claude-sonnet-5-5'); sys.exit(0 if ok else 1)"; then
  hermes config set model.provider anthropic >/dev/null
  ${MODEL_DEFAULT_SH}
  FORCE=1; echo OM_MODEL_FIXED
fi
if [ "$FORCE" = 1 ] || ! ss -ltn | grep -q ':${HERMES_PORT} '; then
  supervisorctl restart hermes-gateway >/dev/null 2>&1 || hermes gateway restart >/dev/null 2>&1 || true
  sleep 2
  echo OM_RESTARTED
fi
for i in $(seq 1 60); do curl -s -m 2 -o /dev/null http://127.0.0.1:${HERMES_PORT}/health && break; sleep 1; done
curl -s -m 3 -o /dev/null http://127.0.0.1:${HERMES_PORT}/health && echo OM_LISTENING || echo OM_NOT_LISTENING`;
}

async function publish(orgo: OrgoClient, id: string): Promise<string> {
  const list = await orgo.publicUrls(id);
  if (list.enabled === false) throw new ProvisionError("Public URLs are not enabled for this Orgo account.", "public_urls_disabled");
  let url = list.public_urls.find((u) => Number(u.port) === HERMES_PORT) ?? null;
  if (!url) {
    try {
      url = await orgo.createPublicUrl(id, { port: HERMES_PORT, name: PUBLIC_NAME });
    } catch (err) {
      // Made in the meantime (another server, or a retry after a timeout): use that one.
      if (!(err instanceof OrgoError && (err.code === "PORT_TAKEN" || err.status === 409))) throw err;
      url = (await orgo.publicUrls(id)).public_urls.find((u) => Number(u.port) === HERMES_PORT) ?? null;
      if (!url) throw err;
    }
  }
  if (url.access !== "link") {
    try {
      url = await orgo.updatePublicUrl(id, url.id, { access: "link" });
    } catch (err) {
      if (err instanceof OrgoError && (err.status === 402 || err.status === 403)) {
        throw new ProvisionError(`Orgo won't open the agent's address to the app: ${err.message} (link sharing needs a paid Orgo plan or $5 of bought credit).`, err.code ?? "share_refused");
      }
      throw err;
    }
  }
  if (url.access !== "link") throw new ProvisionError("Orgo kept the agent's address private.", "share_refused");
  return url.url.replace(/\/+$/, "");
}

async function verifyHermes(baseUrl: string, apiKey: string, tries = 20): Promise<void> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const health = await fetch(`${baseUrl}/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (health.ok) {
        const caps = await fetch(`${baseUrl}/v1/capabilities`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (caps.ok) return;
        if (caps.status === 401) throw new ProvisionError("The agent refused its key. Run setup again.", "hermes_key_rejected");
      }
    } catch (err) {
      if (err instanceof ProvisionError) throw err;
    }
    await sleep(3000);
  }
  throw new ProvisionError("The agent's address does not answer yet. Try again in a minute.", "hermes_unreachable");
}

/** Whether the hermes command is on the computer. Null while the computer cannot answer yet. */
async function hermesPresent(orgo: OrgoClient, id: string): Promise<boolean | null> {
  try {
    const out = await orgo.bash(id, 'test -f /usr/local/bin/hermes -o -n "$(command -v hermes)" && echo HERMES_OK || echo HERMES_MISSING', 20);
    if (out.output?.includes("HERMES_OK")) return true;
    if (out.output?.includes("HERMES_MISSING")) return false;
    return null;
  } catch (err) {
    if (err instanceof OrgoError && err.status !== 0 && err.status !== 409 && err.status < 500) throw err;
    return null;
  }
}

/** Installs Hermes through Orgo on a plain Linux computer (Orgo's own installer), and waits until it is there. */
async function ensureHermesInstalled(orgo: OrgoClient, id: string, say: (message: string) => void): Promise<void> {
  let present: boolean | null = null;
  for (let i = 0; i < 15 && present === null; i += 1) {
    present = await hermesPresent(orgo, id);
    if (present === null) await sleep(4000);
  }
  if (present) return;
  say("Installing the Hermes agent on your computer");
  for (let i = 0; i < 10; i += 1) {
    try {
      const started = await orgo.agentInstall(id, "hermes");
      if (started.state === "failed") throw new ProvisionError(started.failure?.message || "Orgo could not install the agent on this computer (it may be short of disk space).", started.failure?.kind || "install_failed");
      break;
    } catch (err) {
      // Waking up: Orgo says when to come back.
      if (err instanceof OrgoError && err.status === 409) {
        await sleep(Math.min(30, err.retryAfter ?? 5) * 1000);
        continue;
      }
      throw err;
    }
  }
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const state = await orgo.agentInstallState(id, "hermes").catch((err) => (err instanceof OrgoError && err.status < 500 && err.status !== 409 && err.status !== 0 ? Promise.reject(err) : null));
    if (state?.state === "installed") return;
    if (state?.state === "failed") throw new ProvisionError(state.failure?.message || "Orgo could not install the agent on this computer.", state.failure?.kind || "install_failed");
  }
  throw new ProvisionError("Installing the agent took too long. Try again, or create a new computer instead.", "install_timeout");
}

/* ---------------------------------------------------------------- the run */

async function adoptDevComputer(session: Session, orgo: OrgoClient): Promise<ProvisionStatus> {
  const id = process.env.ORGO_COMPUTER_ID?.trim() || null;
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "") || null;
  const apiKey = process.env.HERMES_API_KEY?.trim() || null;
  if (!id || !baseUrl || !apiKey) throw new ProvisionError("The dev user needs ORGO_COMPUTER_ID, HERMES_BASE_URL and HERMES_API_KEY in .env.local.", "not_configured");
  setStatus(session.userId, "waiting_for_boot", { homeComputerId: id });
  const computer = await orgo.getComputer(id);
  if (computer.status !== "running") throw new ProvisionError(`The dev computer is ${computer.status ?? "not running"}.`, "not_running");
  setStatus(session.userId, "orgo_agent_setup");
  const agent = await orgo.agentState(id);
  if (!agent.paired) throw new ProvisionError("Hermes is not set up on the dev computer (run infra/setup.sh).", "not_paired");
  setStatus(session.userId, "publishing");
  const urls = await orgo.publicUrls(id);
  const published = urls.public_urls.find((u) => Number(u.port) === HERMES_PORT && u.access === "link");
  if (!published || published.url.replace(/\/+$/, "") !== baseUrl) throw new ProvisionError("HERMES_BASE_URL is not the dev computer's public link for port 8642.", "url_mismatch");
  setStatus(session.userId, "verifying");
  await verifyHermes(baseUrl, apiKey, 2);
  // The app's task tools (`omtools`, which also carries the automations tools over the bridge: the dev computer cannot
  // reach a laptop-only app URL, so no automations token is written here). One gateway restart when they changed.
  const known = await getAccount(session.userId).catch(() => null);
  const steps: Record<string, number> = { ...(known?.setupSteps ?? {}) };
  const limit = concurrentTasksFor(computer.cpu);
  const concurrencyDue = steps.concurrency !== SETUP_STEPS.concurrency || steps.concurrency_runs !== limit;
  if (steps.task_tools !== SETUP_STEPS.task_tools || concurrencyDue) {
    setStatus(session.userId, "configuring_hermes", { message: "Updating the task tools" });
    const out = await bashOk(orgo, id, `export HOME=/root\n${agentToolsSetupScript()}`, 120);
    if (!/OM_TOOLS fresh=[01]/.test(out)) throw new ProvisionError("The task tools could not be set up on the dev computer.", "task_tools_failed");
    // Hermes' own cap on runs at once follows the app's per-user limit (applied by the same restart).
    const cap = concurrencyDue ? await bashOk(orgo, id, concurrencyScript(limit), 60) : "";
    if (concurrencyDue && !cap.includes("OM_CONCURRENCY")) throw new ProvisionError("The agent's limit on tasks at once could not be set.", "concurrency_failed");
    if (out.includes("OM_TOOLS fresh=1") || cap.includes("OM_CHANGED")) {
      const restarted = await bashOk(orgo, id, `export HOME=/root
supervisorctl restart hermes-gateway >/dev/null 2>&1 || hermes gateway restart >/dev/null 2>&1 || true
sleep 2; for i in $(seq 1 60); do curl -s -m 2 -o /dev/null http://127.0.0.1:${HERMES_PORT}/health && break; sleep 1; done
curl -s -m 3 -o /dev/null http://127.0.0.1:${HERMES_PORT}/health && echo OM_LISTENING || echo OM_NOT_LISTENING`, 120);
      if (!restarted.includes("OM_LISTENING")) throw new ProvisionError("The dev agent did not come back after the update.", "gateway_down");
      await verifyHermes(baseUrl, apiKey, 2);
    }
    steps.task_tools = SETUP_STEPS.task_tools;
    steps.concurrency = SETUP_STEPS.concurrency;
    steps.concurrency_runs = limit;
  }
  // Record the adoption when the data layer is up; the dev user works from the env either way.
  await upsertAccount({ userId: session.userId, email: session.email, name: session.name, workspaceId: session.workspaceId, homeComputerId: id, hermesBaseUrl: baseUrl, hermesKeyEnc: seal(apiKey), setupSteps: steps }).catch(() => undefined);
  return setStatus(session.userId, "ready", { homeComputerId: id, hermesBaseUrl: baseUrl });
}

/** Wall-clock time per step of the last run, for the logs and the setup report. */
export const lastTimings = shared.timings;

async function run(session: Session): Promise<ProvisionStatus> {
  const userId = session.userId;
  const orgo = await orgoFor(session);
  if (session.dev) return adoptDevComputer(session, orgo);

  let account = await getAccount(userId);
  const workspaceId = account?.workspaceId ?? session.workspaceId;
  if (!workspaceId) throw new ProvisionError("Your Orgo account has no workspace yet. Open orgo.ai once, then try again.", "no_workspace");

  // A computer that already works gets upgrades quietly: the app stays usable, so the status stays "ready".
  let upgrading = false;
  const report = (state: ProvisionState, extra: Partial<ProvisionStatus> = {}, message?: string) =>
    upgrading ? setStatus(userId, "ready", { ...extra, message: message ? `Updating your computer: ${message.toLowerCase()}` : "Updating your computer" }) : setStatus(userId, state, message ? { ...extra, message } : extra);

  const timings: Record<string, number> = {};
  lastTimings.set(userId, timings);
  const t0 = Date.now();
  const timed = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      timings[name] = Date.now() - t;
    }
  };

  // 1. The computer.
  let computer = await timed("find_computer", () => findComputer(orgo, workspaceId, account?.homeComputerId ?? null));
  if (!computer) {
    report("creating_computer");
    computer = await timed("create_computer", () => orgo.createComputer({ workspace_id: workspaceId, name: HOME_COMPUTER_NAME, template_ref: HERMES_TEMPLATE }));
  }
  const id = computer.id;
  upgrading = !!(account?.hermesBaseUrl && account.homeComputerId === id);
  if (account?.homeComputerId !== id) {
    // Another computer than the one the recorded steps ran on: start the recipe over.
    account = await upsertAccount({ userId, homeComputerId: id, hermesBaseUrl: null, setupVersion: 0, setupSteps: {} });
  }
  const steps: Record<string, number> = { ...(account?.setupSteps ?? {}) };
  const due = (name: StepName) => steps[name] !== SETUP_STEPS[name];
  const done = async (name: StepName) => {
    steps[name] = SETUP_STEPS[name];
    account = await upsertAccount({ userId, setupSteps: { ...steps } });
  };
  let changed = false;

  report("waiting_for_boot", { homeComputerId: id });
  if (computer.status && ["stopped", "frozen", "suspended"].includes(computer.status)) {
    report("starting_computer");
    await timed("start_computer", () => orgo.startComputer(id));
  }
  // A computer the person picked that has no agent yet: Orgo installs Hermes on it first.
  if (computer.name !== HOME_COMPUTER_NAME && !hasHermes(computer)) {
    await timed("install_agent", () => ensureHermesInstalled(orgo, id, (message) => report("waiting_for_boot", { homeComputerId: id }, message)));
  }
  await timed("boot", () => waitForBoot(orgo, id));
  await orgo.setAutoStop(id, 0).catch(() => undefined); // always on where the plan allows it

  // 2. Orgo's agent setup: Hermes on Orgo's model proxy, billed to this user.
  if (due("orgo_agent")) {
    report("orgo_agent_setup");
    await timed("orgo_agent", async () => {
      const agent = await orgo.agentState(id).catch(() => null);
      if (!agent?.paired || agent.state !== "ready") {
        await orgo.agentSetup(id, "hermes");
        changed = true;
      }
    });
    await done("orgo_agent");
  }
  // Orgo's background follow-up must be over before we write config.yaml (see settleScript). Cheap when it is.
  if (changed) await timed("settle", () => bashOk(orgo, id, settleScript(), 150)).catch(() => undefined);

  // 3. Hermes API server and our settings. The key is saved (sealed) before it is written, so a crash never strands a key we lost.
  let hermesKey: string | null = null;
  if (account?.hermesKeyEnc) {
    try {
      hermesKey = open(account.hermesKeyEnc);
    } catch {
      hermesKey = null;
    }
  }
  if (!hermesKey) {
    hermesKey = randomBytes(32).toString("hex");
    account = await upsertAccount({ userId, hermesKeyEnc: seal(hermesKey) });
    steps.hermes_api = 0; // a new key must be written
  }
  if (due("hermes_api")) {
    report("configuring_hermes", {}, "Configuring the agent");
    const { stageSecretFile } = await import("@/lib/orgo/secret-file");
    const keyPath = await timed("stage_key", () => stageSecretFile(orgo, id, JSON.stringify(hermesKey)));
    const out = await timed("hermes_api", () => bashOk(orgo, id, configureScript(keyPath), 180));
    if (!out.includes("OM_CONFIGURED")) throw new ProvisionError("The agent's settings could not be written. Try again.", "configure_failed");
    if (out.includes("OM_CHANGED")) changed = true;
    await done("hermes_api");
  }

  // 4. Per-app desktop permissions: no blanket grants on the computer.
  if (due("desktop_grants")) {
    report("configuring_hermes", {}, "Turning on per-app permissions");
    const out = await timed("desktop_grants", () => bashOk(orgo, id, desktopGrantsScript(), 60));
    if (out.includes("OM_CHANGED")) changed = true;
    await done("desktop_grants");
  }

  // 5. The automations tool, reached through the app's public URL with this user's own token.
  if (due("automations_mcp")) {
    const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
    if (base) {
      report("configuring_hermes", {}, "Connecting automations");
      const { mintToken } = await import("@/lib/automations/mcp");
      const { writeHermesMcp } = await import("@/lib/connectors/server");
      const entry = { url: `${base}/api/automations/mcp`, headers: { Authorization: `Bearer ${mintToken(userId)}` }, timeout: 120, connect_timeout: 30 };
      // The token travels as a staged file (Orgo file transfer), never in the bash body.
      await timed("automations_mcp", () => writeHermesMcp(orgo, id, { automations: entry }, false));
      changed = true;
      await done("automations_mcp");
    } else {
      console.warn("[provision] APP_PUBLIC_URL is not set: the automations tool is left out (re-run setup once it is).");
    }
  }

  // 6. The `om-remote` profile and ~/.openman/ (tasks that run on another of the user's computers).
  if (due("remote_profile")) {
    report("configuring_hermes", {}, "Preparing remote computers");
    const out = await timed("remote_profile", () => bashOk(orgo, id, `export HOME=/root\n${remoteSetupScript()}`, 120));
    if (/OM_SETUP missing=hermes/.test(out)) throw new ProvisionError("Hermes is not installed on the computer.", "hermes_missing");
    if (!/OM_SETUP fresh=[01]/.test(out)) throw new ProvisionError("The remote-computer profile could not be set up.", "remote_profile_failed");
    // Hermes rescans profiles by itself; nothing to restart for this one.
    await done("remote_profile");
  }

  // 6b. The app's task tools (`omtools`) and the `om-chat` profile. A new MCP server in the default profile needs the
  // gateway restart at the end; a new profile is found by Hermes' own rescan.
  if (due("task_tools")) {
    report("configuring_hermes", {}, "Adding chat mode and task tools");
    const out = await timed("task_tools", () => bashOk(orgo, id, `export HOME=/root\n${agentToolsSetupScript()}`, 120));
    if (/OM_TOOLS missing=hermes/.test(out)) throw new ProvisionError("Hermes is not installed on the computer.", "hermes_missing");
    if (!/OM_TOOLS fresh=[01]/.test(out)) throw new ProvisionError("Chat mode and the task tools could not be set up.", "task_tools_failed");
    if (out.includes("OM_DEFAULT_CHANGED")) changed = true;
    await done("task_tools");
  }

  // 7. Slack and Telegram for "Use anywhere". Not fatal: the computer works without them and the next setup retries.
  if (due("messaging_extras")) {
    report("configuring_hermes", {}, "Installing Slack and Telegram support");
    try {
      const out = await timed("messaging_extras", () => bashOk(orgo, id, messagingExtrasScript(), 290));
      if (out.includes("OM_EXTRAS_MISSING")) throw new Error(out.replace("OM_EXTRAS_MISSING", "").trim().slice(-300) || "not installed");
      if (out.includes("OM_CHANGED")) changed = true;
      await done("messaging_extras");
    } catch (err) {
      console.warn("[provision] Slack/Telegram extras failed:", err instanceof Error ? err.message : err);
    }
  }

  // 8. Connectors: Orgo re-points `mcp_servers.orgo` at the user's signed-in apps. Not fatal: it is re-run on the next setup.
  if (due("connectors")) {
    report("configuring_hermes", {}, "Refreshing connectors");
    try {
      const { refreshAgents } = await import("@/lib/connectors/server");
      await timed("connectors", () => refreshAgents(orgo, id));
      changed = true;
      await done("connectors");
    } catch (err) {
      console.warn("[provision] connectors refresh failed:", err instanceof Error ? err.message : err);
    }
  }

  // 9. The user's custom MCP servers and APIs. On a new computer they are not there yet; written after Orgo's
  // refresh so nothing it rewrites can drop them. Not fatal, retried on the next setup.
  if (due("custom_connectors")) {
    report("configuring_hermes", {}, "Adding your custom connectors");
    try {
      const [{ listCustomConnectors }, { applyCustomConnectors }] = await Promise.all([import("@/lib/db/connectors"), import("@/lib/connectors/server")]);
      const records = await listCustomConnectors(userId);
      const written = await timed("custom_connectors", () => applyCustomConnectors(orgo, id, records));
      if (written > 0) changed = true;
      await done("custom_connectors");
    } catch (err) {
      console.warn("[provision] custom connectors failed:", err instanceof Error ? err.message : err);
    }
  }

  // 9b. Hermes' own cap on runs at once = the app's per-user limit, by this computer's size.
  const limit = concurrentTasksFor(computer.cpu);
  if (due("concurrency") || steps.concurrency_runs !== limit) {
    report("configuring_hermes", {}, "Setting how many tasks run at once");
    const out = await timed("concurrency", () => bashOk(orgo, id, concurrencyScript(limit), 60));
    if (!out.includes("OM_CONCURRENCY")) throw new ProvisionError("The agent's limit on tasks at once could not be set.", "concurrency_failed");
    if (out.includes("OM_CHANGED")) changed = true;
    steps.concurrency_runs = limit;
    await done("concurrency");
  }

  // 10. One gateway restart at the end, only when something changed (or the API server is down).
  report("configuring_hermes", {}, changed ? "Restarting the agent" : "Checking the agent");
  const restarted = await timed("restart", () => bashOk(orgo, id, restartScript(changed), 150));
  if (!restarted.includes("OM_LISTENING")) {
    await upsertAccount({ userId, setupSteps: { ...steps, hermes_api: 0 } }).catch(() => undefined);
    throw new ProvisionError("The agent did not start listening after setup. Try again.", "gateway_down");
  }

  // 11. Publish through an Orgo public URL with link access (the Hermes key is the only lock), verify, save.
  report("publishing");
  const baseUrl = await timed("publish", () => publish(orgo, id));
  report("verifying");
  try {
    await timed("verify", () => verifyHermes(baseUrl, hermesKey!));
  } catch (err) {
    // Next attempt re-applies everything instead of trusting the recorded steps.
    await upsertAccount({ userId, setupSteps: {} }).catch(() => undefined);
    throw err;
  }
  // Which way the agent reaches Claude. Orgo decides: the workspace owner's own Anthropic key from Orgo Secrets
  // when there is one (injected at create and re-synced on every gateway start), else Orgo's gateway on credits.
  const route = await orgo.agentState(id).then((a) => a.models ?? null).catch(() => null);
  if (route && route !== "orgo") console.info(`[provision] ${userId.slice(0, 8)}: the agent uses the workspace owner's own model key (Orgo Secrets), not Orgo credits.`);
  await upsertAccount({ userId, homeComputerId: id, hermesBaseUrl: baseUrl, setupVersion: SETUP_VERSION, setupSteps: { ...steps }, setupAt: new Date().toISOString() });
  timings.total = Date.now() - t0;
  console.info(`[provision] ${userId.slice(0, 8)} ready on ${id.slice(0, 8)} in ${timings.total} ms`, JSON.stringify(timings));
  void logEvent("info", "provision.ready", { userId, durationMs: timings.total, data: { setupVersion: SETUP_VERSION, upgrading } });
  return setStatus(userId, "ready", { homeComputerId: id, hermesBaseUrl: baseUrl, message: STEPS.ready.message, setupVersion: SETUP_VERSION, latestSetupVersion: SETUP_VERSION, outdated: false, timings: { ...timings } });
}

/** Provisions (or re-checks) the user's home computer. Concurrent calls share one run. */
const quietTries = shared.quietTries;
const QUIET_RETRY_MS = 10 * 60_000;

export function ensureHomeComputer(session: Session, { quiet = false }: { quiet?: boolean } = {}): Promise<ProvisionStatus> {
  const existing = inflight.get(session.userId);
  if (existing) return existing;
  if (quiet) {
    // Quiet upgrades are started by page loads: at most one try per user every ten minutes.
    const last = quietTries.get(session.userId) ?? 0;
    if (Date.now() - last < QUIET_RETRY_MS) return provisionStatus(session);
    quietTries.set(session.userId, Date.now());
  }
  const promise = (async (): Promise<ProvisionStatus> => {
    let result: ProvisionStatus;
    try {
      result = await run(session);
    } catch (err) {
      if (err instanceof Response) throw err;
      const message = err instanceof ProvisionError || err instanceof OrgoError ? err.message : "Setup failed.";
      const code = err instanceof ProvisionError || err instanceof OrgoError ? err.code : undefined;
      if (!(err instanceof ProvisionError) && !(err instanceof OrgoError)) console.error("[provision] failed:", err instanceof Error ? err.message : err);
      await logEvent(quiet ? "warn" : "error", quiet ? "provision.upgrade_failed" : "provision.failed", { userId: session.userId, error: err, data: { code } });
      // A quiet upgrade of a working computer that failed leaves it usable; the next visit tries again.
      result = quiet ? setStatus(session.userId, "ready", { message: `Your computer works; an update did not finish (${message})`, outdated: true }) : setStatus(session.userId, "error", { error: message, code });
    } finally {
      inflight.delete(session.userId);
    }
    const done = { ...result, running: false };
    statuses.set(session.userId, done);
    return done;
  })();
  inflight.set(session.userId, promise);
  setStatus(session.userId, quiet ? "ready" : statuses.get(session.userId)?.state === "ready" ? "verifying" : "idle", { running: true });
  return promise;
}

/** The last known status, without starting anything. Falls back to what the account says. */
export async function provisionStatus(session: Session): Promise<ProvisionStatus> {
  const known = statuses.get(session.userId);
  if (known) return { ...known, running: inflight.has(session.userId) };
  const account = session.dev ? null : await getAccount(session.userId).catch(() => null);
  const homeId = homeComputerId(session, account);
  const baseUrl = session.dev ? process.env.HERMES_BASE_URL?.trim() || null : account?.hermesBaseUrl ?? null;
  const state: ProvisionState = homeId && baseUrl ? "ready" : "idle";
  const setupVersion = session.dev ? SETUP_VERSION : account?.setupVersion ?? 0;
  return { state, message: STEPS[state].message, progress: STEPS[state].progress, homeComputerId: homeId, hermesBaseUrl: baseUrl, running: false, updatedAt: new Date().toISOString(), setupVersion, latestSetupVersion: SETUP_VERSION, outdated: state === "ready" && setupVersion < SETUP_VERSION };
}

/**
 * Forgets the agent computer on this account (after a workspace switch or a new sign-in that cannot reach it): the
 * next visit shows the first-run screen. The computer itself is not touched; it stays in its workspace.
 */
export async function resetHomeComputer(userId: string): Promise<void> {
  if (inflight.has(userId)) throw new AdoptRefused("Setup is running. Wait for it to finish, then try again.", 409);
  await upsertAccount({ userId, homeComputerId: null, hermesBaseUrl: null, setupVersion: 0, setupSteps: {}, setupAt: null });
  statuses.delete(userId);
  quietTries.delete(userId);
  forgetConnection(userId);
}

/**
 * Computers (of `ids`) that are already another OpenMan sign-in's agent computer on this server, with who that is in
 * words: another account's home computer, or the development setup's `ORGO_COMPUTER_ID`.
 */
export async function computersInUse(userId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const envId = process.env.ORGO_COMPUTER_ID?.trim();
  if (envId && ids.includes(envId)) out.set(envId, "this server's development setup");
  const { data } = await db().from("accounts").select("user_id,home_computer_id").in("home_computer_id", ids).neq("user_id", userId);
  for (const row of (data ?? []) as { user_id: string; home_computer_id: string }[]) if (!out.has(row.home_computer_id)) out.set(row.home_computer_id, row.user_id === "dev" ? "this server's development user" : "another OpenMan account");
  return out;
}

/** Why a picked computer cannot be used, written for the person. */
export class AdoptRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Makes a computer already in the person's workspace their agent computer and starts setup on it (no computer is
 * created). Refused for a computer outside the workspace or one `classifyComputer` finds unsuitable.
 */
export async function adoptComputer(session: Session, computerId: string): Promise<{ candidate: Candidate; run: Promise<ProvisionStatus> }> {
  if (session.dev) throw new AdoptRefused("The development user's computer comes from .env.local.", 409);
  if (inflight.has(session.userId)) throw new AdoptRefused("Setup is already running.", 409);
  const orgo = await orgoFor(session);
  const account = await getAccount(session.userId);
  const workspaceId = account?.workspaceId ?? session.workspaceId;
  if (!workspaceId) throw new AdoptRefused("Choose an Orgo workspace first.", 409);
  const computer = (await orgo.listComputers(workspaceId)).find((c) => c.id === computerId);
  if (!computer) throw new AdoptRefused("That computer is not in your OpenMan workspace.", 404);
  const [candidate] = rankCandidates([computer], await computersInUse(session.userId, [computer.id]));
  if (!candidate.suitable) throw new AdoptRefused(candidate.note, 409);
  if (account?.homeComputerId !== computer.id) {
    await upsertAccount({ userId: session.userId, homeComputerId: computer.id, hermesBaseUrl: null, setupVersion: 0, setupSteps: {}, setupAt: null });
    statuses.delete(session.userId);
    forgetConnection(session.userId);
  }
  return { candidate, run: ensureHomeComputer(session) };
}
