// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The Orgo REST API (https://www.orgo.ai/api) acting as one user, with that user's own key.
 * Server only: the key never reaches a browser, and several answers (computers, VNC) carry root passwords.
 *
 * Shapes follow orgo-web's handlers (see ../research/orgo-web-*.md); only the fields this app reads are typed.
 * Errors are `OrgoError` with Orgo's own sentence (safe to show; it never contains the key).
 */

export const ORGO_ORIGIN = (process.env.ORGO_ORIGIN?.trim() || "https://www.orgo.ai").replace(/\/+$/, "");
export const ORGO_API_BASE = (process.env.ORGO_API_BASE?.trim() || `${ORGO_ORIGIN}/api`).replace(/\/+$/, "");

/** A refusal or failure from Orgo. `message` is Orgo's own sentence, safe to show to the user. */
export class OrgoError extends Error {
  constructor(
    message: string,
    /** HTTP status Orgo answered with; 0 when the request never got an answer. */
    readonly status: number,
    /** Orgo's machine code (`NAME_TAKEN`, `workspace_scope_mismatch`...), when it sent one. */
    readonly code?: string,
    /** Seconds to wait before retrying, when Orgo said so. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "OrgoError";
  }
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  timeoutMs?: number;
  /** Called before a request that changes something; may throw to refuse it. */
  guard?: (method: Method, path: string) => void;
}

/* ---------------------------------------------------------------- shapes */

export interface OrgoProfile {
  id: string;
  email: string;
  full_name?: string;
  display_name?: string | null;
  avatar_url?: string;
  is_guest?: boolean;
  subscription_status?: string | null;
  next_bill_at?: string | null;
  /** The key that asked (never its value): `scope` "account" or "workspace". */
  api_key?: { id?: string; scope?: string; workspace_id?: string | null; restricted?: boolean } | null;
}

/** A person in a workspace (`GET /api/projects/{id}/members`). `src` is their avatar, `alt` their email. */
export interface OrgoMember {
  id: string;
  email?: string | null;
  role?: string;
  src?: string | null;
  alt?: string | null;
}

/** An API key as `GET /api/keys` lists it (never its value). `key_prefix` is the first 12 characters plus an ellipsis. */
export interface OrgoKeyInfo {
  id: string;
  name?: string | null;
  scope?: string;
  workspace_id?: string | null;
  key_prefix?: string;
  created_at?: string;
  last_used?: string | null;
}

/** `GET|POST /api/computers/{id}/agent/install?agent=hermes`. */
export interface OrgoAgentInstall {
  state: "installing" | "installed" | "failed" | string;
  failure?: { kind?: string; message?: string } | null;
}

export interface OrgoSubscription {
  tier: string;
  requiresPayment?: boolean;
  createdAt?: string;
  planLimits?: Record<string, unknown>;
}

/** A computer as it appears in a workspace's `desktops`, in `GET /computers/{id}` and in the create response. */
export interface OrgoComputer {
  id: string;
  name: string;
  os?: string;
  ram?: number;
  cpu?: number;
  status?: string;
  disk_size_gb?: number | null;
  created_at?: string | null;
  ends_at?: string | null;
  host_id?: string | null;
  project_id?: string;
  /** Root on the computer. Never send it anywhere but a viewer answer. */
  vnc_password?: string | null;
  instance_details?: { resolution?: string | null; installedAgent?: string | null; templateTerminals?: { name?: string }[] | null } | null;
}

export interface OrgoWorkspace {
  id: string;
  name: string;
  user_id?: string;
  role?: string;
  owner_tier?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  created_at?: string;
  desktops?: OrgoComputer[];
}

export interface OrgoCreateComputerBody {
  workspace_id: string;
  name: string;
  os?: "linux" | "windows" | "macos";
  ram?: number;
  cpu?: number;
  disk_size_gb?: number;
  ends_in_hours?: number;
  billing_mode?: "plan" | "hourly";
  /** `namespace/name@version`, e.g. `system/hermes-agent@1.1.17`. */
  template_ref?: string;
}

export interface OrgoResizeBody {
  size?: "small" | "medium" | "large" | "xl" | "2xl";
  vcpus?: number;
  mem_gb?: number;
  disk_size_gb?: number;
  auto_stop_minutes?: number;
}

export interface OrgoCredits {
  balanceCents: number;
  tier?: string;
}

export interface OrgoUsage {
  days: { date: string; used_cents: number; ai_cents: number; computer_cents: number; added_cents: number }[];
  models: { model: string; cents: number }[];
  used_cents: number;
}

export interface OrgoTransaction {
  id?: string;
  amount_cents: number;
  balance_after_cents?: number | null;
  type?: string;
  description?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  created_at?: string;
}

export interface OrgoBashResult {
  success: boolean;
  output: string;
  exit_code: number | null;
  error: string | null;
  error_type?: string | null;
}

export interface OrgoAgentState {
  agent?: string;
  state: "ready" | "available" | "starting" | "needs_model" | "missing" | "unknown" | string;
  paired?: boolean;
  models?: "orgo" | "own" | string;
  model?: string | null;
  provider?: string | null;
  managed?: boolean;
}

export interface OrgoPublicUrl {
  id: string;
  url: string;
  hostname: string;
  label?: string;
  port: number;
  access: "team" | "people" | "link" | string;
  has_password?: boolean;
  created_at?: string;
}

export interface OrgoPublicUrlList {
  enabled: boolean;
  can_publish?: boolean;
  can_share?: boolean;
  public_urls: OrgoPublicUrl[];
}

export interface OrgoApp {
  id: string;
  title: string;
  url: string;
  hostname: string;
  port: number;
  access: string;
  state?: string;
}

/* ---------------------------------------------------------------- client */

export interface OrgoClientOptions {
  apiKey: string;
  /** The user's working workspace (their own default one), when known. */
  workspaceId?: string | null;
  baseUrl?: string;
  /** Refuses changes to some paths (the dev client protects the shared agent computer). */
  guard?: (method: Method, path: string) => void;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

export class OrgoClient {
  readonly workspaceId: string | null;
  readonly baseUrl: string;
  readonly #apiKey: string;
  readonly #guard?: (method: Method, path: string) => void;

  constructor({ apiKey, workspaceId = null, baseUrl = ORGO_API_BASE, guard }: OrgoClientOptions) {
    if (!apiKey) throw new OrgoError("No Orgo key for this account.", 401, "no_key");
    this.#apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.#guard = guard;
  }

  /** Never print the key: `console.log(client)` shows this instead. */
  toJSON() {
    return { baseUrl: this.baseUrl, workspaceId: this.workspaceId };
  }

  /** Raw authenticated request against the Orgo API as this user. `path` starts with `/` and excludes `/api`. */
  async request<T = unknown>(method: string, path: string, body?: unknown, { timeoutMs = 20_000, guard }: RequestOptions = {}): Promise<T> {
    const verb = method.toUpperCase() as Method;
    if (verb !== "GET") {
      this.#guard?.(verb, path);
      guard?.(verb, path);
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: verb,
        headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new OrgoError(timedOut ? "Orgo took too long to answer." : "Orgo could not be reached.", 0, timedOut ? "timeout" : "unreachable");
    }
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: handled below.
    }
    if (!res.ok) {
      const record = (json && typeof json === "object" ? json : {}) as { error?: unknown; message?: unknown; code?: unknown; error_code?: unknown };
      const said = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
      const code = typeof record.code === "string" ? record.code : typeof record.error_code === "string" ? record.error_code : undefined;
      const retry = Number(res.headers.get("retry-after"));
      throw new OrgoError(said || `Orgo answered ${res.status}.`, res.status, code, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return json as T;
  }

  #need(workspaceId?: string | null): string {
    const id = workspaceId ?? this.workspaceId;
    if (!id) throw new OrgoError("This account has no workspace yet.", 409, "no_workspace");
    return id;
  }

  /* ---- identity and plan ---- */

  profile() {
    return this.request<OrgoProfile>("GET", "/user/profile");
  }
  subscription() {
    return this.request<OrgoSubscription>("GET", "/user/subscription");
  }
  async workspaces(): Promise<OrgoWorkspace[]> {
    const answer = await this.request<{ workspaces?: OrgoWorkspace[] } | OrgoWorkspace[]>("GET", "/workspaces");
    const list = Array.isArray(answer) ? answer : Array.isArray(answer?.workspaces) ? answer.workspaces : [];
    return list.filter((w) => w && typeof w.id === "string");
  }
  workspace(id?: string | null) {
    return this.request<OrgoWorkspace>("GET", `/workspaces/${enc(this.#need(id))}`);
  }
  /** The people in a workspace. Readable with a workspace-scoped key for its own workspace. */
  async members(workspaceId: string): Promise<OrgoMember[]> {
    const answer = await this.request<{ members?: OrgoMember[] }>("GET", `/projects/${enc(workspaceId)}/members`);
    return Array.isArray(answer?.members) ? answer.members.filter((m) => m && typeof m.id === "string") : [];
  }
  /** This account's API keys (a workspace-scoped key sees its workspace's only). */
  async keys(): Promise<OrgoKeyInfo[]> {
    const answer = await this.request<{ keys?: OrgoKeyInfo[] }>("GET", "/keys");
    return Array.isArray(answer?.keys) ? answer.keys.filter((k) => k && typeof k.id === "string") : [];
  }
  async deleteKey(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/keys/${enc(id)}`);
  }

  /* ---- credits and billing (a credit is one US dollar) ---- */

  credits() {
    return this.request<OrgoCredits>("GET", "/credits");
  }
  /** Orgo accepts 7, 30, 90 or 365 days. */
  usage(days: 7 | 30 | 90 | 365 = 30) {
    return this.request<OrgoUsage>("GET", `/user/usage/spend?days=${days}`);
  }
  async transactions(): Promise<OrgoTransaction[]> {
    const answer = await this.request<{ transactions?: OrgoTransaction[] } | OrgoTransaction[]>("GET", "/credits/transactions");
    return Array.isArray(answer) ? answer : Array.isArray(answer?.transactions) ? answer.transactions : [];
  }
  /** Stripe Checkout for a credit top-up: any whole dollar from $5 to $10,000. */
  topupCheckout(amountCents: number, returnUrl: string) {
    return this.request<{ url: string }>("POST", "/credits/checkout", { amount_cents: amountCents, return_url: returnUrl });
  }
  billingPortal(returnUrl: string) {
    return this.request<{ url: string }>("POST", "/billing/portal", { return_url: returnUrl });
  }

  /* ---- computers ---- */

  /** Orgo has no list call for a key (`GET /computers` answers 405), so the list is read from the workspace. */
  async listComputers(workspaceId?: string | null): Promise<OrgoComputer[]> {
    const ws = await this.workspace(workspaceId);
    const desktops = Array.isArray(ws?.desktops) ? ws.desktops : [];
    return desktops.filter((d): d is OrgoComputer => !!d && typeof d === "object" && typeof d.id === "string" && typeof d.name === "string");
  }
  getComputer(id: string) {
    return this.request<OrgoComputer>("GET", `/computers/${enc(id)}`);
  }
  /** Orgo answers once the computer is up: seconds for Linux, longer for a template's first boot. */
  createComputer(body: OrgoCreateComputerBody) {
    return this.request<OrgoComputer>("POST", "/computers", body, { timeoutMs: 240_000 });
  }
  startComputer(id: string) {
    return this.request<unknown>("POST", `/computers/${enc(id)}/start`, {}, { timeoutMs: 120_000 });
  }
  stopComputer(id: string) {
    return this.request<unknown>("POST", `/computers/${enc(id)}/stop`, {}, { timeoutMs: 120_000 });
  }
  restartComputer(id: string) {
    return this.request<unknown>("POST", `/computers/${enc(id)}/restart`, {}, { timeoutMs: 120_000 });
  }
  /** The computer must be running (409 `COMPUTER_NOT_RUNNING` otherwise). */
  resizeComputer(id: string, body: OrgoResizeBody) {
    return this.request<unknown>("PATCH", `/computers/${enc(id)}/resize`, body, { timeoutMs: 120_000 });
  }
  resizeLimits(id: string) {
    return this.request<Record<string, unknown>>("GET", `/computers/${enc(id)}/resize`);
  }
  async deleteComputer(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/computers/${enc(id)}`, undefined, { timeoutMs: 60_000 });
  }
  setAutoStop(id: string, minutes: number) {
    return this.request<{ auto_stop_minutes?: number }>("PATCH", `/computers/${enc(id)}/auto-stop`, { auto_stop_minutes: minutes });
  }

  /** Runs a shell command (bash on Linux). `timeout` is in seconds on the guest, up to 300. */
  bash(id: string, command: string, timeout = 60) {
    const seconds = Math.max(1, Math.min(300, Math.round(timeout)));
    return this.request<OrgoBashResult>("POST", `/computers/${enc(id)}/bash`, { command, timeout: seconds }, { timeoutMs: (seconds + 30) * 1000 });
  }

  /** Root password for the VNC socket and the Desktop API. Never log it. */
  vncPassword(id: string) {
    return this.request<{ password: string; desktop_api_token?: string }>("GET", `/computers/${enc(id)}/vnc-password`);
  }
  /** `wss://www.orgo.ai/desktops/{id}/ws/websockify?token=<password>`; built server side, handed to the viewer only. */
  vncSocketUrl(id: string, password: string): string {
    return `wss://${new URL(this.baseUrl).host}/desktops/${enc(id)}/ws/websockify?token=${encodeURIComponent(password)}`;
  }

  /* ---- the agent on a computer ---- */

  agentState(id: string) {
    return this.request<OrgoAgentState>("GET", `/computers/${enc(id)}/agent`);
  }
  /** Orgo's setup: API server key, a model through Orgo's proxy (billed to the owner), gateway start. Idempotent. */
  agentSetup(id: string, agent = "hermes") {
    return this.request<OrgoAgentState>("POST", `/computers/${enc(id)}/agent?agent=${enc(agent)}`, {}, { timeoutMs: 120_000 });
  }
  /** Orgo installs an agent on a computer that has none (no terminal needed). Poll `agentInstallState`. */
  agentInstall(id: string, agent = "hermes") {
    return this.request<OrgoAgentInstall>("POST", `/computers/${enc(id)}/agent/install?agent=${enc(agent)}`, {}, { timeoutMs: 120_000 });
  }
  agentInstallState(id: string, agent = "hermes") {
    return this.request<OrgoAgentInstall>("GET", `/computers/${enc(id)}/agent/install?agent=${enc(agent)}`);
  }

  /* ---- public URLs and apps (`*.web.orgo.dev`) ---- */

  publicUrls(id: string) {
    return this.request<OrgoPublicUrlList>("GET", `/computers/${enc(id)}/public-urls`);
  }
  createPublicUrl(id: string, body: { port: number; name?: string; password?: string }) {
    return this.request<OrgoPublicUrl>("POST", `/computers/${enc(id)}/public-urls`, body);
  }
  updatePublicUrl(id: string, urlId: string, body: { port?: number; access?: "team" | "people" | "link"; password?: string | null }) {
    return this.request<OrgoPublicUrl>("PATCH", `/computers/${enc(id)}/public-urls/${enc(urlId)}`, body);
  }
  apps(id: string) {
    return this.request<{ enabled: boolean; apps: OrgoApp[] }>("GET", `/computers/${enc(id)}/apps`);
  }
  createApp(id: string, body: { port: number; title: string; description?: string; name?: string }) {
    return this.request<OrgoApp>("POST", `/computers/${enc(id)}/apps`, body);
  }
}

/* ---------------------------------------------------------------- device-code sign-in (no key yet) */

export interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
}

export type DevicePoll =
  | { status: "pending"; interval: number }
  | { status: "denied" | "expired" }
  | { status: "approved"; api_key: string; key_id: string; user: { id: string; email: string } };

async function publicPost<T>(path: string, body: unknown): Promise<{ status: number; json: T | null; retryAfter?: number }> {
  let res: Response;
  try {
    res = await fetch(`${ORGO_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OrgoError("Orgo could not be reached.", 0, "unreachable");
  }
  const text = await res.text().catch(() => "");
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    // ignored
  }
  const retry = Number(res.headers.get("retry-after"));
  return { status: res.status, json, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined };
}

/** `POST /api/cli/auth/start`. Orgo allows 20 starts an hour per calling address. */
export async function startDeviceSignIn(client: string, hostname?: string): Promise<DeviceStart> {
  const { status, json, retryAfter } = await publicPost<DeviceStart & { error?: string }>("/cli/auth/start", { client: client.slice(0, 64), ...(hostname ? { hostname: hostname.slice(0, 128) } : {}) });
  if (status === 429) throw new OrgoError(json?.error || "Too many sign-in attempts from this server. Try again later.", 429, "rate_limited", retryAfter);
  if (status !== 200 || !json?.device_code || !json.user_code) throw new OrgoError(json?.error || "Orgo could not start sign-in.", status || 502, "start_failed");
  return json;
}

/** `POST /api/cli/auth/poll`. The key comes back exactly once. */
export async function pollDeviceSignIn(deviceCode: string): Promise<DevicePoll> {
  const { status, json } = await publicPost<{ status?: string; interval?: number; api_key?: string; key_id?: string; user?: { id: string; email: string }; error?: string }>("/cli/auth/poll", { device_code: deviceCode });
  // 429 carries the same answer plus slow_down.
  if (status === 429) return { status: "pending", interval: json?.interval ?? 7 };
  if (status === 404) return { status: "expired" };
  if (!json || (status !== 200 && !json.status)) throw new OrgoError(json?.error || "Orgo could not check the sign-in.", status || 502, "poll_failed");
  if (json.status === "approved" && json.api_key && json.user?.id) return { status: "approved", api_key: json.api_key, key_id: json.key_id ?? "", user: json.user };
  if (json.status === "denied" || json.status === "expired") return { status: json.status };
  return { status: "pending", interval: json.interval ?? 2 };
}

/* ---------------------------------------------------------------- plans */

/** Orgo's tier key as the plan name Orgo shows. Legacy tiers keep their old names. */
export function planLabel(tier: string | null | undefined): string {
  switch ((tier ?? "").toLowerCase()) {
    case "":
    case "free":
      return "Free";
    case "hacker_v2":
      return "Starter";
    case "startup_v2":
      return "Growth";
    case "scale_v2":
    case "scale":
      return "Scale";
    case "enterprise":
      return "Enterprise";
    case "hacker":
      return "Hacker";
    case "team":
      return "Team";
    case "developer":
      return "Developer";
    case "startup":
      return "Startup";
    case "max":
      return "Max";
    default:
      return tier!.charAt(0).toUpperCase() + tier!.slice(1);
  }
}

/** Upgrade tiers Orgo sells, by the names OpenMan shows. */
export const UPGRADE_TIERS = { starter: "hacker_v2", growth: "startup_v2", scale: "scale_v2" } as const;

/** The orgo.ai page that opens Plan & billing with that plan marked. Never call `/api/checkout` with a key: it charges at once. */
export function upgradeUrl(tier: string): string | null {
  const key = (UPGRADE_TIERS as Record<string, string>)[tier.toLowerCase()] ?? (Object.values(UPGRADE_TIERS) as string[]).find((t) => t === tier);
  return key ? `${ORGO_ORIGIN}/settings/billing?upgrade=${encodeURIComponent(key)}#plans` : null;
}
