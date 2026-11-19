"use client";

/**
 * Who is using the app, as the shell shows it (sidebar row, user menu, top bar).
 * Plan and credits come from the Settings account data; the name and avatar prefer the signed-in session.
 */
import { useSyncExternalStore } from "react";
import { formatCredits, useAccount } from "@/components/settings/useAccount";
import { useSession } from "@/lib/supabase/client";

export interface ShellAccount {
  name: string;
  /** Workspace label under the name in the user menu. */
  workspace: string;
  /** Plan label, e.g. "Free". */
  plan: string;
  /** Credits left, already formatted ("1,279"). */
  credits: string;
  avatarUrl: string | null;
  signOut: () => Promise<void>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const noop = () => () => undefined;
/** False during the server render and hydration, true after: the account lives in browser-side caches the server never sees. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useShellAccount(): ShellAccount {
  const hydrated = useHydrated();
  const account = useAccount();
  const { user, signOut } = useSession();
  const meta: Record<string, unknown> = user?.user_metadata ?? {};

  if (!hydrated) {
    return { name: "", workspace: "Personal", plan: "", credits: "", avatarUrl: null, signOut: async () => undefined };
  }
  return {
    name: text(meta.full_name) ?? text(meta.name) ?? text(user?.email) ?? account.name,
    workspace: account.workspace,
    plan: account.plan,
    credits: formatCredits(account.credits.total),
    avatarUrl: text(meta.avatar_url) ?? account.avatarUrl,
    signOut: async () => {
      try {
        await signOut();
      } finally {
        // A full reload (not a client navigation) drops everything the signed-in session left in memory.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }
    },
  };
}
