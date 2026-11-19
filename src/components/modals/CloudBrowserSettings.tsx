// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Cloud browser settings: whether the agent's browser keeps sign-ins between tasks, the sites it has saved sessions
 * for, and clearing one site or all of them. Talks to `/api/browser` (the user's own home computer).
 * Mount inside a Settings tab; it renders its own sections.
 */
import { Globe, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Row, Section, SectionHeading, Toggle, cn, DIVIDER } from "@/components/settings/ui";

interface SavedLogin {
  handle: string;
  label: string;
  identifier: string | null;
}
interface BrowserSite {
  site: string;
  cookies: number;
  lastUsed: string | null;
  logins: SavedLogin[];
}
interface BrowserState {
  persist: boolean;
  sites: BrowserSite[];
  browserOpen: boolean;
}

async function call(path: string, init?: RequestInit): Promise<BrowserState> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as BrowserState & { error?: string };
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `Last used ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function CloudBrowserSettings() {
  const [state, setState] = useState<BrowserState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let live = true;
    call("/api/browser").then(
      (next) => {
        if (live) setState(next);
      },
      (err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Could not load the browser settings.");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const act = async (key: string, run: () => Promise<BrowserState>) => {
    setBusy(key);
    try {
      setState(await run());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const setPersist = (persist: boolean) => act("persist", () => call("/api/browser/settings", { method: "PUT", body: JSON.stringify({ persist }) }));
  const clearSite = (site: string) => act(`site:${site}`, () => call("/api/browser/clear", { method: "POST", body: JSON.stringify({ site }) }));
  const clearAll = () => {
    setConfirmAll(false);
    return act("all", () => call("/api/browser/clear", { method: "POST", body: JSON.stringify({ all: true }) }));
  };

  const sites = state?.sites ?? [];

  return (
    <div data-testid="cloud-browser-settings" className="flex flex-col">
      <Section>
        <SectionHeading className="mb-[16px]">Cloud browser</SectionHeading>
        <Row
          title="Stay signed in between tasks"
          description="Sites the agent logs in to remain logged in next time. It checks with you before saving a new login. Switch off and every task begins logged out."
        >
          {busy === "persist" ? <Loader2 size={16} className="animate-spin text-[var(--om-icon-3)]" aria-label="Saving" /> : null}
          <Toggle checked={state?.persist ?? true} disabled={!state || busy !== null} onCheckedChange={(next) => void setPersist(next)} label="Stay signed in between tasks" />
        </Row>
      </Section>

      <Section last>
        <div className="mb-[12px] flex items-center justify-between gap-[12px]">
          <div className="flex flex-col">
            <SectionHeading>Saved sessions</SectionHeading>
            <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Sites the agent&apos;s browser is signed in to, and logins saved for it. Values and passwords are never shown.</div>
          </div>
          {sites.length > 0 ? (
            confirmAll ? (
              <div className="flex items-center gap-[8px]">
                <Button variant="ghost" onClick={() => setConfirmAll(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => void clearAll()} disabled={busy !== null}>
                  Clear all sessions
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmAll(true)} disabled={busy !== null}>
                {busy === "all" ? <Loader2 size={14} className="animate-spin" /> : null}
                Clear all
              </Button>
            )
          ) : null}
        </div>
        {confirmAll ? <div className="mb-[12px] text-[13px] leading-[18px] text-[var(--om-danger)]">This signs the agent out of every site and removes every saved login. It cannot be undone.</div> : null}
        {error ? (
          <div role="alert" className="mb-[12px] text-[13px] leading-[18px] text-[var(--om-danger)]">
            {error}
          </div>
        ) : null}
        <Card className="px-0">
          {!state && !error ? (
            <div className="flex items-center gap-[8px] px-[14px] py-[14px] text-[13px] text-[var(--om-text-3)]">
              <Loader2 size={14} className="animate-spin" /> Checking your computer…
            </div>
          ) : sites.length === 0 ? (
            <div className="px-[14px] py-[14px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Nothing saved.</div>
          ) : (
            <ul>
              {sites.map((s, i) => (
                <li key={s.site} data-site={s.site} className={cn("flex items-center gap-[12px] px-[14px] py-[10px]", i > 0 && "border-t", DIVIDER)}>
                  <Globe size={16} className="shrink-0 text-[var(--om-icon-2)]" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{s.site}</div>
                    <div className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">
                      {[s.cookies ? `${s.cookies} cookie${s.cookies === 1 ? "" : "s"}` : "", when(s.lastUsed)].filter(Boolean).join(" · ")}
                    </div>
                    {s.logins.map((l) => (
                      <div key={l.handle} className="flex items-center gap-[4px] truncate text-[12px] leading-[16px] text-[var(--om-text-2)]">
                        <KeyRound size={12} className="shrink-0" /> {l.label || "Saved login"}
                        {l.identifier ? ` (${l.identifier})` : ""}
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" aria-label={`Clear ${s.site}`} onClick={() => void clearSite(s.site)} disabled={busy !== null}>
                    {busy === `site:${s.site}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Clear
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}

export default CloudBrowserSettings;
