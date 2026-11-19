/**
 * The user's own Orgo computer as the place where meeting audio lives and (without an ElevenLabs key) where it
 * is transcribed. Server only. Everything runs through the user's Orgo client (`orgoFor(session)`):
 *
 * - Upload: each part the browser sends becomes one Orgo file transfer (`POST /files/uploads`, a presigned PUT
 *   straight to storage, then `/files/uploads/complete`, which has the computer pull it into place). Parts are
 *   named by index, so a resent part simply replaces itself: uploads are resumable and idempotent.
 * - Jobs: a transcription runs detached on the computer (nohup), writing `out.json`, `out.json.progress` and
 *   `job.log` in the meeting's folder; status is read back with one shell call. A job survives our server
 *   restarting, the browser closing and the bash call's 300 s limit.
 */
import { randomUUID } from "node:crypto";
import { OrgoError, type OrgoClient } from "@/lib/orgo/user-client";

export const VOICE_ROOT = "/root/.openman/voice";
export const STT_ROOT = "/root/.openman/stt";

/** Guest folder for one meeting. The id is a UUID, so it is safe in a shell word. */
export function guestDir(meetingId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) throw new Error("Bad meeting id.");
  return `${VOICE_ROOT}/${meetingId}`;
}

export function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class GuestError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Runs a command; returns stdout. A failed call or non-zero exit throws a `GuestError` with Orgo's sentence. */
export async function sh(orgo: OrgoClient, computerId: string, command: string, timeout = 60): Promise<string> {
  let result;
  try {
    result = await orgo.bash(computerId, command, timeout);
  } catch (err) {
    if (err instanceof OrgoError) throw new GuestError(err.status === 409 ? "Your computer is not running. Start it from Computers and try again." : `Your computer could not be reached: ${err.message}`, err.status === 409 ? 409 : 502);
    throw err;
  }
  if (!result.success || (result.exit_code ?? 0) !== 0) {
    // Only the output is read: the echoed command may carry a single-use token.
    const tail = (result.output ?? "").trim().split("\n").slice(-3).join(" ").slice(0, 300);
    throw new GuestError(`A command failed on your computer${tail ? `: ${tail}` : result.error ? `: ${result.error}` : "."}`);
  }
  return result.output ?? "";
}

/** Places one part on the computer as `<dir>/parts/part-NNNNN`. Idempotent. */
export async function putPart(orgo: OrgoClient, computerId: string, meetingId: string, index: number, bytes: Uint8Array): Promise<void> {
  const name = `part-${String(index).padStart(5, "0")}`;
  const dest = `${guestDir(meetingId)}/parts`;
  let start: { upload_url: string; upload_token: string };
  try {
    start = await orgo.request<{ upload_url: string; upload_token: string }>("POST", "/files/uploads", { desktopId: computerId, filename: name, size_bytes: bytes.byteLength, destPath: dest });
  } catch (err) {
    throw new GuestError(err instanceof OrgoError ? `Orgo refused the upload: ${err.message}` : "The upload could not start.", err instanceof OrgoError && err.status === 409 ? 409 : 502);
  }
  let put: Response;
  try {
    put = await fetch(start.upload_url, { method: "PUT", body: bytes as BodyInit, signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new GuestError("The upload to storage did not finish. It will be retried.");
  }
  if (!put.ok) throw new GuestError(`Storage refused the upload (${put.status}).`);
  try {
    await orgo.request("POST", "/files/uploads/complete", { desktopId: computerId, upload_token: start.upload_token }, { timeoutMs: 180_000 });
  } catch (err) {
    throw new GuestError(err instanceof OrgoError ? `Your computer could not take the part: ${err.message}` : "Your computer could not take the part.");
  }
}

/** Sizes of the parts on the computer, by index. */
export async function listParts(orgo: OrgoClient, computerId: string, meetingId: string): Promise<Map<number, number>> {
  const out = await sh(orgo, computerId, `d=${q(guestDir(meetingId))}/parts; [ -d "$d" ] || exit 0; for f in "$d"/part-*; do [ -f "$f" ] && printf '%s %s\\n' "$(basename "$f")" "$(stat -c %s "$f")"; done; exit 0`, 30);
  const sizes = new Map<number, number>();
  for (const line of out.split("\n")) {
    const m = line.match(/^part-(\d+) (\d+)$/);
    if (m) sizes.set(Number(m[1]), Number(m[2]));
  }
  return sizes;
}

/** Joins the parts into `<dir>/audio.<ext>` and checks the size. Returns the audio path. */
export async function assemble(orgo: OrgoClient, computerId: string, meetingId: string, partsTotal: number, sizeBytes: number, ext: string): Promise<string> {
  const dir = guestDir(meetingId);
  const audio = `${dir}/audio.${ext}`;
  const script = [
    "set -e",
    `cd ${q(dir)}`,
    `n=$(ls parts | grep -c '^part-' || true)`,
    `[ "$n" -eq ${partsTotal} ] || { echo "MISSING_PARTS $n"; exit 3; }`,
    `cat parts/part-* > ${q(audio)}.tmp`,
    `s=$(stat -c %s ${q(audio)}.tmp)`,
    `[ "$s" -eq ${sizeBytes} ] || { echo "SIZE_MISMATCH $s"; exit 4; }`,
    `mv -f ${q(audio)}.tmp ${q(audio)}`,
    "rm -rf parts",
    "echo ASSEMBLED",
  ].join("\n");
  const out = await sh(orgo, computerId, script, 120);
  if (!out.includes("ASSEMBLED")) throw new GuestError("The recording could not be put together on your computer.");
  return audio;
}

/** Writes a text file on the computer (small files only: it travels inside one shell command). */
export async function writeText(orgo: OrgoClient, computerId: string, path: string, text: string): Promise<void> {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  // Split into lines so no single shell word is huge.
  const lines = b64.match(/.{1,76}/g) ?? [];
  const tmp = `${path}.${randomUUID().slice(0, 8)}`;
  await sh(orgo, computerId, `set -e\nmkdir -p "$(dirname ${q(path)})"\nbase64 -d > ${q(tmp)} <<'OM_EOF'\n${lines.join("\n")}\nOM_EOF\nmv -f ${q(tmp)} ${q(path)}`, 60);
}

export interface JobState {
  state: "running" | "done" | "failed";
  progress: { state: string; done: number; total: number } | null;
  /** The job's output file, when done. */
  output?: string;
  error?: string;
}

/**
 * Starts `script` detached in the meeting folder. It must write `out.json` when it succeeds; anything it prints
 * goes to `job.log`. A second start while one is running is refused by the pid check.
 */
export async function startJob(orgo: OrgoClient, computerId: string, meetingId: string, script: string): Promise<void> {
  const dir = guestDir(meetingId);
  await writeText(orgo, computerId, `${dir}/job.sh`, script);
  const out = await sh(
    orgo,
    computerId,
    [
      `cd ${q(dir)}`,
      `if [ -f job.pid ] && kill -0 "$(cat job.pid)" 2>/dev/null; then echo ALREADY; exit 0; fi`,
      `rm -f out.json out.json.tmp out.json.progress job.log job.exit`,
      `nohup setsid bash -c 'bash job.sh > job.log 2>&1; echo $? > job.exit' > /dev/null 2>&1 &`,
      `echo $! > job.pid`,
      `echo STARTED`,
    ].join("\n"),
    30,
  );
  if (!out.includes("STARTED") && !out.includes("ALREADY")) throw new GuestError("The transcription could not start on your computer.");
}

/** Reads a running job's state. `out.json` is returned whole when the job is done. */
export async function readJob(orgo: OrgoClient, computerId: string, meetingId: string): Promise<JobState> {
  const dir = guestDir(meetingId);
  const out = await sh(
    orgo,
    computerId,
    [
      `cd ${q(dir)} 2>/dev/null || { echo STATE:gone; exit 0; }`,
      `if [ -f out.json ]; then echo STATE:done; echo '---OUT---'; base64 -w0 out.json; echo; exit 0; fi`,
      `if [ -f job.pid ] && kill -0 "$(cat job.pid)" 2>/dev/null; then echo STATE:running; else echo STATE:stopped; echo "EXIT:$(cat job.exit 2>/dev/null)"; fi`,
      `echo '---PROGRESS---'; cat out.json.progress 2>/dev/null; echo`,
      `echo '---LOG---'; tail -c 1500 job.log 2>/dev/null`,
      `exit 0`,
    ].join("\n"),
    60,
  );
  const state = out.match(/STATE:(\w+)/)?.[1] ?? "gone";
  if (state === "done") {
    const b64 = out.split("---OUT---")[1]?.trim() ?? "";
    return { state: "done", progress: null, output: Buffer.from(b64, "base64").toString("utf8") };
  }
  let progress: JobState["progress"] = null;
  const rawProgress = out.split("---PROGRESS---")[1]?.split("---LOG---")[0]?.trim();
  if (rawProgress) {
    try {
      const p = JSON.parse(rawProgress) as { state?: string; done?: number; total?: number };
      progress = { state: String(p.state ?? "transcribing"), done: Number(p.done ?? 0), total: Number(p.total ?? 0) };
    } catch {
      progress = null;
    }
  }
  if (state === "running") return { state: "running", progress };
  const log = (out.split("---LOG---")[1] ?? "").trim();
  const lastLine = log.split("\n").filter((l) => l.trim()).slice(-1)[0] ?? "";
  return { state: "failed", progress, error: state === "gone" ? "The recording is no longer on your computer." : lastLine ? lastLine.slice(0, 300) : "The transcription stopped without a result." };
}
