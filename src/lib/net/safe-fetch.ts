/**
 * The one way this server fetches a URL a user (or a user's agent, or a vendor event) gave it. Server only.
 *
 * - http and https only; no credentials in the URL.
 * - The host is resolved here and EVERY address must be public: private, loopback, link-local, carrier-grade
 *   NAT, metadata, documentation, multicast, reserved and IPv6 equivalents (ULA, link-local, IPv4-mapped,
 *   NAT64, 6to4, Teredo) are refused.
 * - The connection goes to the address that was checked (pinned through `lookup`), so a DNS answer that
 *   changes between the check and the connect (rebinding) cannot reach an internal address.
 * - Redirects are followed by hand, each hop checked again; credentials are dropped on a cross-origin hop.
 * - Bounded in time (whole request, all hops) and in response size.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class UnsafeUrlError extends Error {
  readonly code = "unsafe_url";
}
export class FetchLimitError extends Error {
  readonly code: "too_large" | "timeout" | "too_many_redirects";
  constructor(message: string, code: "too_large" | "timeout" | "too_many_redirects") {
    super(message);
    this.code = code;
  }
}

/* ---------------------------------------------------------------- address classification */

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

function v4Public(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (v4ToInt(base) & mask) >>> 0;
  });
}

/** 16 bytes of an IPv6 address (with an optional dotted IPv4 tail). */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (net.isIPv4(v4[1]) === false) return null;
    tail = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h === "" ? [] : h.split(":").map((g) => parseInt(g, 16)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const groups = [...head, ...Array(fill).fill(0), ...rest];
  if (groups.some((g) => !Number.isFinite(g) || g < 0 || g > 0xffff)) return null;
  const bytes = groups.flatMap((g) => [g >> 8, g & 0xff]);
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function v6Public(ip: string): boolean {
  const b = v6Bytes(ip);
  if (!b) return false;
  const v4At = (o: number) => b.slice(o, o + 4).join(".");
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judged as the IPv4 address, and refused anyway
  // when the embedded one is not public.
  if (b.slice(0, 10).every((x) => x === 0) && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) return v4Public(v4At(12));
  // Only global unicast (2000::/3) can be public.
  if ((b[0] & 0xe0) !== 0x20) return false;
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return false; // 2001::/32 Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && (b[3] & 0xf0) === 0x10) return false; // 2001:10::/28 ORCHID
  if (b[0] === 0x20 && b[1] === 0x02) return false; // 2002::/16 6to4 (embeds an IPv4 address)
  return true;
}

/** NAT64 (64:ff9b::/96) and others fall outside 2000::/3 and are refused by `v6Public`. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Public(ip);
  if (net.isIPv6(ip)) return v6Public(ip);
  return false;
}

/* ---------------------------------------------------------------- URL checks */

export interface CheckedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const systemResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

function parseUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw.href) : new URL(String(raw).trim());
  } catch {
    throw new UnsafeUrlError("That isn't a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http:// and https:// addresses can be used.");
  if (url.username || url.password) throw new UnsafeUrlError("Do not put a user name or password in the URL.");
  if (!url.hostname) throw new UnsafeUrlError("That URL has no host.");
  return url;
}

/**
 * Resolves the URL's host and refuses it unless every address is public. Returns the address to connect to.
 * `allowPrivate` exists only for local development receivers (never honoured in production).
 */
export async function checkUrl(raw: string | URL, opts: { allowPrivate?: boolean; resolver?: Resolver } = {}): Promise<CheckedTarget> {
  const url = parseUrl(raw);
  const allowPrivate = !!opts.allowPrivate && process.env.NODE_ENV !== "production";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: { address: string; family: number }[];
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else {
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(host) && !allowPrivate) throw new UnsafeUrlError("The address must be reachable on the public internet.");
    try {
      addrs = await (opts.resolver ?? systemResolver)(host);
    } catch {
      throw new UnsafeUrlError(`The host ${host} could not be found.`);
    }
  }
  if (!addrs.length) throw new UnsafeUrlError(`The host ${host} could not be found.`);
  if (!allowPrivate && addrs.some((a) => !isPublicAddress(a.address))) throw new UnsafeUrlError("The address must be reachable on the public internet.");
  const first = addrs[0];
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** Throws `UnsafeUrlError` unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(raw: string | URL, opts: { allowPrivate?: boolean } = {}): Promise<URL> {
  return (await checkUrl(raw, opts)).url;
}

/* ---------------------------------------------------------------- fetch */

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | null;
  /** Largest response body accepted, bytes (default 5 MB). */
  maxBytes?: number;
  /** Whole request including redirects, ms (default 15 s). */
  timeoutMs?: number;
  /** Redirects followed (default 5; 0 = return the 3xx as is). */
  maxRedirects?: number;
  allowPrivate?: boolean;
  /** Tests only: a fake DNS. */
  resolver?: Resolver;
}

export class SafeResponse {
  constructor(
    readonly status: number,
    readonly headers: Headers,
    readonly url: string,
    readonly body: Buffer,
  ) {}
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
  async text(): Promise<string> {
    return this.body.toString("utf8");
  }
  async json<T = unknown>(): Promise<T> {
    return JSON.parse(this.body.toString("utf8")) as T;
  }
}

const SAFE_ON_CROSS_ORIGIN = new Set(["accept", "accept-language", "content-type", "user-agent"]);

function oneHop(target: CheckedTarget, init: { method: string; headers: Record<string, string>; body: Buffer | null; maxBytes: number; signal: AbortSignal }): Promise<{ status: number; headers: Headers; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = target.url.protocol === "https:" ? https : http;
    const pinned = (_host: string, options: unknown, cb: unknown) => {
      const done = (typeof options === "function" ? options : cb) as (...a: unknown[]) => void;
      const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
      if (all) done(null, [{ address: target.address, family: target.family }]);
      else done(null, target.address, target.family);
    };
    const headers: Record<string, string> = { ...init.headers };
    if (init.body) headers["content-length"] = String(init.body.length);
    const req = mod.request(
      {
        protocol: target.url.protocol,
        hostname: target.url.hostname.replace(/^\[|\]$/g, ""),
        port: target.url.port || undefined,
        path: `${target.url.pathname}${target.url.search}`,
        method: init.method,
        headers,
        lookup: pinned as never,
        signal: init.signal,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > init.maxBytes) {
            req.destroy(new FetchLimitError(`The response is larger than ${Math.round(init.maxBytes / 1024)} KB.`, "too_large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
            else if (v !== undefined) h.set(k, String(v));
          }
          resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

/** Fetches a user-supplied URL with the checks above. Throws `UnsafeUrlError`, `FetchLimitError` or a network error. */
export async function safeFetch(input: string | URL, init: SafeFetchInit = {}): Promise<SafeResponse> {
  const timeoutMs = init.timeoutMs ?? 15_000;
  const maxBytes = init.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = init.maxRedirects ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new FetchLimitError(`No answer within ${Math.round(timeoutMs / 1000)} seconds.`, "timeout")), timeoutMs);
  let method = (init.method ?? "GET").toUpperCase();
  let body: Buffer | null = init.body == null ? null : Buffer.from(init.body as Uint8Array | string);
  let headers: Record<string, string> = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  let current: string | URL = input;
  try {
    for (let hop = 0; ; hop++) {
      const target = await checkUrl(current, { allowPrivate: init.allowPrivate, resolver: init.resolver });
      let res;
      try {
        res = await oneHop(target, { method, headers, body, maxBytes, signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
        throw err;
      }
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location && maxRedirects > 0) {
        if (hop >= maxRedirects) throw new FetchLimitError("Too many redirects.", "too_many_redirects");
        const next = new URL(location, target.url);
        if (next.origin !== target.url.origin) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => SAFE_ON_CROSS_ORIGIN.has(k)));
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = null;
          delete headers["content-type"];
        }
        current = next;
        continue;
      }
      return new SafeResponse(res.status, res.headers, target.url.href, res.body);
    }
  } finally {
    clearTimeout(timer);
  }
}
