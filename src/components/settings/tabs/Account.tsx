"use client";

/**
 * Settings > Account: name, plan and credit balance (the user's Orgo account, from `/api/me`), the linked Orgo account
 * and the workspace OpenMan works in (switchable, `PUT /api/me/workspaces`), "manage on Orgo" links, sign-in email
 * (managed by Orgo), user id, delete account. The display name is saved with `PATCH /api/account`.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LogOut, Sparkles } from "lucide-react";
import { brand } from "@/config/brand";
import { useSession } from "@/lib/supabase/client";
import { useUI } from "@/lib/ui-store";
import { DeleteAccountRow } from "../DangerZone";
import { reloadAccount, useAccount, type MeOrgo } from "../useAccount";
import { Avatar, Button, Card, HelpGlyph, LINK_BUTTON, Pane, SelectBox, TextInput, cn, useCopy } from "../ui";

const ORGO_PROFILE_URL = "https://www.orgo.ai/settings/profile";
const READY_KEY = "openman:home-ready";

interface WorkspaceRow {
  id: string;
  name: string;
  yours: boolean;
  role: string;
  ownerEmail: string | null;
  ownerPlan: string;
  computers: number;
  usable: boolean;
}

function OrgoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
      <span className="ps-[2px]">{children}</span>
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

const VIA_LABEL: Record<MeOrgo["via"], string> = {
  device: "approved in your Orgo account",
  api_key: "signed in with an API key",
  local: "signed in with this computer's Orgo key",
  dev: "development sign-in",
};

/** The linked Orgo account, the workspace OpenMan works in (with a switcher) and links to manage both on orgo.ai. */
function OrgoAccountSection({ orgo, email, hasComputer }: { orgo: MeOrgo; email: string; hasComputer: boolean }) {
  const [list, setList] = useState<{ current: string | null; canSwitch: boolean; workspaces: WorkspaceRow[] } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me/workspaces", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live && body) setList(body as typeof list);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const ws = orgo.workspace;
  const target = list?.workspaces.find((w) => w.id === pick) ?? null;

  const switchTo = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/workspaces", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ workspaceId: id }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; reset?: boolean };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      try {
        window.sessionStorage.removeItem(READY_KEY);
      } catch {
        // ignored
      }
      if (body.reset) {
        // The first-run screen sets an agent computer up in the new workspace. A full load drops in-memory stores.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/app");
        return;
      }
      setList((l) => (l ? { ...l, current: id } : l));
      setPick(null);
      void reloadAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch.");
    } finally {
      setBusy(false);
    }
  };

  const usable = list?.workspaces.filter((w) => w.usable) ?? [];
  const keyLabel = orgo.keyScope === "workspace" ? "workspace key" : orgo.via === "dev" ? "env key" : "account access";

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[16px] font-semibold leading-[24px] text-[var(--om-text-1)]">Orgo account</div>
      <div className="flex flex-wrap items-center justify-between gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Linked account</div>
          <div className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">
            {email} · {VIA_LABEL[orgo.via]} · {keyLabel}
          </div>
        </div>
        <OrgoLink href={orgo.links.profile}>Manage on Orgo</OrgoLink>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Workspace</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
            {ws ? (
              <>
                {brand.name} creates and uses computers in <span className="text-[var(--om-text-2)]">{ws.name}</span>
                {ws.yours ? ", billed to you" : ws.ownerEmail ? `, billed to its owner (${ws.ownerEmail}, ${ws.ownerPlan})` : ""}.
              </>
            ) : (
              "No workspace yet."
            )}
          </div>
        </div>
        {list?.canSwitch && usable.length > 1 ? (
          <SelectBox
            ariaLabel="Workspace"
            value={pick ?? list.current ?? usable[0].id}
            onValueChange={(id) => {
              setError(null);
              if (id === list.current) return setPick(null);
              if (!hasComputer) return void switchTo(id);
              setPick(id);
            }}
            options={usable.map((w) => ({ value: w.id, label: w.yours ? `${w.name} (yours)` : `${w.name} (${w.ownerEmail ?? w.role})` }))}
            className="w-[230px]"
            align="end"
          />
        ) : null}
      </div>
      {target ? (
        <div className={cn("flex flex-col gap-[10px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] px-[16px] py-[12px]")}>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
            Your agent computer lives in {ws?.name ?? "the current workspace"}, so switching to {target.name} sets up a new one there next time you open the app (you can pick a computer already in {target.name}). The current computer is not deleted and keeps billing on Orgo until you stop it there.
          </div>
          <div className="flex justify-end gap-[8px]">
            <Button onClick={() => setPick(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void switchTo(target.id)} disabled={busy}>
              {busy ? "Switching…" : `Switch to ${target.name}`}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
      {orgo.keyScope === "workspace" ? (
        <div className="rounded-[10px] bg-[var(--om-fill-subtle)] px-[12px] py-[10px] text-[13px] leading-[18px] text-[var(--om-text-2)]">
          You signed in with a key limited to one workspace, so Orgo doesn&apos;t share your credit balance or billing with {brand.name}, and the workspace can&apos;t be switched. Sign out and Continue with Orgo for everything.
        </div>
      ) : null}
      <div className="flex flex-wrap gap-[8px]">
        <OrgoLink href={orgo.links.billing}>Plan &amp; billing</OrgoLink>
        <OrgoLink href={orgo.links.credits}>Buy credit</OrgoLink>
        <OrgoLink href={orgo.links.apiKeys}>API keys</OrgoLink>
        <OrgoLink href={orgo.links.home}>Computers on Orgo</OrgoLink>
      </div>
    </div>
  );
}

function InfoRow({ label, value, children, className }: { label: string; value: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-[16px]", className)}>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{label}</div>
        <div className="w-full truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">{value}</div>
      </div>
      {children}
    </div>
  );
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Name field that saves after a pause. */
function NameField({ initial, dev }: { initial: string; dev: boolean }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = (name: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!name.trim()) return;
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setState("saved");
        void reloadAccount();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
        setState("error");
      }
    }, 700);
  };

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-[5px]">
      <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
        Full name
        {state === "saving" ? " · Saving…" : state === "saved" ? " · Saved" : state === "error" ? <span className="text-[var(--om-danger)]"> · {error}</span> : null}
      </span>
      <TextInput
        value={value}
        readOnly={dev}
        title={dev ? "The development user's name comes from the Orgo workspace." : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
          save(e.target.value);
        }}
        autoComplete="name"
        maxLength={80}
        className="h-[36px] w-full max-w-[280px]"
      />
    </label>
  );
}

export default function AccountTab() {
  const account = useAccount();
  const { signOut } = useSession();
  const open = useUI((s) => s.open);
  const [copied, copy] = useCopy();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      // A full page load on purpose: it drops every in-memory store along with the session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    }
  };

  return (
    <Pane title="Account">
      <div className="flex flex-col gap-[24px] pt-[24px]">
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[16px]">
            <span className="shrink-0 overflow-hidden rounded-full border border-[var(--om-border)]">
              <Avatar size={58} src={account.avatarUrl} name={account.name} />
            </span>
            {account.loading ? <div className="flex-1" /> : <NameField key={account.userId} initial={account.name} dev={account.userId === "dev"} />}
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void handleSignOut()}
              className="ms-auto flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-1)] outline outline-1 outline-[var(--om-border)] transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]"
            >
              <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>

          <Card className="flex flex-col">
            <div className="flex w-full items-center justify-between gap-[12px] border-b border-dashed border-[var(--om-border-strong)] py-[12px]">
              <div className="whitespace-nowrap font-serif text-[16px] font-bold leading-[22px] text-[var(--om-text-1)]">{account.plan}</div>
              <Button variant="primary" onClick={() => open("upgrade-pro")}>
                Upgrade
              </Button>
            </div>
            <div className="flex w-full flex-col gap-[16px] py-[16px]">
              <div className="flex w-full flex-col gap-[4px]">
                <div className="flex items-center gap-[6px]">
                  <span className="flex size-[20px] items-center justify-center">
                    <Sparkles size={18} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--om-icon-1)]" />
                  </span>
                  <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Credits</span>
                  <span title="Your Orgo balance. One credit is one US dollar; tasks and computers draw from it." className="flex cursor-help">
                    <HelpGlyph size={14} />
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-end text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{account.loading ? "…" : account.creditsKnown ? money(account.credits.total) : "Not available"}</div>
                </div>
                <div className="flex w-full items-center text-[13px] leading-[18px] text-[var(--om-text-3)]">
                  <span className="min-w-0 flex-1 truncate">Orgo balance, 1 credit = $1</span>
                  {!account.loading && !account.creditsKnown ? <span className="shrink-0">This sign-in can&apos;t read the balance</span> : null}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {account.orgo ? <OrgoAccountSection orgo={account.orgo} email={account.email} hasComputer={!!account.homeComputer} /> : null}

        <div className="flex flex-col gap-[16px]">
          <InfoRow label="Email" value={account.email}>
            <a href={ORGO_PROFILE_URL} target="_blank" rel="noreferrer" className="inline-flex h-[32px] min-w-[64px] shrink-0 items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] hover:opacity-90 active:opacity-80">
              <span className="ps-[2px]">Change in Orgo</span>
              <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
            </a>
          </InfoRow>
          <InfoRow label="User ID" value={account.userId}>
            <Button onClick={() => copy(account.userId)}>{copied ? "Copied" : "Copy"}</Button>
          </InfoRow>
        </div>

        <div className="h-px w-full bg-[var(--om-border)]" />

        <DeleteAccountRow compact className="pb-[16px]" />
      </div>
    </Pane>
  );
}
