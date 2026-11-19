// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { BrandMark } from "@/components/marketing/brand-logo";
import { SignInTrigger } from "@/components/marketing/sign-in-trigger";

export const metadata: Metadata = {
  title: `Waitlist | ${brand.name}`,
  description: `Access to ${brand.name} is by invitation at the moment.`,
  robots: { index: false },
};

/** Shown to people who signed in with an email that is not on the invite list (`ALLOWED_EMAILS`). */
export default function WaitlistPage() {
  return (
    <main className="flex w-full flex-1 flex-col items-center bg-[var(--om-bg)] px-4 pb-[120px] pt-[96px]">
      <div className="flex w-full max-w-[480px] flex-col items-center text-center">
        <BrandMark width={40} height={40} />
        <h1 className="mt-[24px] font-serif text-[36px] leading-[44px] text-[var(--om-text-1)]">Not on the list yet</h1>
        <p className="mt-[16px] text-[16px] leading-[24px] text-[var(--om-text-2)]">
          This {brand.name} deployment only admits invited addresses, and the one you used isn&apos;t one of them. We signed you out.
          Ask the person who runs it to add you, or try another email.
        </p>
        <div className="mt-[32px] flex flex-wrap items-center justify-center gap-[8px]">
          <Link
            href="/"
            className="inline-flex h-[36px] items-center justify-center rounded-[10px] bg-[var(--om-btn-primary)] px-[16px] text-[14px] font-medium leading-[20px] text-[var(--om-text-inverse)] transition-colors hover:opacity-90 active:opacity-80"
          >
            Back to home
          </Link>
          <SignInTrigger
            forceModal
            className="inline-flex h-[36px] cursor-pointer items-center justify-center rounded-[10px] bg-transparent px-[16px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)]"
          >
            Try another email
          </SignInTrigger>
        </div>
      </div>
    </main>
  );
}
