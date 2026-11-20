// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Dark strip under the header: says what the product runs on and links to the guide. */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { brand } from "@/config/brand";

export function PromoBanner() {
  return (
    <Link
      href="/docs/getting-started"
      className="group flex min-h-[40px] w-full shrink-0 items-center justify-center gap-[10px] border-b border-[#6B1F1F] bg-[#111111] px-[24px] py-[8px]"
    >
      <span
        aria-hidden
        className="flex h-[22px] w-[18px] shrink-0 -rotate-12 items-center justify-center rounded-[3px] text-[9px] font-semibold leading-[12px] text-[#CFCFCF]"
        style={{ backgroundImage: "linear-gradient(160deg in oklab, #6A6A6A 0%, #2B2B2B 100%)" }}
      >
        ✦
      </span>
      <span className="text-center text-[14px] font-medium leading-[20px] text-white">
        <span className="font-serif text-[15px] font-bold italic">{brand.name}</span> is open source and works on a cloud computer in your Orgo account.{" "}
        <span className="font-normal text-[#A3A3A3]">Get going in a few minutes.</span>
      </span>
      <ArrowRight aria-hidden size={16} strokeWidth={2} className="shrink-0 text-[#A3A3A3] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
