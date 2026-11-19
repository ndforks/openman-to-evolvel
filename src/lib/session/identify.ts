/**
 * Who an Orgo API key belongs to, asked of Orgo itself. Server only. Used by every way in: the key Orgo hands over
 * at the end of the approval flow, a key the person pastes, and the local sign-in's `ORGO_API_KEY`.
 *
 * - Account key (`orgo keys create`, the approval flow): `GET /api/user/profile` names the person.
 * - Workspace-scoped key (`orgo keys create --workspace <id>`): Orgo refuses the profile, credits, subscription and
 *   billing to it (403 `workspace_scope_mismatch`) and it sees only its own workspace. It is accepted when the
 *   workspace has exactly one person, its owner: then the key can only be theirs, and the owner's id, email and avatar
 *   come from the workspace's member list. A key for a shared workspace is refused (OpenMan cannot tell which member
 *   holds it, and must not sign them in as the owner). What a workspace key cannot do in OpenMan is listed in
 *   `WORKSPACE_KEY_LIMITS`.
 */
import { createHash } from "node:crypto";
import { ORGO_ORIGIN, OrgoClient, OrgoError, type OrgoWorkspace } from "@/lib/orgo/user-client";

export type KeyScope = "account" | "workspace";

export interface KeyIdentity {
  scope: KeyScope;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** Orgo's tier key for the account that pays (the person, or the workspace owner for a workspace key). */
  tier: string | null;
  /** The key's id on Orgo (to revoke it), when Orgo told. */
  keyId: string | null;
  /** Workspaces this key can see (one for a workspace key). */
  workspaces: OrgoWorkspace[];
  /** A workspace key's workspace. */
  workspaceId: string | null;
}

/** What a workspace-scoped key cannot do in OpenMan, in the words the sign-in screen and Settings use. */
export const WORKSPACE_KEY_LIMITS =
  "This key is limited to one workspace, so Orgo won't share your credit balance, usage or billing with it, and OpenMan can't switch workspaces. Tasks, computers and setup work. For everything, use an account key or Continue with Orgo.";

/** A key Orgo refused, or one OpenMan will not sign in with. `message` is written for the person. */
export class KeyRejected extends Error {
  constructor(
    message: string,
    readonly code: "malformed" | "invalid_key" | "key_too_narrow" | "workspace_key_shared",
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Orgo keys are `sk_live_` plus 48 hex characters; anything else that starts `sk_` is passed to Orgo to judge. */
export function looksLikeOrgoKey(value: string): boolean {
  return /^sk_[A-Za-z0-9_]{16,200}$/.test(value);
}

/** Orgo avatar paths are site-relative (`/api/storage/user-avatars/...`, publicly readable). */
export function absoluteAvatar(src: string | null | undefined): string | null {
  const value = src?.trim();
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return `${ORGO_ORIGIN}${value}`;
  return /^https:\/\//.test(value) ? value : null;
}

const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 16);

/** The id of the key `apiKey` among those `GET /api/keys` lists, matched on its 12-character prefix. */
async function findKeyId(orgo: OrgoClient, apiKey: string): Promise<string | null> {
  const keys = await orgo.keys().catch(() => []);
  const matches = keys.filter((k) => {
    const prefix = (k.key_prefix ?? "").replace(/…|\.\.\.$/g, "");
    return prefix.length >= 8 && apiKey.startsWith(prefix);
  });
  return matches.length === 1 ? matches[0].id : null;
}

export async function identifyKey(rawKey: string): Promise<KeyIdentity> {
  const apiKey = rawKey.trim();
  if (!looksLikeOrgoKey(apiKey)) throw new KeyRejected("That doesn't look like an Orgo API key. Orgo keys start with sk_live_.", "malformed");
  const orgo = new OrgoClient({ apiKey });

  let profile: Awaited<ReturnType<OrgoClient["profile"]>> | null = null;
  try {
    profile = await orgo.profile();
  } catch (err) {
    if (!(err instanceof OrgoError)) throw err;
    if (err.status === 401) throw new KeyRejected("Orgo doesn't accept this key. Check you copied all of it, or create a new one.", "invalid_key", 401);
    if (err.status === 403 && err.code !== "workspace_scope_mismatch")
      throw new KeyRejected("This key can't read your Orgo account (it is limited to one computer or has narrow permissions). Use an account key.", "key_too_narrow", 403);
    if (err.status !== 403) throw err; // Orgo down or slow: a 502 for the route, not a judgement on the key
  }

  if (profile && profile.api_key?.scope !== "workspace") {
    const [workspaces, tier] = await Promise.all([
      orgo.workspaces().catch(() => [] as OrgoWorkspace[]),
      orgo
        .subscription()
        .then((s) => s.tier ?? null)
        .catch(() => orgo.credits().then((c) => c.tier ?? null).catch(() => null)),
    ]);
    const email = profile.email ?? "";
    return {
      scope: "account",
      userId: profile.id,
      email,
      name: profile.full_name?.trim() || profile.display_name?.trim() || email.split("@")[0] || "Orgo user",
      avatarUrl: absoluteAvatar(profile.avatar_url),
      tier,
      keyId: profile.api_key?.id ?? null,
      workspaces,
      workspaceId: null,
    };
  }

  // Workspace-scoped key.
  const workspaces = await orgo.workspaces();
  const ws = workspaces[0];
  if (!ws) throw new KeyRejected("This key can't see any workspace. Use an account key.", "key_too_narrow", 403);
  const people = await orgo.members(ws.id);
  const owner = people.length === 1 && (!ws.user_id || people[0].id === ws.user_id) ? people[0] : null;
  if (!owner)
    throw new KeyRejected(
      "This key is for a shared workspace, so OpenMan can't tell whose it is. Use an account key (orgo keys create, without --workspace), or Continue with Orgo.",
      "workspace_key_shared",
      403,
    );
  const email = owner.email || owner.alt || ws.owner_email || "";
  return {
    scope: "workspace",
    userId: owner.id,
    email,
    name: ws.owner_name?.trim() || email.split("@")[0] || "Orgo user",
    avatarUrl: absoluteAvatar(owner.src),
    tier: ws.owner_tier ?? null,
    keyId: (await findKeyId(orgo, apiKey)) ?? null,
    workspaces: [ws],
    workspaceId: ws.id,
  };
}

/** For logs and tests: a short, one-way tag of a key (never the key). */
export function keyTag(apiKey: string): string {
  return fingerprint(apiKey.trim());
}
