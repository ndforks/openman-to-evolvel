/**
 * Mirrors the personalization profile into Hermes' own user profile, `<HERMES_HOME>/memories/USER.md`
 * on the user's computer, so the agent's memory tools see it. Hermes stores entries separated by `§`
 * and injects the file at session start; every task opens a new session, so the next task sees it.
 *
 * Only one entry is ours: it starts with `MARKER`. It is replaced in place (or removed when the profile
 * is empty); entries the agent wrote itself are kept untouched. Server only.
 */
import type { Session } from "@/lib/session";
import { computerBash, shellQuote } from "@/lib/agent/server/computer";
import { computerFor, primeConnection } from "@/lib/agent/server/connection";
import { hasProfile, profileText, type Personalization } from "./profile";

const MARKER = "[Profile from settings]";
/** Hermes' default USER.md budget is 1,375 characters; leave room for what the agent learns itself. */
const MAX_ENTRY = 1000;

export type MirrorResult = { ok: true; path: string } | { ok: false; reason: string };

function entryFor(p: Personalization): string {
  if (!hasProfile(p)) return "";
  const body = profileText(p);
  const text = `${MARKER}\n${body}`;
  return text.length > MAX_ENTRY ? `${text.slice(0, MAX_ENTRY - 1)}…` : text;
}

// Runs on the computer with python3 (Hermes itself is Python, so it is always there).
const SCRIPT = String.raw`
import base64, os, sys
home = os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")
d = os.path.join(home, "memories"); os.makedirs(d, exist_ok=True)
p = os.path.join(d, "USER.md")
ours = base64.b64decode(sys.argv[1]).decode("utf-8")
marker = sys.argv[2]
old = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
parts = [x.strip() for x in old.split("§")] if old.strip() else []
parts = [x for x in parts if x and not x.startswith(marker)]
if ours: parts.insert(0, ours)
tmp = p + ".om-tmp"
open(tmp, "w", encoding="utf-8").write("\n§\n".join(parts) + ("\n" if parts else ""))
os.replace(tmp, p)
print("OK " + p)
`;

export interface MirrorStatus {
  state: "pending" | "synced" | "failed";
  at: string;
  detail?: string;
}

const g = globalThis as typeof globalThis & { __omMirror?: { timers: Map<string, ReturnType<typeof setTimeout>>; status: Map<string, MirrorStatus> } };
const mirrors = (g.__omMirror ??= { timers: new Map(), status: new Map() });

/** The last mirror outcome for a user (in memory; null after a server restart or before the first save). */
export function mirrorStatus(userId: string): MirrorStatus | null {
  return mirrors.status.get(userId) ?? null;
}

/** Mirrors after a short quiet period, so a burst of saves writes USER.md once. */
export function scheduleMirror(session: Session, profile: Personalization, delayMs = 2500): MirrorStatus {
  const prev = mirrors.timers.get(session.userId);
  if (prev) clearTimeout(prev);
  const pending: MirrorStatus = { state: "pending", at: new Date().toISOString() };
  mirrors.status.set(session.userId, pending);
  mirrors.timers.set(
    session.userId,
    setTimeout(() => {
      mirrors.timers.delete(session.userId);
      void mirrorToHermes(session, profile).then((r) => {
        mirrors.status.set(session.userId, r.ok ? { state: "synced", at: new Date().toISOString(), detail: r.path } : { state: "failed", at: new Date().toISOString(), detail: r.reason });
        if (!r.ok) console.warn("[personalization] USER.md mirror failed:", r.reason);
      });
    }, delayMs),
  );
  return pending;
}

/** Writes (or clears) our entry in USER.md on the session user's computer. Never throws. */
export async function mirrorToHermes(session: Session, profile: Personalization): Promise<MirrorResult> {
  try {
    await primeConnection(session);
    const cfg = computerFor(session.userId);
    if (!cfg) return { ok: false, reason: "No agent computer is set up yet." };
    const payload = Buffer.from(entryFor(profile), "utf8").toString("base64");
    const command = `python3 -c ${shellQuote(SCRIPT)} ${shellQuote(payload)} ${shellQuote(MARKER)}`;
    const { output, exitCode } = await computerBash(cfg, command, 20);
    const line = output.split("\n").find((l) => l.startsWith("OK "));
    if (exitCode !== 0 || !line) return { ok: false, reason: "The agent computer did not accept the profile." };
    return { ok: true, path: line.slice(3).trim() };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "The agent computer could not be reached." };
  }
}
