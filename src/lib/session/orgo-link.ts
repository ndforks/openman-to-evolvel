/**
 * How the account's stored Orgo key came to be: through Orgo's approval page (a key OpenMan minted for itself, which
 * it may revoke on disconnect), pasted by the person, or read from this machine's `ORGO_API_KEY` (local sign-in).
 * Kept sealed under the server-owned `security` part of the settings document (clients cannot write it). Server only.
 */
import { open, seal } from "@/lib/crypto";
import { getSettings, patchSettings } from "@/lib/db/settings";
import type { KeyScope } from "./identify";

export type SignInVia = "device" | "api_key" | "local";

export interface OrgoLink {
  via: SignInVia;
  scope: KeyScope;
  keyId: string | null;
  linkedAt: string;
}

export async function saveOrgoLink(userId: string, link: OrgoLink): Promise<void> {
  await patchSettings(userId, { security: { orgoLink: seal(JSON.stringify(link)) } });
}

export async function readOrgoLink(userId: string): Promise<OrgoLink | null> {
  try {
    const doc = await getSettings(userId);
    const sealed = (doc.security as { orgoLink?: unknown } | undefined)?.orgoLink;
    if (typeof sealed !== "string") return null;
    const parsed = JSON.parse(open(sealed)) as OrgoLink;
    return parsed && typeof parsed.via === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearOrgoLink(userId: string): Promise<void> {
  await patchSettings(userId, { security: { orgoLink: null } });
}
