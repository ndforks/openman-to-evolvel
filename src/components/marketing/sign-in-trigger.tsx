"use client";

/**
 * A button for every "Sign in", "Sign up" and "Get started" call to action on the marketing site.
 * Signed out: opens the sign-in modal. Signed in: goes to the app.
 */
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/lib/ui-store";
import { useSession } from "@/lib/supabase/client";
import { APP_HOME } from "@/lib/supabase/config";

export interface SignInTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Where to go when the visitor is already signed in. Defaults to the app home. */
  href?: string;
  /** Always open the modal, even when a session exists (used by "try a different account"). */
  forceModal?: boolean;
}

/** Returns a function that opens the sign-in modal, or enters the app when already signed in. */
export function useSignIn(href: string = APP_HOME) {
  const router = useRouter();
  const open = useUI((state) => state.open);
  const { session } = useSession();
  return (options?: { forceModal?: boolean }) => {
    if (!options?.forceModal && session) {
      router.push(href);
      return;
    }
    open("sign-in");
  };
}

export function SignInTrigger({ href, forceModal, onClick, type = "button", children, ...rest }: SignInTriggerProps) {
  const signIn = useSignIn(href);
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    signIn({ forceModal });
  }
  return (
    <button type={type} onClick={handleClick} {...rest}>
      {children}
    </button>
  );
}
