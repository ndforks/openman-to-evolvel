/**
 * The end of every way in: with an Orgo API key (handed over by Orgo's approval flow, pasted by the person, or this
 * machine's `ORGO_API_KEY` for local sign-in), learn who this is from Orgo, apply the invite list, save the account
 * (key sealed), remember the workspace and build the session cookie. Server only.
 */
import { seal } from "@/lib/crypto";
import { getAccount, upsertAccount } from "@/lib/db/accounts";
import { forgetConnection } from "@/lib/agent/server/connection";
import { OrgoClient, OrgoError, planLabel, type OrgoWorkspace } from "@/lib/orgo/user-client";
import { resetHomeComputer } from "@/lib/provision";
import { isEmailAllowed } from "@/lib/supabase/config";
import { encodeSession } from "./cookie";
import { identifyKey, type KeyIdentity } from "./identify";
import { admitOnSignIn, inviteGateOn } from "./invites";
import { saveOrgoLink, type SignInVia } from "./orgo-link";
import type { Session } from "./index";

export type SignInResult = { kind: "session"; session: Session; cookie: string; identity: KeyIdentity } | { kind: "waitlist" };

/** A workspace the person may set an agent computer up in: their own, or one where they are more than a viewer. */
export function canUseWorkspace(w: OrgoWorkspace, userId: string): boolean {
  if (w.user_id === userId || w.role === "owner") return true;
  return !!w.role && !/view/i.test(w.role);
}

/**
 * The workspace OpenMan works in: the one already chosen if this key still sees it, else the person's own oldest
 * workspace (their personal one). A workspace key always works in its own workspace.
 */
export function pickWorkspace(identity: Pick<KeyIdentity, "scope" | "userId" | "workspaces" | "workspaceId">, current: string | null | undefined): string | null {
  if (identity.scope === "workspace") return identity.workspaceId;
  const usable = identity.workspaces.filter((w) => canUseWorkspace(w, identity.userId));
  if (current && usable.some((w) => w.id === current)) return current;
  const own = identity.workspaces.filter((w) => w.user_id === identity.userId || w.role === "owner");
  const sorted = [...own].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  return sorted[0]?.id ?? usable[0]?.id ?? null;
}

export async function signInWithKey(apiKey: string, opts: { via: SignInVia; keyId?: string; expectUserId?: string }): Promise<SignInResult> {
  const identity = await identifyKey(apiKey);
  if (opts.expectUserId && identity.userId !== opts.expectUserId) throw new OrgoError("Orgo returned a different account than the one approved. Try again.", 409, "identity_mismatch");

  if (!isEmailAllowed(identity.email) || (inviteGateOn() && !(await admitOnSignIn(identity.userId, identity.email)))) {
    // Not invited. A key OpenMan minted through the approval page is handed straight back, so no unused full-access
    // key is left on the account. A key the person brought is theirs and is never deleted.
    const keyId = opts.keyId ?? identity.keyId;
    if (opts.via === "device" && keyId) await new OrgoClient({ apiKey }).deleteKey(keyId).catch(() => undefined);
    return { kind: "waitlist" };
  }

  const existing = await getAccount(identity.userId).catch(() => null);
  const workspaceId = pickWorkspace(identity, existing?.workspaceId);
  // A name the person set in OpenMan is kept; otherwise Orgo's.
  const name = existing?.name?.trim() || identity.name;
  await upsertAccount({ userId: identity.userId, email: identity.email, name, orgoKeyEnc: seal(apiKey.trim()), workspaceId });
  if (existing?.workspaceId && existing.workspaceId !== workspaceId && existing.homeComputerId) {
    // The agent computer lives in the old workspace, which this key cannot reach: set up again in the new one.
    await resetHomeComputer(identity.userId).catch(() => undefined);
  }
  await saveOrgoLink(identity.userId, { via: opts.via, scope: identity.scope, keyId: opts.keyId ?? identity.keyId, linkedAt: new Date().toISOString() }).catch(() => undefined);
  forgetConnection(identity.userId); // the relay re-reads the new key

  const session: Session = {
    userId: identity.userId,
    email: identity.email,
    name,
    avatarUrl: identity.avatarUrl,
    plan: planLabel(identity.tier),
    workspaceId,
    keyScope: identity.scope,
    via: opts.via,
  };
  return { kind: "session", session, cookie: encodeSession(session), identity };
}

/** The approval flow's end: Orgo handed over a key it minted for OpenMan, for the user it names. */
export function completeOrgoSignIn(apiKey: string, keyId: string, user: { id: string; email: string }): Promise<SignInResult> {
  return signInWithKey(apiKey, { via: "device", keyId: keyId || undefined, expectUserId: user.id });
}
