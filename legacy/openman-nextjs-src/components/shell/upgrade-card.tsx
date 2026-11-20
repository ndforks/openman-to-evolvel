// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The stacked promo card above the user row. It alternates between Orgo's referral programme and the plans dialog.
 * Orgo's affiliate terms (orgo.ai/affiliates): $50 in Orgo usage credits for each person who subscribes, plus 50% of their
 * first three months and 10% after that. A credit is a dollar, so the card says "$50".
 */
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { ChevronRightIcon, HandshakeIcon, SparkleIcon } from "@/components/ui/icons";
import { useUI } from "@/lib/ui-store";

const ROTATE_MS = 8000;
/** Orgo's referral programme. Signed-in Orgo users get their link and the full terms there. */
export const REFERRAL_URL = "https://www.orgo.ai/affiliates";

/** Card face: half-pixel border, 12 px radius, translucent fill over the sidebar colour. */
const FACE = "rounded-[12px] border-[0.5px] border-[var(--om-border-strong)] bg-[var(--om-scrim-light)]";

function Card({ shown, icon, title, badge, subtitle, onClick }: { shown: boolean; icon: ReactNode; title: string; badge?: string; subtitle: string; onClick: () => void }) {
  return (
    <div className={cn("col-start-1 row-start-1 min-w-0 rounded-[12px] bg-[var(--om-bg-sidebar)]", shown ? "z-[2]" : "pointer-events-none")}>
      <div className={cn("relative flex w-full overflow-hidden whitespace-nowrap text-[14px] leading-[20px] text-[var(--om-text-1)] transition-shadow hover:shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_.5px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)]", FACE)}>
        <button
          type="button"
          onClick={onClick}
          tabIndex={shown ? 0 : -1}
          aria-hidden={!shown}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer select-none items-center justify-between rounded-[12px] py-[8px] ps-[9px] text-left outline-none transition-[opacity,transform,filter] ease-in-out focus-visible:bg-[var(--om-fill-subtle)]",
            shown ? "opacity-100 delay-[50ms] duration-300" : "translate-y-[4px] opacity-0 blur-[2px] duration-150",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-[12px]">
            <span className="relative flex shrink-0 text-[var(--om-icon-1)]">{icon}</span>
            <span className="flex w-full flex-col overflow-hidden text-start">
              <span className="flex min-w-0 items-center gap-[4px]">
                <span className="min-w-0 truncate font-serif text-[14px] leading-[20px] text-[var(--om-text-1)]">{title}</span>
                {badge ? <span className="flex h-[20px] shrink-0 items-center rounded-full bg-[var(--om-fill-accent)] px-[6px] text-[12px] font-normal leading-[16px] text-[var(--om-text-accent)]">{badge}</span> : null}
              </span>
              <span className="w-full truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{subtitle}</span>
            </span>
          </span>
          <span className="flex size-[32px] shrink-0 items-center justify-center text-[var(--om-icon-1)]">
            <ChevronRightIcon size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}

export function UpgradeCard() {
  const open = useUI((s) => s.open);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % 2), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="-mt-[8px] w-full">
      <div className="relative grid w-full pt-[8px]">
        {/* The card behind: the same face, 8 px up and 5% smaller, so only its top edge shows. */}
        <div aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 min-w-0 origin-top -translate-y-[8px] scale-95 rounded-[12px] bg-[var(--om-bg-sidebar)]">
          <div className={cn("h-full", FACE)} />
        </div>
        <Card
          shown={index === 0}
          icon={<HandshakeIcon size={18} />}
          title="Invite a friend, get $50"
          subtitle="Orgo credit for every friend who subscribes"
          onClick={() => window.open(REFERRAL_URL, "_blank", "noopener")}
        />
        <Card shown={index === 1} icon={<SparkleIcon size={18} strokeWidth={2} />} title="Need more room?" subtitle="Compare Orgo plans" onClick={() => open("upgrade-pro")} />
      </div>
    </div>
  );
}
