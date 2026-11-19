// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * First run. Every signed-in user needs an agent computer (an Orgo computer running the agent) before a task can start.
 * The gate asks `GET /api/me/provision`; ready users see the app at once (the check runs behind it).
 *
 * Nothing is created without the person choosing. With no agent computer yet, the choose screen reads
 * `GET /api/me/computers` and offers:
 *  - a suitable computer already in their Orgo workspace (Orgo's Hermes template, or plain Linux Orgo installs Hermes on);
 *  - a new computer from Orgo's Hermes template, with Orgo's real price for it on their plan.
 * An account with no plan and no credit is sent to Orgo's billing page first (setup needs one of them). Someone with
 * more than one usable Orgo workspace picks which one OpenMan works in here (`PUT /api/me/workspaces`; remembered, and
 * changeable later in Settings, Account). The choice is `POST /api/me/provision` (`{ computerId }` or nothing); the
 * progress screen follows it every two seconds and lands on Home when the computer is ready. A session that has ended
 * (signed out everywhere, Orgo disconnected) goes to the sign-in page and comes back here. `?setup=1` shows the screens
 * anyway (demo and QA).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Cpu, Plus, RefreshCw } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/icons";
import { reloadAccount } from "@/components/settings/useAccount";
import { CREDITS, PLAN_TIERS } from "@/lib/orgo/plans";

type State = "idle" | "creating_computer" | "starting_computer" | "waiting_for_boot" | "orgo_agent_setup" | "configuring_hermes" | "publishing" | "verifying" | "ready" | "error";

interface ProvisionStatus {
  state: State;
  message: string;
  progress: number;
  error?: string;
  running?: boolean;
  homeComputerId?: string | null;
}

interface Candidate {
  id: string;
  name: string;
  os: string;
  status: string;
  cpu: number | null;
  ramGb: number | null;
  diskGb: number | null;
  kind: "hermes" | "linux" | "unsuitable";
  suitable: boolean;
  note: string;
}

interface SetupOptions {
  workspace: { id: string; name: string; yours: boolean; ownerEmail: string | null } | null;
  current: string | null;
  candidates: Candidate[];
  newComputer: { size: string; vcpu: number; memoryGb: number; billedAs: "plan" | "hourly"; hourlyUsd: number; alwaysOnMonthlyUsd: number; monthlyUsd: number; planIncludesMediums: number | null };
  billing: { plan: string; paid: boolean; balanceCents: number | null; payer: "you" | "owner"; ready: boolean | null; lowCredit: boolean; note: string | null };
  links: { billing: string; credits: string; starter: string; home: string };
}

/** The steps as the user reads them, and which server states belong to each. */
const STEPS: { label: string; states: State[] }[] = [
  { label: "Get your computer", states: ["idle", "creating_computer"] },
  { label: "Start it up", states: ["starting_computer", "waiting_for_boot"] },
  { label: `Install the ${brand.name} agent`, states: ["orgo_agent_setup", "configuring_hermes"] },
  { label: "Connect it to this app", states: ["publishing", "verifying"] },
];

const READY_KEY = "openman:home-ready";
const POLL_MS = 2000;
const STARTER = PLAN_TIERS.find((t) => t.id === "starter") ?? PLAN_TIERS[0];
const MIN_TOP_UP_USD = CREDITS.topUpMinCents / 100;

interface WorkspaceRow {
  id: string;
  name: string;
  yours: boolean;
  role: string;
  ownerEmail: string | null;
  usable: boolean;
}

/** After an ended session: sign in again, then come back to this page. */
function sendToSignIn() {
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.assign(here === "/app" ? "/signin" : `/signin?${new URLSearchParams({ next: here }).toString()}`);
}

const primary = "inline-flex h-[38px] cursor-pointer items-center justify-center gap-[6px] rounded-[10px] bg-[var(--om-btn-primary)] px-[16px] text-[14px] font-medium text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex h-[36px] cursor-pointer items-center justify-center gap-[6px] rounded-[10px] border border-[var(--om-border)] px-[14px] text-[14px] font-medium text-[var(--om-text-1)] outline-none hover:bg-[var(--om-fill-subtle)]";

/**
 * True when the page shows something another person shared with the caller (a task they collaborate on, or a project
 * shared with them): that runs on the owner's computer or is only being looked at, so no setup is forced on them.
 */
async function sharedPage(pathname: string): Promise<boolean> {
  const task = /^\/app\/task\/([A-Za-z0-9_-]{6,64})/.exec(pathname)?.[1];
  const project = /^\/app\/project\/([A-Za-z0-9_-]{6,64})/.exec(pathname)?.[1];
  const url = task ? `/api/tasks/${task}` : project ? `/api/projects/${project}` : null;
  if (!url) return false;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return false;
  const body = (await res.json().catch(() => null)) as { task?: { role?: string }; role?: string } | null;
  const role = task ? body?.task?.role : body?.role;
  return role === "collaborator" || role === "editor" || role === "member";
}

class NeedsFunding extends Error {}

async function read(method: "GET" | "POST", body?: Record<string, unknown>): Promise<ProvisionStatus | null> {
  const res = await fetch("/api/me/provision", {
    method,
    cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) return null;
  const answer = (await res.json().catch(() => null)) as (ProvisionStatus & { code?: string }) | { error?: string; code?: string } | null;
  if (res.status === 402) throw new NeedsFunding((answer as { error?: string } | null)?.error ?? "Add an Orgo plan or credit first.");
  if (answer && "state" in answer) return answer;
  throw new Error((answer as { error?: string } | null)?.error ?? `Setup check failed (${res.status}).`);
}

function needsChoice(s: ProvisionStatus): boolean {
  return s.state === "idle" && !s.running && !s.homeComputerId;
}

function usd(n: number): string {
  return n < 1 ? `$${n.toFixed(3).replace(/0$/, "")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function specs(c: Candidate): string {
  const parts = [c.cpu ? `${c.cpu} vCPU` : null, c.ramGb ? `${c.ramGb} GB memory` : null, c.diskGb ? `${c.diskGb} GB disk` : null, c.status];
  return parts.filter(Boolean).join(" · ");
}

function Shell({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-[var(--om-bg)] px-[16px] py-[48px]">
      <section aria-labelledby="setup-title" aria-live="polite" className="flex w-full max-w-[520px] flex-col gap-[22px]">
        <div className="flex flex-col gap-[8px]">
          <h1 id="setup-title" className="font-serif text-[28px] leading-[36px] text-[var(--om-text-1)]">
            {title}
          </h1>
          <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">{intro}</p>
        </div>
        {children}
      </section>
    </div>
  );
}

function Choice({ selected, onSelect, title, detail, note, icon }: { selected: boolean; onSelect: () => void; title: ReactNode; detail: ReactNode; note?: ReactNode; icon: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-[12px] rounded-[12px] border p-[14px] text-left outline-none transition-colors",
        selected ? "border-[var(--om-icon-accent)] bg-[var(--om-fill-subtle)]" : "border-[var(--om-border)] hover:bg-[var(--om-fill-subtle)]",
      )}
    >
      <span className={cn("mt-[2px] flex size-[18px] shrink-0 items-center justify-center rounded-full border-2", selected ? "border-[var(--om-icon-accent)]" : "border-[var(--om-border-strong)]")}>
        {selected ? <span className="size-[8px] rounded-full bg-[var(--om-icon-accent)]" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-[8px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{detail}</span>
        {note ? <span className="text-[12px] leading-[17px] text-[var(--om-text-3)]">{note}</span> : null}
      </span>
    </button>
  );
}

function FundingCallout({ options, onRecheck, checking }: { options: SetupOptions; onRecheck: () => void; checking: boolean }) {
  return (
    <div role="alert" className="flex flex-col gap-[12px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] p-[16px]">
      <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Add a plan or credit on Orgo first</div>
      <p className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
        {options.billing.note ?? "Your Orgo account has no plan and no credit yet."} Orgo&apos;s {STARTER.name} plan is {usd(STARTER.monthlyUsd)} a month and keeps one computer like this always on; credit starts at {usd(MIN_TOP_UP_USD)} and pays by the hour.
      </p>
      <div className="flex flex-wrap gap-[8px]">
        <a href={options.links.starter} target="_blank" rel="noreferrer" className={primary}>
          Choose a plan <ArrowUpRight size={14} aria-hidden />
        </a>
        <a href={options.links.credits} target="_blank" rel="noreferrer" className={secondary}>
          Buy credit <ArrowUpRight size={14} aria-hidden />
        </a>
        <button type="button" onClick={onRecheck} disabled={checking} className={secondary}>
          <RefreshCw size={14} aria-hidden className={checking ? "animate-spin" : undefined} /> I&apos;ve done it, check again
        </button>
      </div>
    </div>
  );
}

function ChooseScreen({ onChosen }: { onChosen: (status: ProvisionStatus) => void }) {
  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("new");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [spaces, setSpaces] = useState<{ current: string | null; canSwitch: boolean; workspaces: WorkspaceRow[] } | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async (first: boolean) => {
    try {
      const res = await fetch("/api/me/computers", { cache: "no-store" });
      if (res.status === 401) return sendToSignIn();
      const body = (await res.json().catch(() => null)) as SetupOptions | { error?: string } | null;
      if (!res.ok || !body || !("candidates" in body)) throw new Error((body as { error?: string } | null)?.error ?? `Couldn't read your Orgo workspace (${res.status}).`);
      setOptions(body);
      setLoadError(null);
      setFunding(body.billing.ready === false);
      if (first) {
        const hermes = body.candidates.find((c) => c.kind === "hermes");
        setSelected(hermes?.id ?? "new");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't read your Orgo workspace.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch answers, not synchronously
    void load(true);
  }, [load]);

  // The Orgo workspaces this sign-in can use, for the picker (shown only when there is a choice).
  useEffect(() => {
    let live = true;
    fetch("/api/me/workspaces", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live && body && Array.isArray(body.workspaces)) setSpaces(body as typeof spaces);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const switchWorkspace = async (id: string) => {
    if (!spaces || id === spaces.current) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/me/workspaces", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: id }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Couldn't switch workspace (${res.status}).`);
      setSpaces({ ...spaces, current: id });
      setOptions(null);
      await load(true);
      void reloadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch workspace.");
    } finally {
      setSwitching(false);
    }
  };

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await read("POST", selected === "new" ? { new: true } : { computerId: selected });
      if (!status) return sendToSignIn();
      onChosen(status);
    } catch (err) {
      if (err instanceof NeedsFunding) setFunding(true);
      else setError(err instanceof Error ? err.message : "Setup could not start.");
    } finally {
      setBusy(false);
    }
  };

  if (!options) {
    return (
      <Shell title="Set up your agent computer" intro={`${brand.name} works on a cloud computer of your own, in your Orgo account.`}>
        {loadError ? (
          <div role="alert" className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[20px] text-[var(--om-danger)]">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(null); void load(true); }} className={cn(primary, "self-start")}>
              Try again
            </button>
          </div>
        ) : (
          <p className="text-[14px] text-[var(--om-text-3)]">Reading your Orgo workspace…</p>
        )}
      </Shell>
    );
  }

  const usable = options.candidates.filter((c) => c.suitable);
  const unusable = options.candidates.filter((c) => !c.suitable);
  const q = options.newComputer;
  const chosen = usable.find((c) => c.id === selected);
  const newPrice =
    q.billedAs === "plan"
      ? `Uses room in your ${options.billing.plan} plan${q.planIncludesMediums ? ` (it keeps ${q.planIncludesMediums === 1 ? "one Medium" : `${q.planIncludesMediums} Mediums`} always on)` : ""}. Past your plan's room, Orgo bills it by the hour from credit: ${usd(q.hourlyUsd)} an hour.`
      : `Billed by the hour from your Orgo credit: ${usd(q.hourlyUsd)} an hour, about ${usd(q.alwaysOnMonthlyUsd)} a month if it runs all the time. Orgo's ${STARTER.name} plan (${usd(STARTER.monthlyUsd)} a month) keeps one always on instead.`;
  const ws = options.workspace;
  const choices = spaces?.canSwitch ? spaces.workspaces.filter((w) => w.usable) : [];

  return (
    <Shell
      title="Set up your agent computer"
      intro={
        <>
          {brand.name} works on a cloud computer in your Orgo workspace{ws ? <> <span className="font-medium text-[var(--om-text-1)]">{ws.name}</span></> : null}
          {ws && !ws.yours && ws.ownerEmail ? `, billed to its owner (${ws.ownerEmail})` : ""}. Pick one you already have, or create a new one. You can change the workspace later in Settings, Account.
        </>
      }
    >
      {choices.length > 1 ? (
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium leading-[18px] text-[var(--om-text-2)]">Orgo workspace</span>
          <select
            value={spaces?.current ?? ws?.id ?? ""}
            disabled={switching || busy}
            onChange={(e) => void switchWorkspace(e.target.value)}
            className="h-[38px] w-full cursor-pointer rounded-[10px] border border-[var(--om-border)] bg-[var(--om-bg)] px-[10px] text-[14px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)] disabled:cursor-wait disabled:opacity-60"
          >
            {choices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.yours ? `${w.name} (yours)` : `${w.name} (${w.ownerEmail ?? w.role})`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {funding ? (
        <FundingCallout
          options={options}
          onRecheck={() => {
            setChecking(true);
            void load(false);
          }}
          checking={checking}
        />
      ) : null}

      <div role="radiogroup" aria-label="Agent computer" className="flex flex-col gap-[10px]">
        {usable.map((c) => (
          <Choice
            key={c.id}
            selected={selected === c.id}
            onSelect={() => setSelected(c.id)}
            icon={<Cpu size={15} aria-hidden className="shrink-0 text-[var(--om-icon-1)]" />}
            title={<>Use {c.name}</>}
            detail={specs(c)}
            note={`${c.note} Already paid for, so nothing new is billed. ${brand.name} configures the agent on it (its API server, reachable only with its own key); your files stay.`}
          />
        ))}
        <Choice
          selected={selected === "new"}
          onSelect={() => setSelected("new")}
          icon={<Plus size={15} aria-hidden className="shrink-0 text-[var(--om-icon-1)]" />}
          title="Create a new computer"
          detail={`${q.size}: ${q.vcpu} vCPU, ${q.memoryGb} GB memory, from Orgo's Hermes agent template.`}
          note={newPrice}
        />
      </div>

      {unusable.length ? (
        <details className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
          <summary className="cursor-pointer">
            {unusable.length} other computer{unusable.length === 1 ? "" : "s"} in this workspace can&apos;t run the agent
          </summary>
          <ul className="mt-[8px] flex flex-col gap-[6px] ps-[16px]">
            {unusable.map((c) => (
              <li key={c.id}>
                <span className="text-[var(--om-text-2)]">{c.name}</span>: {c.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="text-[14px] leading-[20px] text-[var(--om-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-[12px]">
        <button type="button" onClick={() => void go()} disabled={busy || (selected === "new" && funding)} className={primary}>
          {busy ? "Starting…" : chosen ? `Use ${chosen.name}` : "Create computer"}
        </button>
        {options.billing.lowCredit && selected === "new" ? <span className="text-[12px] leading-[17px] text-[var(--om-text-3)]">Low credit: top up on Orgo to keep it running.</span> : null}
      </div>
    </Shell>
  );
}

function SetupScreen({ status, error, onRetry, onChooseAgain }: { status: ProvisionStatus | null; error: string | null; onRetry: () => void; onChooseAgain: () => void }) {
  const state = status?.state ?? "idle";
  const current = state === "ready" ? STEPS.length : Math.max(0, STEPS.findIndex((s) => s.states.includes(state)));
  const failed = state === "error" || error !== null;
  const progress = Math.round(Math.min(1, Math.max(0.04, status?.progress ?? 0.04)) * 100);
  return (
    <Shell title={state === "ready" ? "Your computer is ready" : "Setting up your computer"} intro={`${brand.name} works on a cloud computer of your own, in your Orgo account. Setting it up takes a few minutes, once.`}>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--om-fill)]">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Setup progress" className={cn("h-full rounded-full transition-[width] duration-700", failed ? "bg-[var(--om-danger)]" : "bg-[var(--om-icon-accent)]")} style={{ width: `${progress}%` }} />
      </div>

      <ol className="flex flex-col gap-[12px]">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current && !failed;
          return (
            <li key={step.label} className="flex items-center gap-[12px] text-[14px] leading-[20px]">
              <span className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-full border", done ? "border-transparent bg-[var(--om-icon-accent)] text-white" : "border-[var(--om-border-strong)] text-[var(--om-text-3)]")}>
                {done ? <CheckIcon size={13} /> : active ? <span className="size-[12px] animate-spin rounded-full border-2 border-[var(--om-fill-strong)] border-t-[var(--om-icon-accent)]" /> : <span className="text-[11px]">{i + 1}</span>}
              </span>
              <span className={done || active ? "text-[var(--om-text-1)]" : "text-[var(--om-text-3)]"}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      <p className="min-h-[20px] text-[13px] leading-[18px] text-[var(--om-text-2)]">{failed ? null : (status?.message ?? "Checking your account")}</p>

      {failed ? (
        <div role="alert" className="flex flex-col gap-[12px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] p-[16px]">
          <p className="text-[14px] leading-[20px] text-[var(--om-danger)]">{error ?? status?.error ?? "Setup stopped."}</p>
          <div className="flex flex-wrap gap-[8px]">
            <button type="button" onClick={onRetry} className={primary}>
              Try again
            </button>
            <button type="button" onClick={onChooseAgain} className={secondary}>
              Choose another computer
            </button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

export function SetupGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const forced = params.get("setup") === "1";
  const [status, setStatus] = useState<ProvisionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"checking" | "open" | "choose" | "setup">("checking");
  const following = useRef(false);

  const finish = useCallback(() => {
    try {
      window.sessionStorage.setItem(READY_KEY, "1");
    } catch {
      // Storage blocked: the check simply runs again next time.
    }
    void reloadAccount();
    setGate("open");
    router.replace("/app");
  }, [router]);

  const resume = useCallback(async () => {
    setError(null);
    try {
      const next = await read("POST");
      if (!next) return sendToSignIn();
      setStatus(next);
    } catch (err) {
      if (err instanceof NeedsFunding) return setGate("choose");
      setError(err instanceof Error ? err.message : "Setup could not start.");
    }
  }, []);

  // Decide once per page load: open at once, ask what to use, or follow a setup already under way.
  useEffect(() => {
    let alive = true;
    let known = false;
    try {
      known = !forced && window.sessionStorage.getItem(READY_KEY) === "1";
    } catch {
      // No storage: ask the server.
    }
    // Both "checking" and "open" show the app, so a known-ready browser needs no state change at all.
    if (known) return;
    read("GET")
      .then(async (s) => {
        if (!alive) return;
        if (!s) return sendToSignIn();
        if (s.state === "ready" && !forced) {
          try {
            window.sessionStorage.setItem(READY_KEY, "1");
          } catch {
            // Storage blocked: the check runs again next time.
          }
          setGate("open");
        } else if (needsChoice(s) && !forced && (await sharedPage(pathname))) {
          // Someone else's task or project: show it without asking the caller to set up a computer of their own.
          if (alive) setGate("open");
        } else if (needsChoice(s)) {
          if (alive) setGate("choose");
        } else {
          setStatus(s);
          setGate("setup");
          // A setup that stopped (or one the person never started here) is resumed; a running one is only followed.
          if (!s.running && s.state !== "ready" && s.state !== "error") void resume();
        }
      })
      .catch(() => alive && setGate("open"));
    return () => {
      alive = false;
    };
    // Decided once per page load (not on every navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forced]);

  // On the setup screen: follow progress until ready.
  useEffect(() => {
    if (gate !== "setup") return;
    following.current = true;
    const timer = window.setInterval(() => {
      read("GET")
        .then((s) => {
          if (!s) return;
          setStatus(s);
          if (s.state === "ready") {
            window.clearInterval(timer);
            window.setTimeout(finish, 900);
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      following.current = false;
      window.clearInterval(timer);
    };
  }, [gate, finish]);

  if (gate === "choose")
    return (
      <ChooseScreen
        onChosen={(s) => {
          setStatus(s);
          setError(null);
          setGate("setup");
        }}
      />
    );
  if (gate === "setup") return <SetupScreen status={status} error={error} onRetry={() => void resume()} onChooseAgain={() => setGate("choose")} />;
  return <>{children}</>;
}
