// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Mints a session cookie for a throwaway QA user (a second signed-in person, e.g. a collaborator), the same way
// the app seals its own (`src/lib/session/cookie.ts`). Reads SESSION_SECRET from .env.local; prints nothing secret.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { loadEnv } from "./env.mjs";

loadEnv();

function key() {
  const v = process.env.SESSION_SECRET?.trim();
  if (!v) throw new Error("SESSION_SECRET is not set.");
  return /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : createHash("sha256").update(v, "utf8").digest();
}

/** `om_session=<sealed>` for a session object (userId, email, name...). */
export function sessionCookie(session) {
  const now = Date.now();
  const payload = JSON.stringify({ s: { avatarUrl: null, plan: "Free", workspaceId: null, ...session }, e: Math.floor(now / 1000) + 3600, i: now });
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from("om_session.v1", "utf8"));
  const ct = Buffer.concat([c.update(payload, "utf8"), c.final()]);
  return `om_session=${["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".")}`;
}
