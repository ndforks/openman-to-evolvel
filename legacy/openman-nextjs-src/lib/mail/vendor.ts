// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Vendor settings for AgentMail and AgentPhone, read from the environment:
 *   AGENTMAIL_API_KEY, AGENTMAIL_WEBHOOK_SECRET, AGENTMAIL_BASE_URL (optional, default https://api.agentmail.to)
 *   AGENTMAIL_POD_ID     the one pod every inbox of this app lives in (its webhook is scoped to that pod). When unset,
 *                        the pod with client_id `openman` is created or reused.
 *   AGENTMAIL_DOMAIN     the inbox domain once verified in AgentMail (e.g. mail.example.com); unset = AgentMail's default domain.
 *   AGENTPHONE_API_KEY, AGENTPHONE_WEBHOOK_SECRET, AGENTPHONE_BASE_URL (optional, default https://api.agentphone.ai)
 *   AGENTPHONE_SUB_ACCOUNT_ID  the AgentPhone sub-account all of this app's agents, numbers and its webhook live in
 *                        (sent as `X-Sub-Account-Id`), so nothing here touches the master account's numbers or webhooks.
 *                        Phone stays "not set up" while this is unset and the key is a shared master key (see `vendorReady`).
 *
 * Tests: outside production, the signed-in dev user may set a short-lived in-memory override
 * (`/api/mail/test-config`, `/api/phone/test-config`) so a test process can sign webhooks with its own
 * secret and point outgoing calls at a local fake server. Production ignores overrides entirely.
 */
export type Vendor = "agentmail" | "agentphone";

export interface VendorConfig {
  apiKey: string | null;
  webhookSecret: string | null;
  baseUrl: string;
  /** True when this config came from a test override. */
  test?: boolean;
}

/** Env-derived settings a test override replaces (so a test never reaches the real pod, domain or sub-account). */
interface TestExtras {
  podId?: string | null;
  domain?: string | null;
  subAccountId?: string | null;
}

interface Override extends VendorConfig, TestExtras {
  expiresAt: number;
}

function activeOverride(vendor: Vendor): Override | null {
  const o = overrides[vendor];
  if (!o || !overridesAllowed()) return null;
  if (o.expiresAt > Date.now()) return o;
  delete overrides[vendor];
  return null;
}

const DEFAULT_BASE: Record<Vendor, string> = { agentmail: "https://api.agentmail.to", agentphone: "https://api.agentphone.ai" };
const ENV: Record<Vendor, { key: string; secret: string; base: string }> = {
  agentmail: { key: "AGENTMAIL_API_KEY", secret: "AGENTMAIL_WEBHOOK_SECRET", base: "AGENTMAIL_BASE_URL" },
  agentphone: { key: "AGENTPHONE_API_KEY", secret: "AGENTPHONE_WEBHOOK_SECRET", base: "AGENTPHONE_BASE_URL" },
};

const g = globalThis as typeof globalThis & { __omVendorOverrides?: Partial<Record<Vendor, Override>> };
const overrides = (g.__omVendorOverrides ??= {});

export const overridesAllowed = (): boolean => process.env.NODE_ENV !== "production";

export function vendorConfig(vendor: Vendor): VendorConfig {
  const o = activeOverride(vendor);
  if (o) return { apiKey: o.apiKey, webhookSecret: o.webhookSecret, baseUrl: o.baseUrl, test: true };
  const env = ENV[vendor];
  const trim = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    apiKey: trim(process.env[env.key]),
    webhookSecret: trim(process.env[env.secret]),
    baseUrl: (trim(process.env[env.base]) ?? DEFAULT_BASE[vendor]).replace(/\/+$/, ""),
  };
}

const envValue = (name: string): string | null => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
};

const extra = (vendor: Vendor, key: keyof TestExtras, env: string): string | null => {
  const o = activeOverride(vendor);
  return o ? (o[key] ?? null) : envValue(env);
};

/** The pod this app's inboxes live in (null: find or create the `openman` pod). */
export const agentmailPodId = (): string | null => extra("agentmail", "podId", "AGENTMAIL_POD_ID");
/** The verified custom inbox domain, or null for AgentMail's default domain. */
export const agentmailDomain = (): string | null => extra("agentmail", "domain", "AGENTMAIL_DOMAIN")?.toLowerCase() ?? null;
/** The AgentPhone sub-account this app works in (null: none configured). */
export const agentphoneSubAccount = (): string | null => extra("agentphone", "subAccountId", "AGENTPHONE_SUB_ACCOUNT_ID");

/**
 * The API can be called. Phone also needs its own sub-account: the operator's AgentPhone key reaches a master account
 * whose numbers and webhooks belong to other products, so without a sub-account nothing is bought or configured.
 */
export const vendorReady = (vendor: Vendor): boolean => {
  const cfg = vendorConfig(vendor);
  if (!cfg.apiKey) return false;
  return vendor === "agentphone" ? !!agentphoneSubAccount() : true;
};

export function setOverride(vendor: Vendor, cfg: { apiKey: string; webhookSecret: string; baseUrl: string; ttlMs?: number } & TestExtras): void {
  if (!overridesAllowed()) throw new Error("Overrides are disabled in production.");
  overrides[vendor] = {
    apiKey: cfg.apiKey,
    webhookSecret: cfg.webhookSecret,
    baseUrl: cfg.baseUrl.replace(/\/+$/, ""),
    podId: cfg.podId ?? null,
    domain: cfg.domain ?? null,
    subAccountId: cfg.subAccountId ?? null,
    expiresAt: Date.now() + Math.min(cfg.ttlMs ?? 10 * 60_000, 30 * 60_000),
  };
}

export function clearOverride(vendor: Vendor): void {
  delete overrides[vendor];
}

/** Public URL of this app, for links in replies. */
export function appUrl(): string {
  return (process.env.APP_PUBLIC_URL?.trim() || "http://localhost:3001").replace(/\/+$/, "");
}

export class VendorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

/** JSON request to a vendor API with the bearer key. */
export async function vendorFetch<T>(vendor: Vendor, method: string, path: string, body?: unknown, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T> {
  const cfg = vendorConfig(vendor);
  if (!cfg.apiKey) throw new VendorError(`${vendor === "agentmail" ? "Email" : "Phone"} is not set up yet.`, 503, "not_configured");
  const sub = vendor === "agentphone" ? agentphoneSubAccount() : null;
  // Never act on the shared AgentPhone master account: every phone call is scoped to our own sub-account.
  if (vendor === "agentphone" && !sub) throw new VendorError("Phone is not set up yet.", 503, "not_configured");
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(sub ? { "X-Sub-Account-Id": sub } : {}),
        ...opts.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new VendorError(`Could not reach ${vendor}: ${err instanceof Error ? err.message : String(err)}`, 502, "unreachable");
  }
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    // AgentMail: { name, code, message, fix }; AgentPhone: { detail, error: { message, code, type }, request_id }.
    const nested = (obj.error && typeof obj.error === "object" ? obj.error : {}) as Record<string, unknown>;
    const code =
      typeof obj.code === "string" ? obj.code : typeof obj.error === "string" ? obj.error : typeof nested.code === "string" ? nested.code : typeof obj.name === "string" ? obj.name : undefined;
    const msg =
      typeof obj.message === "string"
        ? obj.message
        : typeof obj.detail === "string"
          ? obj.detail
          : typeof nested.message === "string"
            ? nested.message
            : typeof obj.error === "string"
              ? obj.error
              : `HTTP ${res.status}`;
    throw new VendorError(`${vendor} ${method} ${path.split("?")[0]} failed: ${msg}`, res.status, code, parsed);
  }
  return parsed as T;
}
