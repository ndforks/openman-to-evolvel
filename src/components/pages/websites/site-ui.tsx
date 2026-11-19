// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Small building blocks shared by the site dashboard's tabs. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export const BTN =
  "inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-[9px] border border-[var(--om-border-strong)] px-[10px] text-[13px] font-medium text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] disabled:opacity-50";
export const BTN_PRIMARY = cn(BTN, "border-transparent bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:bg-[var(--om-btn-primary)] hover:opacity-90");
export const INPUT =
  "h-[34px] min-w-0 rounded-[9px] border border-[var(--om-border)] bg-transparent px-[10px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]";

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-[14px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[16px]", className)}>
      {title || actions ? (
        <div className="mb-[12px] flex items-center justify-between gap-[12px]">
          {title ? <h3 className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</h3> : <span />}
          {actions ? <div className="flex items-center gap-[8px]">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[16px] border-t border-[var(--om-border-subtle)] py-[12px] first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col">
        <span className="text-[14px] leading-[20px] text-[var(--om-text-1)]">{label}</span>
        {hint ? <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">{hint}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-[8px]">{children}</div>
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{children}</p>;
}

export function errorText(err: unknown, fallback = "Something went wrong."): string {
  return err instanceof Error ? err.message : fallback;
}
