// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Sign-in & security.
 * Sign-in is "Continue with Orgo" (or an Orgo API key), so the sign-in methods, two-step verification and passkeys are
 * Orgo's and link there. What this app owns is shown for real: how this browser signed in, the current session,
 * "Sign out everywhere", and "Disconnect Orgo" (deletes the Orgo key this app keeps, `DELETE /api/me/orgo`).
 */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Monitor } from "lucide-react";
import { brand } from "@/config/brand";
import { Button, DIVIDER, LINK_BUTTON, Pane, cn } from "@/components/settings/ui";
import { useAccount } from "@/components/settings/useAccount";

/** Fallbacks until `/api/me` answers; afterwards the links come from the server (`ORGO_ORIGIN`). */
const ORGO_SIGN_IN_URL = "https://www.orgo.ai/settings/profile";
const ORGO_SECURITY_URL = "https://www.orgo.ai/settings/security";
const ORGO_API_KEYS_URL = "https://www.orgo.ai/api-keys";

const VIA_TEXT: Record<string, string> = {
  device: "Approved in your Orgo account",
  api_key: "Signed in with an Orgo API key",
  local: "Signed in with this computer's Orgo key (local sign-in)",
  dev: "Development sign-in (OPENMAN_DEV_BYPASS)",
};

interface DisconnectResult {
  revokedOnOrgo: boolean;
  keyId: string | null;
  revoke: { url: string; cli: string };
}

/** "Disconnect Orgo": deletes the stored key, signs out everywhere, then says whether the key still lives on Orgo. */
function DisconnectOrgo({ dev, apiKeysUrl }: { dev: boolean; apiKeysUrl: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DisconnectResult | null>(null);

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/orgo", { method: "DELETE", credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as DisconnectResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div role="status" className={cn("mx-[4px] mt-[12px] flex flex-col gap-[10px] rounded-[12px] border bg-[var(--om-card)] px-[16px] py-[12px]", DIVIDER)}>
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Orgo is disconnected</div>
        <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
          {brand.name} no longer holds a key to your Orgo account, and every browser is signed out.{" "}
          {result.revokedOnOrgo ? (
            "The key it created when you approved it was also revoked on Orgo."
          ) : (
            <>
              Your key still works on Orgo. To revoke it, open{" "}
              <a href={result.revoke.url} target="_blank" rel="noreferrer" className="underline underline-offset-[3px]">
                orgo.ai API keys
              </a>{" "}
              or run <code className="font-mono text-[12px]">{result.revoke.cli}</code>.
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              // A full page load on purpose: the session is gone.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/");
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-[24px] flex items-center justify-between gap-[16px] px-[4px] py-[8px]">
        <RowText
          title="Disconnect Orgo"
          description={`Deletes the Orgo key ${brand.name} keeps for you and signs you out everywhere. Automations, email and calls that act on Orgo stop until you sign in again; your tasks are kept.`}
        />
        {confirming || dev ? null : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
        )}
      </div>
      {confirming ? (
        <div className={cn("mx-[4px] mt-[12px] flex items-center justify-between gap-[16px] rounded-[12px] border bg-[var(--om-card)] px-[16px] py-[12px]", DIVIDER)}>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
            A key {brand.name} created through Orgo&apos;s approval page is revoked on Orgo too. A key you pasted stays valid on Orgo until you delete it at{" "}
            <a href={apiKeysUrl} target="_blank" rel="noreferrer" className="underline underline-offset-[3px]">
              orgo.ai API keys
            </a>
            .{error ? <span className="block text-[var(--om-danger)]">{error}</span> : null}
          </div>
          <div className="flex shrink-0 gap-[8px]">
            <Button onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void disconnect()} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect Orgo"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface SessionInfo {
  method: "orgo" | "dev";
  email: string;
  workspaceId: string | null;
  userAgent: string;
  revokedAt: string | null;
}

/** 40px rounded tile that holds a logo or glyph. */
function Tile({ children }: { children: ReactNode }) {
  return <div className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--om-border)] bg-[var(--om-surface)] text-[var(--om-icon-1)]">{children}</div>;
}

function RowText({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
      {description ? <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{description}</div> : null}
    </div>
  );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
      <span className="ps-[2px]">{children}</span>
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

/** "Chrome on macOS" from a user-agent string. */
function describeBrowser(ua: string): string {
  if (!ua) return "This browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SignInSecurityTab() {
  const account = useAccount();
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/account/sessions", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : null))
      .then((body) => {
        if (live && body) setInfo(body);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const signOutEverywhere = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/sessions", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // A full page load on purpose: it drops every in-memory store along with the session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out.");
      setBusy(false);
    }
  };

  const email = info?.email || account.email;

  return (
    <Pane title="Sign-in & security">
      <div className="pt-[24px]">
        <div className="px-[4px] pb-[12px]">
          <h3 className="text-[16px] font-semibold leading-[24px] text-[var(--om-text-1)]">How you sign in to {brand.name}</h3>
          <p className="mt-[2px] text-[13px] leading-[18px] text-[var(--om-text-3)]">You sign in with your Orgo account. Orgo manages your sign-in methods and how you confirm it’s you.</p>
        </div>

        <div className="flex items-center gap-[16px] border-b border-[var(--om-border-subtle)] px-[4px] py-[14px]">
          <Tile>
            <span className="text-[16px] font-bold leading-none">O</span>
          </Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Orgo</div>
            <div className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">
              {email} · {VIA_TEXT[account.orgo?.via ?? (info?.method === "dev" ? "dev" : "device")]}
              {account.orgo?.keyScope === "workspace" ? " (limited to one workspace)" : ""}
            </div>
          </div>
          <ExternalButton href={account.orgo?.links.profile ?? ORGO_SIGN_IN_URL}>Manage in Orgo</ExternalButton>
        </div>

        <div className="mt-[24px] flex items-center justify-between gap-[16px] px-[4px] py-[8px]">
          <RowText title="Two-step verification and passkeys" description="Set these up on your Orgo account. They protect every sign-in, including this one." />
          <ExternalButton href={account.orgo?.links.security ?? ORGO_SECURITY_URL}>Orgo security</ExternalButton>
        </div>

        <div className="mt-[24px] px-[4px] py-[8px]">
          <RowText title="Active session" description={`The browser you are using now. Sessions last 30 days.`} />
        </div>
        <div className="flex items-center gap-[16px] border-b border-[var(--om-border-subtle)] px-[4px] py-[14px]">
          <Tile>
            <Monitor size={20} strokeWidth={1.8} aria-hidden="true" />
          </Tile>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{info ? describeBrowser(info.userAgent) : "This browser"}</div>
            <div className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">Signed in as {email}</div>
          </div>
          <span className="shrink-0 text-[13px] leading-[18px] text-[var(--om-text-3)]">This device</span>
        </div>

        <div className="mt-[24px] flex items-center justify-between gap-[16px] px-[4px] py-[8px]">
          <RowText
            title="Sign out everywhere"
            description={info?.revokedAt ? `Signs out every browser signed in to ${brand.name}, this one included. Last used ${formatWhen(info.revokedAt)}.` : `Signs out every browser signed in to ${brand.name}, this one included.`}
          />
          {confirming ? null : <Button onClick={() => setConfirming(true)}>Sign out everywhere</Button>}
        </div>
      </div>
      {confirming ? (
        <div className={cn("mx-[4px] mt-[12px] flex items-center justify-between gap-[16px] rounded-[12px] border bg-[var(--om-card)] px-[16px] py-[12px]", DIVIDER)}>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
            Every session ends, and you sign in with Orgo again. Your tasks keep running and automations keep their schedule.
            {error ? <span className="block text-[var(--om-danger)]">{error}</span> : null}
          </div>
          <div className="flex shrink-0 gap-[8px]">
            <Button onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void signOutEverywhere()} disabled={busy}>
              {busy ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      ) : null}
      <DisconnectOrgo dev={info?.method === "dev" || account.orgo?.via === "dev"} apiKeysUrl={account.orgo?.links.apiKeys ?? ORGO_API_KEYS_URL} />
    </Pane>
  );
}
