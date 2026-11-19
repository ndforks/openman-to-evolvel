// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Layout helpers shared by the Teams page sections: a 902 px column and the serif section heading. */
import type { ReactNode } from "react";

/** 902 px content column that becomes full width with 24 px side padding on smaller screens. */
export function Section({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className="flex w-full justify-center px-6">
      <div className={`w-full max-w-[902px] ${className}`}>{children}</div>
    </section>
  );
}

export function SectionHeading({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <h2
      className={`font-serif text-[28px] leading-[1.2] font-semibold text-[var(--om-text-1)] md:text-[40px] md:leading-[48px] ${className}`}
    >
      {children}
    </h2>
  );
}
