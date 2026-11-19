/**
 * Revocation times per user, in their own table (`revocations`), never in the user-editable settings document.
 * Kept when an account is deleted, so cookies and tokens issued before the deletion stay refused. Server only.
 */
import { db, fail } from "./client";

export interface Revocation {
  sessionsRevokedAt: string | null;
  automationsNotBefore: string | null;
}

export async function getRevocation(userId: string): Promise<Revocation> {
  const { data, error } = await db().from("revocations").select("sessions_revoked_at,automations_not_before").eq("user_id", userId).maybeSingle();
  if (error) fail("get revocation", error);
  const row = data as { sessions_revoked_at: string | null; automations_not_before: string | null } | null;
  return { sessionsRevokedAt: row?.sessions_revoked_at ?? null, automationsNotBefore: row?.automations_not_before ?? null };
}

/** Records a revocation time. Only moves forward. */
export async function setRevocation(userId: string, patch: { sessions?: Date; automations?: Date }): Promise<void> {
  const row: Record<string, string> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.sessions) row.sessions_revoked_at = patch.sessions.toISOString();
  if (patch.automations) row.automations_not_before = patch.automations.toISOString();
  const { error } = await db().from("revocations").upsert(row, { onConflict: "user_id" });
  if (error) fail("save revocation", error);
}
