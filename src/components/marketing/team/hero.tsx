// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Teams page hero. */
import { brand } from "@/config/brand";
import { SignInTrigger } from "@/components/marketing/sign-in-trigger";
import { Section } from "./section";

export function Hero() {
  return (
    <Section className="flex flex-col items-center gap-[20px] pt-12 pb-[42px] md:pt-[72px]">
      <h1 className="w-full max-w-[760px] text-center font-serif text-[32px] leading-[1.2] font-semibold text-[var(--om-text-1)] sm:text-[48px] sm:leading-[57.6px]">
        {brand.name} across a team
      </h1>
      <p className="max-w-[560px] text-center text-[15px] leading-[22px] text-[var(--om-text-2)]">
        Each teammate gets their own Orgo account and agent computer. Results move around by link, and billing stays on whichever Orgo plan suits you.
      </p>
      <div className="flex gap-[10px] pt-[4px]">
        <SignInTrigger className="flex h-[40px] items-center gap-[6px] rounded-full bg-[var(--om-btn-primary)] px-[16px] text-[14px] leading-[20px] font-medium whitespace-nowrap text-[var(--om-text-inverse)] transition-opacity hover:opacity-90 active:opacity-80">
          Start free
        </SignInTrigger>
        <a
          href="mailto:contact@orgo.ai"
          className="flex h-[40px] items-center gap-[6px] rounded-full bg-[var(--om-fill)] px-[16px] text-[14px] leading-[20px] font-medium whitespace-nowrap text-[var(--om-text-1)] transition-opacity hover:opacity-90 active:opacity-80"
        >
          Talk to Orgo
        </a>
      </div>
    </Section>
  );
}
