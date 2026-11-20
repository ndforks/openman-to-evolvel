// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Custom domains through Orgo (the user's plan decides how many). Renders nothing at all when Orgo says this user cannot
 * add domains here, so no disabled control is ever shown.
 */
import { Globe, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { addDomain, getDomains, removeDomain, verifyDomain } from "@/lib/websites/client";
import type { DomainsState, Website } from "@/lib/websites/types";
import { CopyField } from "./PublishPanel";
import { BTN, BTN_PRIMARY, Card, INPUT, Muted, errorText } from "./site-ui";

const STATUS: Record<string, string> = { active: "Active", verifying: "Waiting for DNS", pending: "Waiting for DNS", disabled: "Turned off by Orgo" };

export function SiteDomains({ site, onAvailable }: { site: Website; onAvailable?: (available: boolean) => void }) {
  const [state, setState] = useState<DomainsState | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getDomains(site.id)
      .then((s) => {
        setState(s);
        onAvailable?.(s.available || s.domains.length > 0);
      })
      .catch(() => {
        setState(null);
        onAvailable?.(false);
      });
  }, [site.id, onAvailable]);
  useEffect(load, [load]);

  if (!state || (!state.available && !state.domains.length)) return null;

  return (
    <Card
      title="Custom domains"
      actions={
        <button type="button" className={BTN} aria-label="Refresh" onClick={load}>
          <RotateCw size={14} aria-hidden />
        </button>
      }
    >
      <Muted>
        Serve the published site at your own domain, with HTTPS from Orgo. Your plan includes {state.limit === -1 ? "unlimited domains" : `${state.limit} domain${state.limit === 1 ? "" : "s"}`} ({state.used} in use).
      </Muted>
      <div className="mt-[12px] flex flex-col gap-[12px]">
        {state.domains.map((d) => (
          <div key={d.id} className="flex flex-col gap-[8px] rounded-[10px] border border-[var(--om-border)] p-[12px]">
            <div className="flex items-center gap-[8px]">
              <Globe size={15} aria-hidden className="text-[var(--om-icon-3)]" />
              <span className="font-medium text-[var(--om-text-1)]">{d.domain}</span>
              <span className="text-[12px] text-[var(--om-text-3)]">
                {STATUS[d.status] ?? d.status}
                {d.status === "active" && d.certStatus ? ` · certificate ${d.certStatus}` : ""}
              </span>
              <span className="flex-1" />
              {d.status !== "active" ? (
                <button
                  type="button"
                  className={BTN}
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(d.id);
                    verifyDomain(site.id, d.id)
                      .then((r) => {
                        toast(r.status === "active" ? "Domain is active." : r.message || "DNS is not there yet.", r.status === "active" ? "success" : "error");
                        load();
                      })
                      .catch((err: unknown) => toast(errorText(err), "error"))
                      .finally(() => setBusy(null));
                  }}
                >
                  Check status
                </button>
              ) : null}
              <button
                type="button"
                className={BTN}
                aria-label={`Remove ${d.domain}`}
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(`Remove ${d.domain}?`)) return;
                  setBusy(d.id);
                  removeDomain(site.id, d.id)
                    .then(load)
                    .catch((err: unknown) => toast(errorText(err), "error"))
                    .finally(() => setBusy(null));
                }}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
            {d.status !== "active" && d.records.length ? (
              <div className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[var(--om-text-3)]">Add these records at your DNS provider, then check the status:</span>
                {d.records.map((r) => (
                  <div key={`${r.type}${r.name}`} className="grid grid-cols-[60px_minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-[8px] text-[12px]">
                    <span className="font-mono text-[var(--om-text-2)]">{r.type}</span>
                    <CopyField value={r.host || r.name} />
                    <CopyField value={r.value} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {state.available && (state.limit === -1 || state.used < state.limit) ? (
          site.status === "published" ? (
            <form
              className="flex gap-[8px]"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy("add");
                addDomain(site.id, domain)
                  .then(() => {
                    setDomain("");
                    load();
                  })
                  .catch((err: unknown) => toast(errorText(err), "error"))
                  .finally(() => setBusy(null));
              }}
            >
              <input className={`${INPUT} flex-1`} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.example.com" aria-label="Domain" />
              <button type="submit" className={BTN_PRIMARY} disabled={busy !== null || domain.trim().length < 4}>
                Add domain
              </button>
            </form>
          ) : (
            <Muted>Publish the site first, then add a domain.</Muted>
          )
        ) : null}
      </div>
    </Card>
  );
}
