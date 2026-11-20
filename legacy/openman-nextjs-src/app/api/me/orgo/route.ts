// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { open } from "@/lib/crypto";
import { getAccount, upsertAccount } from "@/lib/db/accounts";
import { setRevocation } from "@/lib/db/revocations";
import { forgetConnection } from "@/lib/agent/server/connection";
import { ORGO_LINKS } from "@/lib/orgo/account-view";
import { BadRequest, errorResponse, json } from "@/lib/orgo/http";
import { OrgoClient } from "@/lib/orgo/user-client";
import { forgetRevocation, requireSession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session/cookie";
import { clearOrgoLink, readOrgoLink } from "@/lib/session/orgo-link";

/**
 * DELETE /api/me/orgo: disconnect Orgo. Deletes the Orgo key OpenMan keeps (sealed) for this account, signs out every
 * browser and stops background work that acts on Orgo (automations, inbound mail and calls) until the person signs in
 * again. Tasks, projects and the agent computer link are kept.
 * - A key OpenMan minted through Orgo's approval page is also revoked on Orgo (`DELETE /api/keys/{id}`).
 * - A key the person pasted (or this machine's key) is theirs: it is left on Orgo, and the answer says how to revoke it.
 * Answers `{ ok, revokedOnOrgo, keyId, revoke: { url, cli } }`.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.dev) throw new BadRequest("The development user's key comes from .env.local; remove ORGO_API_KEY there.", 409);
    const [account, link] = await Promise.all([getAccount(session.userId), readOrgoLink(session.userId)]);
    let apiKey: string | null = null;
    try {
      apiKey = account?.orgoKeyEnc ? open(account.orgoKeyEnc) : null;
    } catch {
      apiKey = null;
    }
    const keyId = link?.keyId ?? null;
    let revokedOnOrgo = false;
    if (apiKey && link?.via === "device" && keyId) {
      revokedOnOrgo = await new OrgoClient({ apiKey })
        .deleteKey(keyId)
        .then(() => true)
        .catch(() => false);
    }
    await upsertAccount({ userId: session.userId, orgoKeyEnc: null });
    await clearOrgoLink(session.userId).catch(() => undefined);
    const now = new Date();
    await setRevocation(session.userId, { sessions: now, automations: now });
    forgetRevocation(session.userId);
    forgetConnection(session.userId);
    const res = json({
      ok: true,
      revokedOnOrgo,
      keyId: revokedOnOrgo ? null : keyId,
      revoke: { url: ORGO_LINKS.apiKeys, cli: keyId && !revokedOnOrgo ? `orgo keys delete ${keyId}` : "orgo keys list, then orgo keys delete <id>" },
    });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return errorResponse(err, req);
  }
}
