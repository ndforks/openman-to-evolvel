/** "Sign out everywhere": the time before which session cookies count as signed out. Server only. */
import { getRevocation } from "@/lib/db/revocations";

/** When "sign out everywhere" (or account deletion) last ran, or null. Stored in `revocations`, not in settings. */
export async function sessionsRevokedAt(userId: string): Promise<string | null> {
  return (await getRevocation(userId)).sessionsRevokedAt;
}
