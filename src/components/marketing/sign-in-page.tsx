"use client";

/**
 * The `/signin` page body: the same "Continue with Orgo" panel as the modal, full page. `?next=` (a same-site path,
 * checked here and again on the server) is where every path lands; the request gate sends signed-out visitors here
 * with the page they asked for. Already signed in: goes straight to `next` (the development bypass's dev user is not a
 * sign-in, so it may still sign in for real here).
 */
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/supabase/config";
import { BrandMark } from "./brand-logo";
import { OrgoSignIn } from "./orgo-sign-in";

export function SignInPageBody() {
  const params = useSearchParams();
  const router = useRouter();
  const { session, loading } = useSession();
  const next = safeNextPath(params.get("next"));
  const error = params.get("auth_error") ?? undefined;
  const source = params.get("source") ?? undefined;

  useEffect(() => {
    if (!loading && session && !session.dev) router.replace(next);
  }, [loading, session, next, router]);

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center rounded-[20px] bg-[var(--om-bg)] px-[24px] pb-[24px] pt-[32px] shadow-[0px_0px_0px_1px_#0000000F,0px_12px_32px_#0000000A] sm:px-[40px]">
      <BrandMark width={40} height={40} className="shrink-0" />
      <OrgoSignIn next={next} initialError={error} source={source} />
    </div>
  );
}
