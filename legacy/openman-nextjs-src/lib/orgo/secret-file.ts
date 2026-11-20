// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Puts a secret on a user's computer as a file instead of inside a bash command body (Orgo echoes command bodies
 * and may log them). The bytes go through Orgo's file transfer: `POST /files/uploads` (a presigned PUT straight to
 * storage), then `/files/uploads/complete`, which has the computer pull the file into place. The script that uses the
 * secret reads the file and deletes it at once (`readAndRemove` below). Server only.
 */
import { randomBytes } from "node:crypto";
import { OrgoError, type OrgoClient } from "./user-client";

export const SECRET_DIR = "/root/.openman/incoming";

/** Uploads `content` and returns the absolute path of the file on the computer. */
export async function stageSecretFile(orgo: OrgoClient, computerId: string, content: string): Promise<string> {
  const bytes = Buffer.from(content, "utf8");
  const name = `s-${randomBytes(12).toString("hex")}.json`;
  let start: { upload_url: string; upload_token: string };
  try {
    start = await orgo.request<{ upload_url: string; upload_token: string }>("POST", "/files/uploads", { desktopId: computerId, filename: name, size_bytes: bytes.byteLength, destPath: SECRET_DIR });
  } catch (err) {
    throw new Error(err instanceof OrgoError ? `Orgo refused the transfer: ${err.message}` : "The settings could not be sent to your computer.");
  }
  if (!/^https:\/\//.test(start.upload_url)) throw new Error("The settings could not be sent to your computer.");
  const put = await fetch(start.upload_url, { method: "PUT", body: new Uint8Array(bytes), signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!put?.ok) throw new Error("The settings could not be sent to your computer.");
  await orgo.request("POST", "/files/uploads/complete", { desktopId: computerId, upload_token: start.upload_token }, { timeoutMs: 120_000 });
  return `${SECRET_DIR}/${name}`;
}

/** Python lines that load the staged JSON into `name` and delete the file (and fail clearly when it is missing). */
export function readAndRemove(path: string, name = "payload"): string {
  if (!/^\/root\/\.openman\/incoming\/s-[0-9a-f]{24}\.json$/.test(path)) throw new Error("Bad staged path.");
  return [
    `import json as _j, os as _o`,
    `_p = ${JSON.stringify(path)}`,
    `${name} = _j.load(open(_p, encoding="utf-8"))`,
    `_o.remove(_p)`,
  ].join("\n");
}
