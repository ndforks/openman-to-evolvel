// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { SignInPageBody } from "@/components/marketing/sign-in-page";

export const metadata: Metadata = {
  title: `Sign in | ${brand.name}`,
  description: `Sign in to ${brand.name} with your Orgo account. New to Orgo? Create an account for free.`,
  robots: { index: false },
};

/** `/signin?next=/app/...`: sign in with Orgo, then return to `next`. */
export default function SignInPage() {
  return (
    <main className="flex w-full flex-1 flex-col items-center bg-[var(--om-bg-subtle,var(--om-bg))] px-[16px] pb-[96px] pt-[56px]">
      {/* Reads the query string, so it sits behind its own boundary and the page shell stays static. */}
      <Suspense fallback={<div className="h-[480px] w-full max-w-[420px]" />}>
        <SignInPageBody />
      </Suspense>
    </main>
  );
}
