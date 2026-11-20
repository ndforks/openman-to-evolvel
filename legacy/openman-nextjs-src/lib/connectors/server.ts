// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Connectors, server side. Server only.
 *
 * - Apps: Orgo's per-computer app sign-ins (Composio underneath) through the user's own Orgo key:
 *   `GET/POST/DELETE /api/computers/{id}/agent/apps`. Orgo exposes the signed-in apps to Hermes on that computer
 *   over its MCP server (`mcp_servers.orgo`), which `refreshAgents` (re)writes and restarts the gateway for.
 * - Custom MCP: written into Hermes' own `mcp_servers` on the user's home computer (URL or a command that runs there).
 * - Custom API: one generic `http_request` tool served by a small stdio MCP script on the user's computer; the key
 *   is kept sealed here and placed only in that computer's Hermes config (env of the script).
 */
import { open as unseal } from "@/lib/crypto";
import { assertPublicUrl, FetchLimitError, safeFetch, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { readAndRemove, stageSecretFile } from "@/lib/orgo/secret-file";
import { getAccount } from "@/lib/db/accounts";
import type { CustomConnectorRecord } from "@/lib/db/connectors";
import type { Session } from "@/lib/session";
import type { OrgoClient } from "@/lib/orgo/user-client";
import { CURATED_APPS, CURATED_BY_SLUG, CUSTOM_PREFIX, logoFor, type ConnectorApp, type ConnectorCategory, type ConnectStart, CONNECTOR_CATEGORIES } from "./catalog";

export const SLUG = /^[a-z0-9_-]{1,64}$/;

/** The computer whose agent gets the connectors: the dev computer, or the account's home computer. */
export async function homeComputerId(session: Session): Promise<string | null> {
  if (session.dev) return process.env.ORGO_COMPUTER_ID?.trim() || null;
  const account = await getAccount(session.userId).catch(() => null);
  return account?.homeComputerId ?? null;
}

/* ---------------------------------------------------------------- catalog */

interface OrgoCatalogApp {
  slug: string;
  name: string;
  logo?: string;
  category?: string;
  key?: boolean;
}

let catalogCache: { at: number; apps: ConnectorApp[] } | null = null;

const asCategory = (c: string | undefined): ConnectorCategory => (CONNECTOR_CATEGORIES as readonly string[]).includes(c ?? "") ? (c as ConnectorCategory) : "Other";

/**
 * Curated apps first, then the rest of Composio's catalog that Orgo can connect. Orgo answers the full catalog only
 * to an account-wide key (`workspace_scope_mismatch` otherwise); then only the curated apps are offered.
 */
export async function connectorCatalog(orgo: OrgoClient): Promise<{ apps: ConnectorApp[]; full: boolean }> {
  if (catalogCache && Date.now() - catalogCache.at < 60 * 60_000) return { apps: catalogCache.apps, full: true };
  try {
    const res = await orgo.request<{ apps?: OrgoCatalogApp[] }>("GET", "/apps/catalog", undefined, { timeoutMs: 15_000 });
    const extra: ConnectorApp[] = [];
    for (const app of res.apps ?? []) {
      if (!app?.slug || !SLUG.test(app.slug) || CURATED_BY_SLUG.has(app.slug)) continue;
      extra.push({ slug: app.slug, name: app.name || app.slug, description: `${asCategory(app.category)} app`, category: asCategory(app.category), logo: app.logo?.startsWith("https://") ? app.logo : logoFor(app.slug), key: !!app.key });
    }
    extra.sort((x, y) => x.name.localeCompare(y.name));
    const apps = [...CURATED_APPS, ...extra];
    catalogCache = { at: Date.now(), apps };
    return { apps, full: true };
  } catch {
    return { apps: CURATED_APPS, full: false };
  }
}

/* ---------------------------------------------------------------- app sign-ins (Orgo) */

export async function appStatus(orgo: OrgoClient, computerId: string): Promise<Record<string, boolean>> {
  const res = await orgo.request<{ apps?: Record<string, boolean> }>("GET", `/computers/${encodeURIComponent(computerId)}/agent/apps`, undefined, { timeoutMs: 20_000 });
  return res.apps ?? {};
}

export async function startAppConnect(orgo: OrgoClient, computerId: string, slug: string, fields?: Record<string, string>): Promise<ConnectStart> {
  const res = await orgo.request<{ url?: string | null; alreadyConnected?: boolean; needs?: boolean; asks?: ConnectStart["asks"] }>(
    "POST",
    `/computers/${encodeURIComponent(computerId)}/agent/apps?agent=hermes`,
    fields ? { app: slug, fields } : { app: slug },
    { timeoutMs: 30_000 },
  );
  if (res.needs) return { url: null, needs: true, asks: res.asks ?? [] };
  if (res.url === null && fields) await refreshAgents(orgo, computerId).catch(() => undefined);
  return { url: res.url ?? null, alreadyConnected: !!res.alreadyConnected };
}

/** After a sign-in lands: Orgo re-points Hermes at its app tools (`mcp_servers.orgo`) and restarts the gateway. */
export async function refreshAgents(orgo: OrgoClient, computerId: string): Promise<void> {
  await orgo.request("POST", `/computers/${encodeURIComponent(computerId)}/agent/apps?agent=hermes`, { refresh: true }, { timeoutMs: 30_000 });
}

export async function disconnectApp(orgo: OrgoClient, computerId: string, slug: string): Promise<void> {
  await orgo.request("DELETE", `/computers/${encodeURIComponent(computerId)}/agent/apps?app=${encodeURIComponent(slug)}`, undefined, { timeoutMs: 30_000 });
}

/* ---------------------------------------------------------------- custom MCP: connection test */

export interface McpTool {
  name: string;
  description?: string;
}

/** Parses a streamable-HTTP MCP answer: plain JSON, or an SSE stream carrying the JSON-RPC message. */
function parseMcpBody(text: string, contentType: string | null, id: number): { result?: unknown; error?: { message?: string } } | null {
  const pick = (msg: unknown) => (msg && typeof msg === "object" && (msg as { id?: unknown }).id === id ? (msg as { result?: unknown; error?: { message?: string } }) : null);
  if (contentType?.includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try {
        const hit = pick(JSON.parse(line.slice(5).trim()));
        if (hit) return hit;
      } catch {
        // not JSON
      }
    }
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(pick).find(Boolean) ?? null;
    return pick(parsed);
  } catch {
    return null;
  }
}

/** Connects to a streamable-HTTP MCP server and lists its tools. Throws a readable error. Every request goes through
 * `safeFetch` (public addresses only, pinned, redirects re-checked, bounded). */
export async function testMcpUrl(rawUrl: string, headers: Record<string, string> = {}): Promise<McpTool[]> {
  let url: URL;
  try {
    url = await assertPublicUrl(rawUrl);
  } catch (err) {
    throw new Error(err instanceof UnsafeUrlError ? err.message : "That isn't a valid URL.");
  }
  let session: string | null = null;
  const call = async (id: number | null, method: string, params: unknown) => {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(session ? { "Mcp-Session-Id": session } : {}) },
      body: JSON.stringify(id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
      timeoutMs: 15_000,
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 3,
    });
    session = res.headers.get("mcp-session-id") ?? session;
    if (id === null) return null;
    if (res.status === 401 || res.status === 403) throw new Error(`The server refused the connection (${res.status}). Add the header it needs, such as Authorization.`);
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    const msg = parseMcpBody(await res.text(), res.headers.get("content-type"), id);
    if (!msg) throw new Error("The server did not answer like an MCP server.");
    if (msg.error) throw new Error(`The server said: ${String(msg.error.message ?? "error").slice(0, 200)}`);
    return msg.result;
  };
  try {
    await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "connector-test", version: "1.0" } });
    await call(null, "notifications/initialized", {}).catch(() => undefined);
    const result = (await call(2, "tools/list", {})) as { tools?: { name?: string; description?: string }[] } | null;
    return (result?.tools ?? []).filter((t): t is { name: string; description?: string } => typeof t?.name === "string").map((t) => ({ name: t.name, description: t.description?.slice(0, 300) }));
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new Error(err.message);
    if (err instanceof FetchLimitError) throw new Error(err.code === "timeout" ? "The server did not answer within 15 seconds." : err.message);
    // Network errors (refused, reset, TLS) are reported without their low-level detail: no port or service oracle.
    if (err instanceof Error && /^(The server|That isn't)/.test(err.message)) throw err;
    throw new Error("The server could not be reached.");
  }
}

/* ---------------------------------------------------------------- Hermes config on the computer */

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

async function runOnComputer(orgo: OrgoClient, computerId: string, script: string, timeout = 120): Promise<string> {
  const res = await orgo.bash(computerId, script, timeout);
  const out = res.output ?? "";
  if (!res.success && !out) throw new Error(res.error || "The command failed on the computer.");
  return out;
}

/**
 * Writes (or removes) MCP servers in Hermes' config on the computer and restarts the gateway so it lists them.
 * `servers` maps a server name to its config; null removes it. Values travel base64-encoded, never echoed.
 */
export async function writeHermesMcp(orgo: OrgoClient, computerId: string, servers: Record<string, Record<string, unknown> | null>, restart = true): Promise<void> {
  // Entries can carry keys and headers: they travel as a staged file (Orgo file transfer), never in the command body.
  const hasValues = Object.values(servers).some((v) => v !== null);
  const load = hasValues ? readAndRemove(await stageSecretFile(orgo, computerId, JSON.stringify(servers)), "incoming") : `incoming = json.loads(base64.b64decode("${b64(JSON.stringify(servers))}"))`;
  const script = `python3 - <<'PY'
import base64, json, os, yaml
${load}
path = os.path.expanduser("~/.hermes/config.yaml")
cfg = yaml.safe_load(open(path)) if os.path.exists(path) else {}
cfg = cfg or {}
servers = cfg.get("mcp_servers") or {}
for name, conf in incoming.items():
    if conf is None: servers.pop(name, None)
    else: servers[name] = conf
cfg["mcp_servers"] = servers
tmp = path + ".om-tmp"
with open(tmp, "w") as f: yaml.safe_dump(cfg, f, sort_keys=False)
os.chmod(tmp, 0o600); os.replace(tmp, path)
print("OM_MCP_WRITTEN")
PY
${restart ? "supervisorctl restart hermes-gateway >/dev/null 2>&1 || hermes gateway restart >/dev/null 2>&1 || true\nsleep 2; for i in $(seq 1 45); do ss -ltn | grep -q ':8642 ' && break; sleep 1; done\necho OM_RESTARTED" : ""}`;
  const out = await runOnComputer(orgo, computerId, script, 150);
  if (!out.includes("OM_MCP_WRITTEN")) throw new Error("Couldn't update the agent's MCP settings on your computer.");
}

/** Lists the tools of a command-based MCP server already written to Hermes' config, using Hermes' own test. */
export async function testHermesMcp(orgo: OrgoClient, computerId: string, serverName: string): Promise<{ ok: boolean; output: string }> {
  if (!SLUG.test(serverName)) return { ok: false, output: "Bad server name." };
  const out = await runOnComputer(orgo, computerId, `timeout 90 hermes mcp test ${serverName} 2>&1 | grep -v "previous .hermes update\\|Gateways may\\|hermes gateway restart" | tail -40`, 120);
  const ok = !/error|failed|could not|timed out/i.test(out) || /tools?:/i.test(out);
  return { ok, output: out.slice(-2000) };
}

/** Pulls tool names out of `hermes mcp test` output (best effort). */
export function toolsFromHermesTest(output: string): McpTool[] {
  const tools: McpTool[] = [];
  for (const line of output.split("\n")) {
    const m = /^\s*(?:[-•*✓]\s+)([A-Za-z0-9_.-]{2,80})(?:\s*[:—-]\s*(.*))?$/.exec(line);
    if (m) tools.push({ name: m[1], description: m[2]?.trim() || undefined });
  }
  return tools;
}

/** Hermes `mcp_servers` entry for a custom MCP connector. */
export function hermesEntryFor(record: CustomConnectorRecord): Record<string, unknown> {
  let headers: Record<string, string> = {};
  if (record.secretEnc) {
    try {
      headers = JSON.parse(unseal(record.secretEnc)) as Record<string, string>;
    } catch {
      headers = {};
    }
  }
  if (record.transport === "command") {
    return { command: record.command, args: record.args, ...(Object.keys(headers).length ? { env: headers } : {}), timeout: 120, connect_timeout: 60 };
  }
  return { url: record.url, ...(Object.keys(headers).length ? { headers } : {}), timeout: 120, connect_timeout: 30 };
}

/* ---------------------------------------------------------------- custom APIs: one generic HTTP tool */

export const API_SERVER_NAME = "om_apis";
const API_SCRIPT_PATH = "/root/.hermes/om-http-mcp.py";

/** A dependency-free stdio MCP server with one tool, `http_request`, over the user's custom APIs (config in env OM_APIS). */
const API_SCRIPT = String.raw`#!/usr/bin/env python3
import json, os, sys, urllib.request, urllib.parse, urllib.error
APIS = {a["name"]: a for a in json.loads(os.environ.get("OM_APIS", "[]"))}
TOOL = {"name": "http_request", "description": "Call one of the user's custom APIs. The API key is added for you. APIs: " + "; ".join(f'{n} ({a["base_url"]})' + (f' - {a["notes"]}' if a.get("notes") else "") for n, a in APIS.items()),
  "inputSchema": {"type": "object", "properties": {"api": {"type": "string", "enum": list(APIS) or [""]}, "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]}, "path": {"type": "string", "description": "Path after the base URL, e.g. /v1/items"}, "query": {"type": "object"}, "body": {"description": "JSON body"}}, "required": ["api", "path"]}}
def call(args):
    api = APIS.get(args.get("api"))
    if not api: return True, "Unknown api. Use one of: " + ", ".join(APIS)
    url = api["base_url"].rstrip("/") + "/" + str(args.get("path", "")).lstrip("/")
    if args.get("query"): url += ("&" if "?" in url else "?") + urllib.parse.urlencode(args["query"], doseq=True)
    headers = {"Accept": "application/json", "User-Agent": "agent-http-tool/1.0"}
    h = api.get("header") or "Authorization"
    if api.get("key"): headers[h] = ("Bearer " + api["key"]) if h.lower() == "authorization" and not api["key"].lower().startswith(("bearer ", "basic ", "token ")) else api["key"]
    data = None
    if args.get("body") is not None:
        data = json.dumps(args["body"]).encode(); headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=(args.get("method") or "GET").upper(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return False, f"HTTP {r.status}\n" + r.read(200000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e: return True, f"HTTP {e.code}\n" + e.read(20000).decode("utf-8", "replace")
    except Exception as e: return True, f"Request failed: {e}"
def send(m): sys.stdout.write(json.dumps(m) + "\n"); sys.stdout.flush()
for line in sys.stdin:
    try: msg = json.loads(line)
    except Exception: continue
    mid, method = msg.get("id"), msg.get("method")
    if mid is None: continue
    if method == "initialize": send({"jsonrpc": "2.0", "id": mid, "result": {"protocolVersion": msg.get("params", {}).get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "custom-apis", "version": "1.0"}}})
    elif method == "tools/list": send({"jsonrpc": "2.0", "id": mid, "result": {"tools": [TOOL] if APIS else []}})
    elif method == "tools/call":
        err, text = call(msg.get("params", {}).get("arguments") or {})
        send({"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": text}], "isError": err}})
    elif method == "ping": send({"jsonrpc": "2.0", "id": mid, "result": {}})
    else: send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "Method not found"}})
`;

/** Rewrites the generic HTTP tool's server on the computer with every custom API the user has (or removes it). */
export async function syncApisOnComputer(orgo: OrgoClient, computerId: string, apis: CustomConnectorRecord[]): Promise<void> {
  const list = apis
    .filter((r) => r.kind === "api" && r.url)
    .map((r) => {
      let key = "";
      try {
        key = r.secretEnc ? unseal(r.secretEnc) : "";
      } catch {
        key = "";
      }
      return { name: r.serverName.replace(/^api_/, ""), base_url: r.url, header: r.authHeader || "Authorization", key };
    });
  if (list.length === 0) {
    await writeHermesMcp(orgo, computerId, { [API_SERVER_NAME]: null });
    return;
  }
  const write = `mkdir -p /root/.hermes && echo '${b64(API_SCRIPT)}' | base64 -d > ${API_SCRIPT_PATH} && chmod 700 ${API_SCRIPT_PATH} && echo OM_SCRIPT_OK`;
  const out = await runOnComputer(orgo, computerId, write, 30);
  if (!out.includes("OM_SCRIPT_OK")) throw new Error("Couldn't install the API tool on your computer.");
  await writeHermesMcp(orgo, computerId, { [API_SERVER_NAME]: { command: "python3", args: [API_SCRIPT_PATH], env: { OM_APIS: JSON.stringify(list) }, timeout: 120 } });
}

/**
 * Puts every custom connector the user has on a computer (a new home computer starts without them): each MCP server
 * as its own `mcp_servers` entry and every custom API behind the one HTTP tool. No restart: the caller restarts once.
 * Returns how many connectors were written.
 */
export async function applyCustomConnectors(orgo: OrgoClient, computerId: string, records: CustomConnectorRecord[]): Promise<number> {
  const mcp = records.filter((r) => r.kind !== "api" && (r.url || r.command));
  const apis = records.filter((r) => r.kind === "api" && r.url);
  if (mcp.length === 0 && apis.length === 0) return 0;
  const servers: Record<string, Record<string, unknown> | null> = Object.fromEntries(mcp.map((r) => [r.serverName, hermesEntryFor(r)]));
  if (apis.length) {
    const list = apis.map((r) => {
      let key = "";
      try {
        key = r.secretEnc ? unseal(r.secretEnc) : "";
      } catch {
        key = "";
      }
      return { name: r.serverName.replace(/^api_/, ""), base_url: r.url, header: r.authHeader || "Authorization", key };
    });
    const write = `mkdir -p /root/.hermes && echo '${b64(API_SCRIPT)}' | base64 -d > ${API_SCRIPT_PATH} && chmod 700 ${API_SCRIPT_PATH} && echo OM_SCRIPT_OK`;
    const out = await runOnComputer(orgo, computerId, write, 30);
    if (!out.includes("OM_SCRIPT_OK")) throw new Error("Couldn't install the API tool on your computer.");
    servers[API_SERVER_NAME] = { command: "python3", args: [API_SCRIPT_PATH], env: { OM_APIS: JSON.stringify(list) }, timeout: 120 };
  }
  await writeHermesMcp(orgo, computerId, servers, false);
  return mcp.length + apis.length;
}

/** `my-server` → `my_server` (Hermes names tools `mcp_<server>_<tool>`). */
export function serverNameFor(prefix: string, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "server";
  return `${prefix}${base}`;
}

export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);
