// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Reads files from the computer the agent works on.
 *
 * Hermes' API server has no file endpoint, so this goes through Orgo's Desktop API proxy
 * (`/api/desktops/{id}/proxy/bash`), which runs a shell command on the computer and returns its
 * output. It accepts the computer's own password as the bearer token; that is the `token` of
 * `ORGO_VNC_URL`, so no extra secret is needed. An `ORGO_API_KEY`, when set, is used instead.
 */

export interface ComputerConfig {
  baseUrl: string;
  computerId: string;
  token: string;
}

/** Read at call time, like the Hermes settings. Null when no computer is configured (mock mode). */
export function computerConfig(): ComputerConfig | null {
  const computerId = process.env.ORGO_COMPUTER_ID?.trim();
  if (!computerId) return null;
  let token = process.env.ORGO_API_KEY?.trim() || process.env.ORGO_COMPUTER_PASSWORD?.trim() || "";
  if (!token) {
    try {
      token = new URL(process.env.ORGO_VNC_URL?.trim() ?? "").searchParams.get("token") ?? "";
    } catch {
      token = "";
    }
  }
  if (!token) return null;
  const baseUrl = (process.env.ORGO_API_BASE?.trim() || "https://www.orgo.ai/api").replace(/\/+$/, "");
  return { baseUrl, computerId, token };
}

export class ComputerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Quotes a value for use as one word of a bash command. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Runs a bash command on the computer. A non-zero exit is returned, not thrown. */
export async function computerBash(cfg: ComputerConfig, command: string, timeoutSec = 30): Promise<{ output: string; exitCode: number }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/desktops/${encodeURIComponent(cfg.computerId)}/proxy/bash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout: timeoutSec }),
      // The proxy itself waits 30 s past the command's own limit.
      signal: AbortSignal.timeout((timeoutSec + 15) * 1000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ComputerError(`The computer could not be reached: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ComputerError(`The computer answered ${res.status}: ${text.slice(0, 200) || res.statusText}`, res.status === 401 || res.status === 403 ? 502 : res.status);
  }
  const body = (await res.json().catch(() => null)) as { output?: unknown; exit_code?: unknown } | null;
  if (!body) throw new ComputerError("The computer sent an unreadable answer.", 502);
  return { output: typeof body.output === "string" ? body.output : "", exitCode: typeof body.exit_code === "number" ? body.exit_code : 0 };
}

export interface FoundFile {
  path: string;
  size: number;
}

const SEARCH_DIRS = ["$HOME", "$HOME/Desktop", "$HOME/Documents", "$HOME/Downloads", "/tmp"];

/**
 * Which of `candidates` are regular files on the computer that changed within the last `maxAgeSec`.
 * A candidate is an absolute path, a `~/` path, or a bare name; bare names are looked up in the
 * home folder, the usual folders under it, `/tmp`, and `extraDirs`. Returns resolved paths.
 */
export async function findFiles(cfg: ComputerConfig, candidates: string[], maxAgeSec: number, extraDirs: string[] = []): Promise<FoundFile[]> {
  // Control characters would break the line-based answer; nothing legitimate has them.
  const safe = (value: string) => value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f]/.test(value);
  const names = [...new Set(candidates.filter(safe))].slice(0, 60);
  if (names.length === 0) return [];
  const dirs = [...SEARCH_DIRS.map((d) => `"${d}"`), ...[...new Set(extraDirs.filter(safe))].slice(0, 10).map(shellQuote)];
  const script = [
    "now=$(date +%s)",
    `for c in ${names.map(shellQuote).join(" ")}; do`,
    '  case "$c" in',
    '    "~/"*) set -- "$HOME/${c#\\~/}" ;;',
    '    /*) set -- "$c" ;;',
    `    *) set --; for d in ${dirs.join(" ")}; do set -- "$@" "$d/$c"; done ;;`,
    "  esac",
    '  for p in "$@"; do',
    '    [ -f "$p" ] || continue',
    '    r=$(readlink -f -- "$p") || continue',
    '    age=$(( now - $(stat -c %Y -- "$r") ))',
    `    [ "$age" -le ${Math.max(1, Math.round(maxAgeSec))} ] || continue`,
    '    printf \'%s\\t%s\\n\' "$(stat -c %s -- "$r")" "$r"',
    "    break",
    "  done",
    "done",
    "exit 0",
  ].join("\n");
  const { output } = await computerBash(cfg, script, 20);
  const found = new Map<string, FoundFile>();
  for (const line of output.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const size = Number(line.slice(0, tab));
    const path = line.slice(tab + 1);
    if (Number.isFinite(size) && path.startsWith("/")) found.set(path, { path, size });
  }
  return [...found.values()];
}

/** Largest file the app will pull off the computer. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const CHUNK_BYTES = 6 * 1024 * 1024;

/** The bytes of a file on the computer. Throws a `ComputerError` with status 404 when it is not there. */
export async function readComputerFile(cfg: ComputerConfig, path: string): Promise<Buffer> {
  const quoted = shellQuote(path);
  // First answer: the size on one line, then the first chunk in base64. Small files need only this call.
  const first = await computerBash(
    cfg,
    `f=${quoted}; [ -f "$f" ] || { echo MISSING; exit 0; }; stat -c %s -- "$f"; head -c ${CHUNK_BYTES} -- "$f" | base64 -w0`,
    60,
  );
  const newline = first.output.indexOf("\n");
  const head = (newline < 0 ? first.output : first.output.slice(0, newline)).trim();
  if (head === "MISSING") throw new ComputerError("The file is no longer on the computer.", 404);
  const size = Number(head);
  if (!Number.isFinite(size) || first.exitCode !== 0) throw new ComputerError("The file could not be read from the computer.", 502);
  if (size > MAX_FILE_BYTES) throw new ComputerError("The file is too large to open here.", 413);
  const chunks = [Buffer.from(newline < 0 ? "" : first.output.slice(newline + 1).trim(), "base64")];
  let have = chunks[0].length;
  while (have < size) {
    const next = await computerBash(cfg, `tail -c +${have + 1} -- ${quoted} | head -c ${CHUNK_BYTES} | base64 -w0`, 60);
    const chunk = Buffer.from(next.output.trim(), "base64");
    if (chunk.length === 0) break; // The file shrank while it was being read; return what there is.
    chunks.push(chunk);
    have += chunk.length;
  }
  return Buffer.concat(chunks);
}
