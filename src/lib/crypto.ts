// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Encryption at rest for secrets this server keeps for a user (their Orgo key, their Hermes key).
 * AES-256-GCM with `APP_ENCRYPTION_KEY` (64 hex chars = 32 bytes). Server only.
 *
 * Sealed format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. A fresh 12-byte IV per seal.
 * `open` throws on a wrong key, a tampered value or a value in another format; it never returns garbage.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** Turns a key setting into 32 bytes: 64 hex chars are used as is; anything else is hashed (SHA-256). */
export function keyBytes(raw: string | undefined, name: string): Buffer {
  const value = raw?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  return createHash("sha256").update(value, "utf8").digest();
}

let cachedKey: Buffer | null = null;
function appKey(): Buffer {
  cachedKey ??= keyBytes(process.env.APP_ENCRYPTION_KEY, "APP_ENCRYPTION_KEY");
  return cachedKey;
}

/** AES-256-GCM with an explicit key. Shared with the session cookie, which uses its own key. */
export function sealWith(key: Buffer, plain: string, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function openWith(key: Buffer, sealed: string, aad?: string): string {
  const parts = typeof sealed === "string" ? sealed.split(".") : [];
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Not a sealed value.");
  const [, ivPart, tagPart, ctPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The sealed value could not be opened (wrong key or tampered).");
  }
}

/** Encrypts a secret with `APP_ENCRYPTION_KEY`. */
export function seal(plain: string): string {
  return sealWith(appKey(), plain);
}

/** Decrypts a value made by `seal`. Throws when it cannot. */
export function open(sealed: string): string {
  return openWith(appKey(), sealed);
}
