// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Redaction pass for everything the operator log writes (stdout and `ops_events`). Drops any field whose name looks
 * like a credential and masks values that look like keys, tokens, passwords, cookies or email addresses, wherever
 * they appear in a string. Pure; no imports, safe in any runtime.
 */

/** Field names whose value is never logged, whatever it holds. */
function secretKey(k: string): boolean {
  const lower = k.toLowerCase();
  return (
    /(password|passwd|passphrase|secret|token|apikey|api_key|api-key|authorization|cookie|credential|privatekey|private_key|signature|bearer|vncpass)/.test(lower) ||
    /(^|[-_])key$/.test(lower) ||
    /[a-z]Key$/.test(k) ||
    lower.endsWith("_enc") ||
    /[a-z]Enc$/.test(k) ||
    lower === "otp" ||
    lower === "session"
  );
}

const PATTERNS: [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted jwt]"],
  [/\b(sk|pk|rk|orgo|sb|whsec|om|ak)[-_](live[-_]|test[-_]|ant[-_]|proj[-_]|publishable[-_]|secret[-_])?[A-Za-z0-9_-]{12,}/gi, "[redacted key]"],
  [/\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, "[redacted key]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted key]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted key]"],
  // key=value pairs in URLs, headers and env-style text
  [/\b([A-Za-z_-]*(?:key|token|secret|password|passwd|pwd|sig|signature|cookie)[A-Za-z_-]*)\s*([=:])\s*("?)[^\s&"',;]{4,}\3/gi, "$1$2[redacted]"],
  // long opaque hex / base64 runs (raw keys, hashes of secrets)
  [/\b[A-Fa-f0-9]{32,}\b/g, "[redacted hex]"],
  [/\b[A-Za-z0-9+_-]{40,}={0,2}/g, "[redacted blob]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
];

export function redactString(value: string, max = 2000): string {
  let out = value;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/** A deep copy with credential fields dropped and every string masked. Cycles and depth are bounded. */
export function redact<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value) as T;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString() as T;
  if (typeof value !== "object") return undefined as T;
  if (depth > 6) return "[deep]" as T;
  if (seen.has(value as object)) return "[cycle]" as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1, seen)) as T;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message, 500) } as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
    if (secretKey(k)) continue;
    out[k] = redact(v, depth + 1, seen);
  }
  return out as T;
}
