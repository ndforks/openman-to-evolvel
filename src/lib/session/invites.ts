/**
 * Invite gate (staging): with `INVITE_GATE=1` a signed-in Orgo user is admitted only when their Orgo user id or
 * email is in the `invites` table. The first account to sign in to an empty list becomes its owner. The list lives
 * only in the database; no personal data is kept in files. Server only.
 */
import { db, fail } from "@/lib/db/client";

export type InviteRole = "owner" | "member";
export interface Invite {
  id: string;
  orgoUserId: string | null;
  email: string | null;
  role: InviteRole;
  addedBy: string | null;
  createdAt: string;
}

export function inviteGateOn(): boolean {
  return process.env.INVITE_GATE === "1";
}

const g = globalThis as typeof globalThis & { __omInvites?: Map<string, { at: number; role: InviteRole | null }> };
const cache = (g.__omInvites ??= new Map());
const TTL_MS = 60_000;

/** At sign-in: admits (and, on an empty list, makes owner) or returns null. */
export async function admitOnSignIn(userId: string, email: string): Promise<InviteRole | null> {
  const { data, error } = await db().rpc("invite_admit", { p_user_id: userId, p_email: email });
  if (error) fail("check invite", error);
  const role = (data as InviteRole | null) ?? null;
  cache.set(userId, { at: Date.now(), role });
  return role;
}

/** The user's role, or null when not on the list. Cached for a minute. */
export async function roleOf(userId: string, email?: string): Promise<InviteRole | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.role;
  let q = db().from("invites").select("role,orgo_user_id,email");
  q = email ? q.or(`orgo_user_id.eq.${JSON.stringify(userId)},email.eq.${JSON.stringify(email.trim().toLowerCase())}`) : q.eq("orgo_user_id", userId);
  const { data, error } = await q.limit(1);
  if (error) {
    if (hit) return hit.role; // database hiccup: keep the last answer
    fail("read invite", error);
  }
  const role = ((data as { role: InviteRole }[] | null)?.[0]?.role ?? null) as InviteRole | null;
  cache.set(userId, { at: Date.now(), role });
  return role;
}

export async function isAdmitted(userId: string, email?: string): Promise<boolean> {
  try {
    return (await roleOf(userId, email)) !== null;
  } catch {
    return false;
  }
}

function fromRow(r: { id: string; orgo_user_id: string | null; email: string | null; role: InviteRole; added_by: string | null; created_at: string }): Invite {
  return { id: r.id, orgoUserId: r.orgo_user_id, email: r.email, role: r.role, addedBy: r.added_by, createdAt: r.created_at };
}

export async function listInvites(): Promise<Invite[]> {
  const { data, error } = await db().from("invites").select("*").order("created_at", { ascending: true }).limit(1000);
  if (error) fail("list invites", error);
  return (data ?? []).map(fromRow);
}

/** Adds a member by Orgo user id or email. */
export async function addInvite(input: { orgoUserId?: string; email?: string }, addedBy: string): Promise<Invite> {
  const email = input.email?.trim().toLowerCase() || null;
  const orgoUserId = input.orgoUserId?.trim() || null;
  const { data, error } = await db().from("invites").insert({ email, orgo_user_id: orgoUserId, role: "member", added_by: addedBy }).select("*").single();
  if (error) fail("add invite", error);
  return fromRow(data as Parameters<typeof fromRow>[0]);
}

/** Removes a member (never the owner). Their sessions end within a minute. */
export async function removeInvite(id: string): Promise<boolean> {
  const { data, error } = await db().from("invites").delete().eq("id", id).eq("role", "member").select("orgo_user_id");
  if (error) fail("remove invite", error);
  for (const r of (data ?? []) as { orgo_user_id: string | null }[]) if (r.orgo_user_id) cache.delete(r.orgo_user_id);
  return (data ?? []).length > 0;
}
