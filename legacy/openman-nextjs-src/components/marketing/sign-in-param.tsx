// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Opens the sign-in modal when the URL carries `?signin=1` (optionally with `next` and `auth_error`). */
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUI } from "@/lib/ui-store";

export function SignInParamWatcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = useUI((state) => state.open);
  const wantsSignIn = searchParams.get("signin") === "1";
  const next = searchParams.get("next");
  const authError = searchParams.get("auth_error");

  useEffect(() => {
    if (!wantsSignIn) return;
    open("sign-in", {
      ...(next ? { next } : {}),
      ...(authError ? { error: authError } : {}),
    });
    // Drop the one-shot parameters so closing the modal, or reloading, does not reopen it.
    const rest = new URLSearchParams(window.location.search);
    rest.delete("signin");
    rest.delete("next");
    rest.delete("auth_error");
    const query = rest.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [wantsSignIn, next, authError, open, pathname]);

  return null;
}
