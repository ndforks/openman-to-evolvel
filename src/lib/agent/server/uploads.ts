/**
 * Files the user attaches to a message. The browser sends a file in parts of at most `UPLOAD_PART_BYTES` (each part
 * stays under the proxy's 10 MB body buffer), each part goes straight to the user's own computer through Orgo's file
 * transfer (`POST /files/uploads`, a presigned PUT, then `/files/uploads/complete`), and the last part joins them into
 * `/root/uploads/<upload id>/<name>`. The agent gets the path and, for text, a short preview; never the contents.
 * Server only.
 */
import { OrgoError, type OrgoClient } from "@/lib/orgo/user-client";
import { MAX_FILE_BYTES, shellQuote } from "./computer";
import { mimeFor } from "./files";

export const UPLOAD_PART_BYTES = 8 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = MAX_FILE_BYTES; // 100 MB
export const UPLOAD_ROOT = "/root/uploads";
const PREVIEW_CHARS = 1500;
const UPLOAD_ID = /^[a-f0-9]{24}$/;

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface UploadedFile {
  name: string;
  /** Absolute path on the user's computer. */
  path: string;
  size: number;
  mime?: string;
  /** The first characters of a text file, for the prompt. */
  preview?: string;
}

/** A file name safe as one path segment: no slashes, no leading dots, no control characters, at most 180 chars. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 180);
  return cleaned || "file";
}

export function isUploadId(id: string): boolean {
  return UPLOAD_ID.test(id);
}

/** Puts one file into `destDir` on a computer through Orgo's file transfer (the directory is made as needed). */
export async function transfer(orgo: OrgoClient, computerId: string, destDir: string, filename: string, bytes: Uint8Array): Promise<void> {
  let start: { upload_url: string; upload_token: string };
  try {
    start = await orgo.request<{ upload_url: string; upload_token: string }>("POST", "/files/uploads", { desktopId: computerId, filename, size_bytes: bytes.byteLength, destPath: destDir });
  } catch (err) {
    throw new UploadError(err instanceof OrgoError && err.status === 409 ? "Your computer is busy. Try again in a moment." : "The upload could not start.", 502);
  }
  if (!/^https:\/\//.test(start.upload_url)) throw new UploadError("The upload could not start.", 502);
  const put = await fetch(start.upload_url, { method: "PUT", body: bytes as BodyInit, signal: AbortSignal.timeout(180_000) }).catch(() => null);
  if (!put?.ok) throw new UploadError("The upload to storage did not finish. Try again.", 502);
  try {
    await orgo.request("POST", "/files/uploads/complete", { desktopId: computerId, upload_token: start.upload_token }, { timeoutMs: 180_000 });
  } catch {
    throw new UploadError("Your computer could not take the file.", 502);
  }
}

/**
 * Stores part `index` of `parts`. Parts arrive in order; the last one joins them and answers with the file.
 * Earlier parts answer null.
 */
export async function putUploadPart(
  orgo: OrgoClient,
  computerId: string,
  input: { uploadId: string; name: string; index: number; parts: number; size: number; bytes: Uint8Array },
): Promise<UploadedFile | null> {
  const { uploadId, index, parts, size, bytes } = input;
  if (!isUploadId(uploadId)) throw new UploadError("Bad upload id.");
  if (!Number.isSafeInteger(size) || size < 0 || size > UPLOAD_MAX_BYTES) throw new UploadError(`Files can be up to ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`, 413);
  const want = Math.max(1, Math.ceil(size / UPLOAD_PART_BYTES));
  if (!Number.isSafeInteger(parts) || parts !== want || !Number.isSafeInteger(index) || index < 0 || index >= parts) throw new UploadError("Bad part number.");
  if (bytes.byteLength > UPLOAD_PART_BYTES) throw new UploadError("A part is too large.", 413);
  const name = safeFileName(input.name);
  const incoming = `${UPLOAD_ROOT}/.incoming/${uploadId}`;
  await transfer(orgo, computerId, incoming, `part-${String(index).padStart(4, "0")}`, bytes);
  if (index < parts - 1) return null;

  const mime = mimeFor(name);
  const textual = !!mime && (mime.startsWith("text/") || /json|xml|yaml|sql|x-ndjson|ipynb/.test(mime));
  const dest = `${UPLOAD_ROOT}/${uploadId}/${name}`;
  const script = [
    `set -e`,
    `in=${shellQuote(incoming)}; out=${shellQuote(dest)}`,
    `n=$(ls "$in" | grep -c '^part-' || true)`,
    `[ "$n" = ${parts} ] || { echo "OM_UPLOAD_MISSING $n"; exit 0; }`,
    `mkdir -p "$(dirname "$out")"; chmod 700 ${UPLOAD_ROOT} 2>/dev/null || true`,
    `cat "$in"/part-* > "$out.tmp" && mv -f "$out.tmp" "$out" && rm -rf "$in"`,
    `echo "OM_UPLOAD_SIZE $(stat -c %s "$out")"`,
    textual ? `echo OM_UPLOAD_PREVIEW; head -c 6000 "$out" | base64 -w0; echo` : `true`,
  ].join("\n");
  const result = await orgo.bash(computerId, script, 120).catch(() => null);
  const out = result?.output ?? "";
  if (/OM_UPLOAD_MISSING/.test(out)) throw new UploadError("Some parts of the file did not arrive. Try again.", 409);
  const got = Number(/OM_UPLOAD_SIZE (\d+)/.exec(out)?.[1]);
  if (!Number.isFinite(got) || got !== size) throw new UploadError("The file did not arrive complete. Try again.", 502);
  let preview: string | undefined;
  const b64 = /OM_UPLOAD_PREVIEW\n([A-Za-z0-9+/=]*)/.exec(out)?.[1];
  if (b64) {
    const text = Buffer.from(b64, "base64").toString("utf8").replace(/�+$/, "");
    preview = text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
  }
  return { name, path: dest, size, ...(mime ? { mime } : {}), ...(preview ? { preview } : {}) };
}

/** True for a path this module produced (`/root/uploads/<id>/<name>`). */
export function isUploadPath(path: string): boolean {
  const m = /^\/root\/uploads\/([a-f0-9]{24})\/([^/]+)$/.exec(path);
  return !!m && safeFileName(m[2]) === m[2];
}
