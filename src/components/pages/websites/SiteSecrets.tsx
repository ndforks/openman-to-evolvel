// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Secrets of a site: names only after saving (values are sealed in our database and written to the site's `.env` on the
 * user's computer, never shown again). `SecretRequestCard` is the same form for secrets the agent asked for.
 */
import { KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { deleteSecret, listSecrets, setSecret, timeAgo } from "@/lib/websites/client";
import type { SecretRequest, SiteSecret, Website } from "@/lib/websites/types";
import { BTN, BTN_PRIMARY, Card, INPUT, Muted, errorText } from "./site-ui";

const envNote = (env: "written" | "pending") => (env === "written" ? "Saved. The site reads it at once." : "Saved. It reaches the site when your computer wakes.");

function SecretForm({ siteId, name: fixedName, why, onSaved }: { siteId: string; name?: string; why?: string; onSaved: (secrets: SiteSecret[]) => void }) {
  const [name, setName] = useState(fixedName ?? "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-[6px]"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setSecret(siteId, name, value)
          .then((r) => {
            setValue("");
            if (!fixedName) setName("");
            toast(envNote(r.env), "success");
            onSaved(r.secrets);
          })
          .catch((err: unknown) => toast(errorText(err), "error"))
          .finally(() => setBusy(false));
      }}
    >
      {why ? <span className="text-[12px] text-[var(--om-text-3)]">{why}</span> : null}
      <div className="flex flex-wrap gap-[8px]">
        {fixedName ? (
          <span className="flex h-[34px] items-center font-mono text-[13px] text-[var(--om-text-1)]">{fixedName}</span>
        ) : (
          <input className={`${INPUT} w-[200px] font-mono uppercase`} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAME" aria-label="Secret name" />
        )}
        <input className={`${INPUT} min-w-[200px] flex-1`} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" aria-label="Secret value" />
        <button type="submit" className={BTN_PRIMARY} disabled={busy || !name.trim() || !value}>
          Save
        </button>
      </div>
    </form>
  );
}

export function SiteSecrets({ site }: { site: Website }) {
  const [secrets, setSecrets] = useState<SiteSecret[] | null>(null);
  const load = useCallback(() => {
    listSecrets(site.id)
      .then((r) => setSecrets(r.secrets))
      .catch((err: unknown) => toast(errorText(err), "error"));
  }, [site.id]);
  useEffect(load, [load]);

  return (
    <Card title="Secrets">
      <Muted>
        API keys and other values the site&apos;s server reads from its environment (<code>process.env.NAME</code>). They are encrypted at rest, written to the site&apos;s private
        <code> .env</code> file on your computer, never published and never committed. A saved value is never shown again.
      </Muted>
      <div className="mt-[12px] flex flex-col">
        {(secrets ?? []).map((s) => (
          <div key={s.name} className="flex items-center justify-between gap-[12px] border-t border-[var(--om-border-subtle)] py-[10px] first:border-t-0">
            <span className="flex items-center gap-[8px] font-mono text-[13px] text-[var(--om-text-1)]">
              <KeyRound size={14} aria-hidden className="text-[var(--om-icon-3)]" /> {s.name}
              <span className="font-sans text-[12px] text-[var(--om-text-3)]">••••••••  updated {timeAgo(s.updatedAt)}</span>
            </span>
            <button
              type="button"
              className={BTN}
              aria-label={`Delete ${s.name}`}
              onClick={() => {
                if (!window.confirm(`Delete ${s.name}?`)) return;
                deleteSecret(site.id, s.name)
                  .then((r) => setSecrets(r.secrets))
                  .catch((err: unknown) => toast(errorText(err), "error"));
              }}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-[12px] border-t border-[var(--om-border-subtle)] pt-[12px]">
        <SecretForm siteId={site.id} onSaved={setSecrets} />
      </div>
    </Card>
  );
}

/** Shown next to the preview when the agent listed secrets it needs and the owner has not set them. */
export function SecretRequestCard({ siteId, requests, onSaved }: { siteId: string; requests: SecretRequest[]; onSaved: () => void }) {
  return (
    <div className="flex flex-col gap-[10px] border-b border-[var(--om-border)] bg-[var(--om-surface)] px-[14px] py-[12px]">
      <div className="flex items-center gap-[8px] text-[14px] font-medium text-[var(--om-text-1)]">
        <KeyRound size={15} aria-hidden /> The agent needs {requests.length === 1 ? "a secret" : `${requests.length} secrets`} for this site
      </div>
      <Muted>Values are encrypted, written only to the site&apos;s private env file on your computer and never shown in the chat.</Muted>
      {requests.map((r) => (
        <SecretForm key={r.name} siteId={siteId} name={r.name} why={r.why} onSaved={onSaved} />
      ))}
    </div>
  );
}
