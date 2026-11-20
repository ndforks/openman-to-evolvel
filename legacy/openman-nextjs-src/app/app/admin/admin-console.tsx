// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Operator console (`/app/admin`). Reads `/api/admin/overview` (operator only) and manages the invite list through
 * `/api/admin/members`. Aggregates only: no task titles, no prompts; emails only for the owner.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { RefreshCw, Trash2 } from "lucide-react";

type State = "ok" | "warn" | "fail" | "off";
interface Overview {
  viewer: { owner: boolean; via: string };
  health: {
    ok: boolean;
    at: string;
    environment: string;
    checks: Record<string, { state: State } & Record<string, unknown>>;
    config: { required: Record<string, boolean>; optional: Record<string, boolean> };
  };
  totals: { accounts: number | null; tasks: number | null; automations: number | null };
  signups: { day: string; count: number }[];
  tasks: { day: string; total: number; failed: number; stopped: number; failureRate: number }[];
  provisioning: { day: string; ready: number; failed: number }[];
  errors: { id: number; at: string; level: string; event: string; errorClass: string | null; message: string | null; requestId: string | null; taskId: string | null; user: string | null }[];
  costs: { category: string; unit: string; n: number; p50Usd: number; p90Usd: number; totalUsd: number }[];
  invites: { gateOn: boolean; canManage: boolean; members: { id: string; email: string | null; hasOrgoId: boolean; role: string; createdAt: string }[] };
}

const CARD = "rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] p-[16px]";
const H2 = "mb-[10px] text-[13px] font-medium uppercase tracking-[0.04em] text-[var(--om-text-3)]";
const DOT: Record<State, string> = { ok: "bg-[var(--om-success)]", warn: "bg-[var(--om-warning)]", fail: "bg-[var(--om-danger)]", off: "bg-[var(--om-text-disabled)]" };

const LABELS: Record<string, string> = {
  database: "Database",
  gate: "Server-only gate",
  scheduler: "Scheduler tick",
  webhooks: "Webhook queue",
  automations: "Automations",
  provisioning: "Provisioning",
  signIn: "Sign-in budget",
  errors: "Errors",
};

function detailOf(name: string, c: Record<string, unknown>): string {
  const n = (k: string) => (c[k] === null || c[k] === undefined ? "?" : String(c[k]));
  switch (name) {
    case "database":
      return c.ms != null ? `${n("ms")} ms` : n("detail");
    case "gate":
      return n("detail");
    case "scheduler":
      return c.ageSeconds == null ? "no tick recorded yet" : `last tick ${n("ageSeconds")} s ago${c.lastErrors ? `, ${n("lastErrors")} errors` : ""}`;
    case "webhooks":
      return `${n("pending")} pending, ${n("overdue")} overdue, ${n("failedLast24h")} failed (24 h)`;
    case "automations":
      return `${n("enabled")} on, ${n("failing")} failing, ${n("overdue")} overdue, ${n("openRuns")} running`;
    case "provisioning":
      return `${n("stuck")} stuck, ${n("behind")} behind v${n("latestSetupVersion")}, ${n("failedLast24h")} failed (24 h)`;
    case "signIn":
      return `${n("startsThisHour")} of ${n("budgetPerHour")} starts this hour`;
    case "errors":
      return `${n("lastHour")} in the last hour, ${n("last24h")} in 24 h`;
    default:
      return "";
  }
}

function Bars({ values, max, tone = "bg-[var(--om-fill-accent)]", title }: { values: { label: string; value: number; extra?: number }[]; max?: number; tone?: string; title: (v: { label: string; value: number; extra?: number }) => string }) {
  const top = Math.max(1, max ?? Math.max(...values.map((v) => v.value + (v.extra ?? 0))));
  return (
    <div className="flex h-[64px] items-end gap-[2px]" role="img" aria-label="Daily counts, last 30 days">
      {values.map((v) => (
        <div key={v.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={title(v)}>
          {v.extra ? <div className="w-full rounded-t-[2px] bg-[var(--om-danger)]" style={{ height: `${(v.extra / top) * 100}%` }} /> : null}
          <div className={`w-full ${v.extra ? "" : "rounded-t-[2px]"} ${tone}`} style={{ height: `${(v.value / top) * 100}%`, minHeight: v.value ? 2 : 0 }} />
        </div>
      ))}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={CARD}>
      <div className="flex items-start justify-between gap-[8px]">
        <h2 className={H2}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const money = (v: number) => (v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
const KIND: Record<string, string> = { chat: "Chat reply", browsing: "Browsing task", website: "Website build", wide_research: "Parallel research", other: "Other agent task" };

export function AdminConsole() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})${body.requestId ? `, id ${body.requestId}` : ""}`);
      setData(body as Overview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not add.");
      setEmail("");
      setNotice("Added.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/members?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not remove.");
      setNotice("Removed. Their session ends within a minute.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-[24px] py-[32px] text-[14px] text-[var(--om-text-2)]">
        {error ? <p className="text-[var(--om-danger)]">{error}</p> : <p>Loading the operator view…</p>}
      </div>
    );
  }

  const h = data.health;
  const failRate = (() => {
    const total = data.tasks.reduce((s, d) => s + d.total, 0);
    const failed = data.tasks.reduce((s, d) => s + d.failed, 0);
    return total ? `${((failed / total) * 100).toFixed(1)}% of ${total}` : "no tasks";
  })();

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[16px] px-[16px] py-[24px] sm:px-[24px]">
      <header className="flex flex-wrap items-center justify-between gap-[12px]">
        <div>
          <h1 className="font-serif text-[24px] text-[var(--om-text-1)]">Operations</h1>
          <p className="mt-[2px] text-[13px] text-[var(--om-text-3)]">
            {h.environment} · {h.ok ? "serving" : "degraded"} · checked {new Date(h.at).toLocaleTimeString()} · signed in as {data.viewer.via === "dev" ? "local owner (dev user)" : data.viewer.owner ? "owner" : "operator"}
          </p>
        </div>
        <button type="button" onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={loading} className="flex h-[32px] items-center gap-[6px] rounded-[8px] border border-[var(--om-border-strong)] px-[10px] text-[13px] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden /> Refresh
        </button>
      </header>
      {error ? <p className="text-[13px] text-[var(--om-danger)]">{error}</p> : null}

      <Section title="System health">
        <ul className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
          {Object.entries(h.checks).map(([name, c]) => (
            <li key={name} className="flex items-start gap-[10px] rounded-[8px] bg-[var(--om-fill-subtle)] px-[10px] py-[8px]">
              <span className={`mt-[6px] h-[8px] w-[8px] shrink-0 rounded-full ${DOT[c.state]}`} aria-label={c.state} />
              <div className="min-w-0">
                <div className="text-[13px] text-[var(--om-text-1)]">{LABELS[name] ?? name}</div>
                <div className="text-[12px] text-[var(--om-text-3)]">{detailOf(name, c)}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-[12px] flex flex-wrap gap-[6px] text-[11px]">
          {Object.entries({ ...h.config.required, ...h.config.optional }).map(([k, v]) => (
            <span key={k} className={`rounded-[6px] px-[6px] py-[2px] ${v ? "bg-[var(--om-success-soft)] text-[var(--om-success)]" : k in h.config.required ? "bg-[var(--om-danger-soft)] text-[var(--om-danger)]" : "bg-[var(--om-fill)] text-[var(--om-text-3)]"}`}>
              {k}
            </span>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-[16px] md:grid-cols-3">
        <Section title="Sign-ups (30 days)" aside={<span className="text-[12px] text-[var(--om-text-3)]">{data.totals.accounts ?? "?"} accounts</span>}>
          <Bars values={data.signups.map((d) => ({ label: d.day, value: d.count }))} title={(v) => `${v.label}: ${v.value}`} />
        </Section>
        <Section title="Provisioning (30 days)">
          <Bars values={data.provisioning.map((d) => ({ label: d.day, value: d.ready, extra: d.failed }))} tone="bg-[var(--om-success)]" title={(v) => `${v.label}: ${v.value} ready, ${v.extra ?? 0} failed`} />
        </Section>
        <Section title="Tasks per day" aside={<span className="text-[12px] text-[var(--om-text-3)]">failed {failRate}</span>}>
          <Bars values={data.tasks.map((d) => ({ label: d.day, value: d.total - d.failed, extra: d.failed }))} title={(v) => `${v.label}: ${v.value + (v.extra ?? 0)} tasks, ${v.extra ?? 0} failed`} />
        </Section>
      </div>

      <Section title="Model cost per task (last 90 days, Orgo's price)">
        {data.costs.length ? (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-[var(--om-text-3)]">
              <tr>
                <th className="py-[4px] font-normal">Kind</th>
                <th className="py-[4px] font-normal">Samples</th>
                <th className="py-[4px] font-normal">Median</th>
                <th className="py-[4px] font-normal">90th pct</th>
                <th className="py-[4px] font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.costs.map((c) => (
                <tr key={c.category} className="border-t border-[var(--om-border-subtle)]">
                  <td className="py-[6px]">{KIND[c.category] ?? c.category}</td>
                  <td className="py-[6px] text-[var(--om-text-2)]">
                    {c.n} {c.unit === "reply" ? "replies" : "tasks"}
                  </td>
                  <td className="py-[6px]">{money(c.p50Usd)}</td>
                  <td className="py-[6px]">{money(c.p90Usd)}</td>
                  <td className="py-[6px] text-[var(--om-text-2)]">{money(c.totalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px] text-[var(--om-text-3)]">No priced runs yet.</p>
        )}
        <p className="mt-[8px] text-[11px] text-[var(--om-text-3)]">Tokens are measured; prices are Orgo&apos;s list + 10% with every input token priced as fresh (an upper bound). Computer time is not included.</p>
      </Section>

      <Section title="Recent warnings and errors">
        {data.errors.length ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-left text-[12px]">
              <tbody>
                {data.errors.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--om-border-subtle)] align-top">
                    <td className="whitespace-nowrap py-[5px] pr-[8px] text-[var(--om-text-3)]">{new Date(e.at).toLocaleString()}</td>
                    <td className={`py-[5px] pr-[8px] ${e.level === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-warning)]"}`}>{e.event}</td>
                    <td className="py-[5px] pr-[8px] text-[var(--om-text-2)]">
                      {e.errorClass ? <span className="mr-[4px] text-[var(--om-text-1)]">{e.errorClass}</span> : null}
                      {e.message}
                    </td>
                    <td className="whitespace-nowrap py-[5px] font-mono text-[11px] text-[var(--om-text-3)]">{e.requestId ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--om-text-3)]">Nothing logged in the last 30 days.</p>
        )}
      </Section>

      <Section title="Invite list" aside={<span className="text-[12px] text-[var(--om-text-3)]">{data.invites.gateOn ? "gate on" : "gate off here: the list has no effect on this server"}</span>}>
        {data.invites.canManage ? (
          <form onSubmit={addMember} className="mb-[10px] flex flex-wrap gap-[8px]">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" aria-label="Email to invite" className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-[var(--om-border-strong)] bg-transparent px-[10px] text-[13px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]" />
            <button type="submit" disabled={busy} className="h-[32px] rounded-[8px] border border-[var(--om-border-strong)] px-[12px] text-[13px] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] disabled:opacity-50">
              Add
            </button>
          </form>
        ) : null}
        {notice ? <p className="mb-[8px] text-[12px] text-[var(--om-text-2)]">{notice}</p> : null}
        {data.invites.members.length ? (
          <ul className="divide-y divide-[var(--om-border-subtle)]">
            {data.invites.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-[8px] py-[6px] text-[13px]">
                <span className="min-w-0 truncate">
                  {m.email ?? (m.hasOrgoId ? "Orgo user (by id)" : "?")} <span className="text-[var(--om-text-3)]">· {m.role}</span>
                </span>
                {data.invites.canManage && m.role !== "owner" ? (
                  <button type="button" onClick={() => void removeMember(m.id)} disabled={busy} aria-label={`Remove ${m.email ?? "member"}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)] disabled:opacity-40">
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--om-text-3)]">Nobody on the list.</p>
        )}
      </Section>
    </div>
  );
}
