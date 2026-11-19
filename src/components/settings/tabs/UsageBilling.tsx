// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Usage & Billing, on the signed-in user's Orgo account: plan, credit balance (a credit is $1), top-ups
 * within Orgo's limits, spend per day and the credit ledger.
 */
import { useState, type ReactNode } from "react";
import { CalendarCheck, Sparkles } from "lucide-react";
import { CREDITS, planTier } from "@/lib/orgo/plans";
import { useUI } from "@/lib/ui-store";
import { Button, Card, DIVIDER, HelpGlyph, Pane, cn } from "@/components/settings/ui";
import { USAGE_RANGES, formatCredits, formatDollars, openBillingPortal, topUp, useCredits, useTransactions, useUsage, type CreditTransaction, type Usage } from "@/lib/billing";

const TABS = [
  { id: "usage", label: "Usage" },
  { id: "history", label: "Credit ledger" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function SparkleGlyph() {
  return (
    <Sparkles size={15} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
  );
}

function CalendarGlyph() {
  return (
    <CalendarCheck size={15} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
  );
}

/** Icon + label + help mark, as used on the left of each credits line. */
function CreditLabel({ icon, label, help }: { icon: ReactNode; label: string; help: string }) {
  return (
    <div className="flex items-center gap-[6px] text-[var(--om-text-1)]">
      <span className="flex size-[20px] items-center justify-center">{icon}</span>
      <span className="text-[14px] font-medium leading-[20px]">{label}</span>
      <span title={help} className="flex cursor-help">
        <HelpGlyph size={14} />
      </span>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block animate-pulse rounded-[6px] bg-[var(--om-fill)]", className)} />;
}

function Message({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return <p className={cn("text-[13px] leading-[18px]", tone === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>{children}</p>;
}

/* ---------- top-up ---------- */

function TopUp() {
  const [dollars, setDollars] = useState<string>("25");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(dollars) * 100);
  const valid = /^\d+$/.test(dollars) && cents >= CREDITS.topUpMinCents && cents <= CREDITS.topUpMaxCents;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await topUp(cents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[8px]">
      <CreditLabel icon={<SparkleGlyph />} label="Add credits" help={`Any whole dollar from ${formatDollars(CREDITS.topUpMinCents)} to ${formatDollars(CREDITS.topUpMaxCents)}, paid through Orgo's checkout.`} />
      <div className="flex flex-wrap items-center gap-[8px]">
        {CREDITS.topUpSuggestedCents.map((amount) => {
          const active = cents === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => setDollars(String(amount / 100))}
              aria-pressed={active}
              className={cn(
                "flex h-[32px] min-w-[56px] cursor-pointer items-center justify-center rounded-[8px] px-[12px] text-[14px] font-medium leading-[18px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
                active ? "border-[1.5px] border-[var(--om-btn-primary)] text-[var(--om-text-1)]" : "border border-[var(--om-btn-border)] text-[var(--om-text-2)] hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)]",
              )}
            >
              {formatDollars(amount)}
            </button>
          );
        })}
        <label className="flex h-[32px] w-[104px] items-center gap-[4px] rounded-[8px] border border-[var(--om-btn-border)] px-[12px] text-[14px] leading-[20px] hover:border-[var(--om-border-focus)] focus-within:border-[var(--om-border-focus)]">
          <span className="text-[var(--om-text-3)]">$</span>
          <input
            aria-label="Amount in US dollars"
            inputMode="numeric"
            value={dollars}
            onChange={(e) => setDollars(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-full min-w-0 bg-transparent text-[var(--om-text-1)] outline-none"
          />
        </label>
        <Button variant="primary" disabled={!valid || busy} onClick={() => void buy()}>
          {busy ? "Opening checkout…" : valid ? `Add ${formatDollars(cents)}` : "Add credits"}
        </Button>
      </div>
      {!valid && dollars !== "" ? <Message>Enter a whole dollar amount from {formatDollars(CREDITS.topUpMinCents)} to {formatDollars(CREDITS.topUpMaxCents)}.</Message> : null}
      {error ? <Message tone="error">{error}</Message> : null}
    </div>
  );
}

/* ---------- usage ---------- */

function shortDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function UsageChart({ usage }: { usage: Usage }) {
  const max = Math.max(1, ...usage.days.map((day) => day.aiCents + day.computerCents));
  return (
    <div className="flex h-[96px] items-end gap-[2px]" role="img" aria-label={`Spend per day, ${formatCredits(usage.usedCents)} in total`}>
      {usage.days.map((day) => {
        const total = day.aiCents + day.computerCents;
        return (
          <div key={day.date} title={`${shortDate(day.date)}: ${formatCredits(total)} (models ${formatCredits(day.aiCents)}, computers ${formatCredits(day.computerCents)})`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="w-full rounded-t-[2px] bg-[var(--om-icon-3)]" style={{ height: `${(day.computerCents / max) * 100}%` }} />
            <div className={cn("w-full bg-[var(--om-btn-accent)]", day.computerCents === 0 && "rounded-t-[2px]")} style={{ height: `${(day.aiCents / max) * 100}%`, minHeight: total > 0 ? 1 : 0 }} />
          </div>
        );
      })}
    </div>
  );
}

function UsagePanel() {
  const [days, setDays] = useState<number>(30);
  const { usage, loading, error } = useUsage(days);
  const ai = usage?.days.reduce((sum, day) => sum + day.aiCents, 0) ?? 0;
  const computers = usage?.days.reduce((sum, day) => sum + day.computerCents, 0) ?? 0;
  const added = usage?.days.reduce((sum, day) => sum + day.addedCents, 0) ?? 0;

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{loading && !usage ? <Skeleton className="h-[16px] w-[90px]" /> : `${formatCredits(usage?.usedCents ?? 0)} spent`}</div>
        <div role="radiogroup" aria-label="Range" className="flex gap-[2px] rounded-[8px] bg-[var(--om-fill)] p-[2px]">
          {USAGE_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              role="radio"
              aria-checked={days === range}
              onClick={() => setDays(range)}
              className={cn("h-[24px] cursor-pointer rounded-[6px] px-[8px] text-[12px] leading-[16px] outline-none", days === range ? "bg-[var(--om-surface)] font-medium text-[var(--om-text-1)]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)]")}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Message tone="error">{error}</Message>
      ) : usage?.unavailable ? (
        <Message>{usage.unavailable}</Message>
      ) : loading && !usage ? (
        <Skeleton className="h-[96px] w-full" />
      ) : usage && usage.days.length > 0 ? (
        <UsageChart usage={usage} />
      ) : (
        <Message>No usage in the last {days} days.</Message>
      )}

      {usage && !usage.unavailable ? (
        <div className={cn("grid grid-cols-3 gap-[8px] border-t pt-[12px]", DIVIDER)}>
          {[
            { label: "Agent models", value: ai, swatch: "bg-[var(--om-btn-accent)]" },
            { label: "Computers", value: computers, swatch: "bg-[var(--om-icon-3)]" },
            { label: "Credits added", value: added, swatch: "" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-[2px]">
              <span className="flex items-center gap-[6px] text-[12px] leading-[16px] text-[var(--om-text-3)]">
                {item.swatch ? <span aria-hidden="true" className={cn("size-[8px] rounded-[2px]", item.swatch)} /> : null}
                {item.label}
              </span>
              <span className="text-[14px] font-medium leading-[20px] tabular-nums text-[var(--om-text-1)]">{formatCredits(item.value)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {usage && usage.models.length > 0 ? (
        <div className={cn("flex flex-col gap-[6px] border-t pt-[12px]", DIVIDER)}>
          <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">Top models (provider price plus {CREDITS.modelMarkupPercent}%)</span>
          {usage.models.map((model) => (
            <div key={model.model} className="flex justify-between gap-[16px] text-[13px] leading-[18px] text-[var(--om-text-1)]">
              <span className="min-w-0 truncate">{model.model}</span>
              <span className="shrink-0 tabular-nums">{formatCredits(model.cents)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- history ---------- */

function groupByDay(rows: CreditTransaction[]): { date: string; rows: CreditTransaction[] }[] {
  const groups: { date: string; rows: CreditTransaction[] }[] = [];
  for (const row of rows) {
    const date = row.createdAt ? shortDate(row.createdAt) : "Earlier";
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups;
}

function HistoryPanel() {
  const { transactions, loading, error } = useTransactions();
  if (error) return <Message>{error}</Message>;
  if (loading && transactions.length === 0) return <Skeleton className="h-[120px] w-full" />;
  if (transactions.length === 0) return <Message>No credit activity yet.</Message>;
  return (
    <div className="flex flex-col gap-[8px]">
      {groupByDay(transactions).map((group) => (
        <div key={group.date} className="flex flex-col">
          <p className={cn("border-b py-[8px] text-[13px] font-normal leading-[19.5px] text-[var(--om-text-3)]", DIVIDER)}>{group.date}</p>
          {group.rows.map((row) => (
            <div key={row.id} className="flex w-full items-center gap-[16px] py-[8px] text-[13px] leading-[18px] text-[var(--om-text-1)]">
              <span className="min-w-0 flex-1 truncate">{row.description}</span>
              <span className={cn("shrink-0 font-medium tabular-nums", row.amountCents > 0 && "text-[var(--om-success)]")}>
                {row.amountCents > 0 ? "+" : ""}
                {formatCredits(row.amountCents)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- the tab ---------- */

export default function UsageBillingTab() {
  const open = useUI((s) => s.open);
  const { balanceCents, loading, error, tier, planName } = useCredits();
  const [tab, setTab] = useState<TabId>("usage");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const plan = tier ? planTier(tier) : undefined;

  const manage = async () => {
    setPortalBusy(true);
    setPortalError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Couldn't open billing.");
      setPortalBusy(false);
    }
  };

  return (
    <Pane title="Usage & Billing">
      <div className="pt-[24px]">
        <Card className="flex w-full flex-col">
          <div className="flex w-full items-center justify-between gap-[12px] border-b border-dashed border-[var(--om-border-strong)] py-[12px]">
            <div className="flex min-w-0 flex-col gap-[4px]">
              <div className="whitespace-nowrap font-serif text-[16px] font-bold leading-[22px] text-[var(--om-text-1)]">{planName}</div>
              <div className="text-[12px] leading-[16px] text-[var(--om-text-3)]">{plan ? `Orgo ${plan.name} plan · ${formatDollars(plan.monthlyCreditCents)} credit each month` : planName === "Pay as you go" ? "Orgo account · pay as you go from credits" : `Orgo ${planName} plan`}</div>
            </div>
            <div className="inline-flex shrink-0 flex-wrap items-center justify-end gap-[8px]">
              <Button disabled={portalBusy} onClick={() => void manage()}>
                {portalBusy ? "Opening…" : "Manage billing"}
              </Button>
              <Button variant="primary" onClick={() => open("upgrade-pro")}>
                {plan?.id === "scale" ? "Change plan" : "Upgrade"}
              </Button>
            </div>
          </div>
          {portalError ? <div className="pt-[8px]"><Message tone="error">{portalError}</Message></div> : null}

          <div className="flex w-full flex-col gap-[16px] py-[16px]">
          <div className="flex justify-between">
            <CreditLabel icon={<SparkleGlyph />} label="Credits" help={`One credit is $1. It pays for agent models (provider price plus ${CREDITS.modelMarkupPercent}%), computers by the hour and Orgo bills.`} />
            <div className="text-[14px] font-medium leading-[20px] tabular-nums text-[var(--om-text-1)]">{balanceCents === null ? (loading ? <Skeleton className="h-[16px] w-[64px]" /> : "—") : formatCredits(balanceCents)}</div>
          </div>
          {error && balanceCents === null ? <div className="-mt-[12px]"><Message>{error}</Message></div> : null}
          {plan ? (
            <div className="flex justify-between">
              <div className="flex flex-col gap-[4px]">
                <CreditLabel icon={<CalendarGlyph />} label="Monthly plan credit" help="Once a month Orgo tops your balance up to this amount if it is lower. It does not add on top." />
                <div className="text-[12px] leading-[18px] text-[var(--om-text-3)]">Balance topped up to {formatDollars(plan.monthlyCreditCents)} each month</div>
              </div>
              <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{formatDollars(plan.monthlyCreditCents)}</div>
            </div>
          ) : null}

          <TopUp />
          </div>
        </Card>
      </div>

      <div role="tablist" aria-label="Billing detail" className={cn("mb-[16px] mt-[24px] flex flex-wrap gap-x-[24px] border-b", DIVIDER)}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px cursor-pointer whitespace-nowrap border-b-2 py-[10px] text-[14px] leading-[20px] outline-none transition-colors duration-200",
                active ? "border-[var(--om-btn-primary)] font-medium text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "usage" ? <UsagePanel /> : <HistoryPanel />}
    </Pane>
  );
}
