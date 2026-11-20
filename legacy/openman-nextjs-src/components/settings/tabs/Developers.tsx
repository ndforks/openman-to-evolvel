// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Settings → Developers.
 * API keys for this app (`/api/account/api-keys`: hashed at rest, the full key is shown once) and webhook
 * endpoints with a signing secret (`/api/account/webhooks`). The keys authenticate `/api/v1`; events are delivered
 * by `src/lib/public-api/webhooks.ts` (documented at `/docs/api`).
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FileText, Plus } from "lucide-react";
import { Button, cn, DIVIDER, Pane, TAB_LIST, tabClass, TextInput, Toggle, useCopy } from "@/components/settings/ui";
import { brand } from "@/config/brand";

type DevTab = "keys" | "webhooks";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  "task.created": "Task created",
  "task.completed": "Task finished",
  "task.failed": "Task failed",
  "task.stopped": "Task stopped",
  "task.needs_input": "Task needs input",
  "task.deleted": "Task deleted",
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DocGlyph({ width, height, strokeWidth }: { width: number; height: number; strokeWidth: number }) {
  return (
    <FileText width={width} height={height} strokeWidth={strokeWidth} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
  );
}

function PlusGlyph() {
  return (
    <Plus size={16} strokeWidth={2} aria-hidden="true" />
  );
}

/** 36px grey strip under the tabs. */
function InfoBar({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[16px] flex shrink-0 items-center gap-[8px] rounded-[12px] bg-[var(--om-fill-subtle)] px-[16px] py-[12px]">
      <DocGlyph width={16} height={16} strokeWidth={1.8} />
      <div className="min-w-0 flex-1 basis-0 truncate text-[13px] leading-[18px] text-[var(--om-text-1)]">{children}</div>
    </div>
  );
}

/** The secret shown once after creating a key or endpoint (or rolling a secret). */
function SecretOnce({ label, secret, onDone }: { label: string; secret: string; onDone: () => void }) {
  const [copied, copy] = useCopy();
  return (
    <div className="mt-[12px] flex items-center gap-[12px] rounded-[10px] border border-[var(--om-border-accent)] bg-[var(--om-fill-accent)] px-[14px] py-[10px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{label}</div>
        <code className="truncate font-mono text-[13px] leading-[18px] text-[var(--om-text-1)]">{secret}</code>
      </div>
      <Button className="px-[8px]" onClick={() => copy(secret)}>
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="ghost" className="px-[8px]" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function useResource<T>(url: string, pick: (body: Record<string, unknown>) => T[]) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    call<Record<string, unknown>>(url)
      .then((body) => {
        setItems(pick(body));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load."));
    // `pick` is an inline mapper that never changes per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(reload, [reload]);
  return { items, setItems, error, setError, reload };
}

/** Centred empty state. Its height tracks the modal (660px, or the viewport when shorter) minus the 180px above it. */
function EmptyState({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    // Fills the rest of the 90vh dialog (header 81, tabs 42, bar 58, gaps).
    <div className="mt-[16px] flex min-h-[200px] flex-col items-center justify-center gap-[12px]" style={{ height: "calc(90vh - 234px)" }}>
      <DocGlyph width={24} height={28} strokeWidth={1.5} />
      <div className="flex flex-col items-center gap-[4px] text-center">
        <p className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</p>
        <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{description}</p>
      </div>
      <div className="flex items-center gap-[8px]">{children}</div>
    </div>
  );
}

function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <PlusGlyph />
      Create new
    </Button>
  );
}

function ListHeader({ count, creating, onCreate, children }: { count: string; creating: boolean; onCreate: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-[28px] items-center justify-between gap-[16px] pt-[14px]">
      {creating ? children : <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{count}</div>}
      {creating ? null : <CreateButton onClick={onCreate} />}
    </div>
  );
}

/** Row action that asks once before doing something that cannot be undone. */
function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button className="px-[8px]" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-[8px]">
      <Button className="px-[8px]" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button variant="danger" className="px-[8px]" onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  );
}

/** Inline "name it, then create" form used for both keys and webhooks. */
function CreateForm({ label, placeholder, type = "text", submitLabel, error, busy, onSubmit, onCancel }: { label: string; placeholder: string; type?: "text" | "url"; submitLabel: string; error?: string | null; busy?: boolean; onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-[6px]">
      <div className="flex items-center gap-[8px]">
        <TextInput autoFocus type={type} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} className="h-[28px] w-[260px] rounded-[7px] px-[9px] text-[13px]" />
        <Button type="submit" variant="primary" disabled={value.trim() === "" || busy}>
          {busy ? "Creating…" : submitLabel}
        </Button>
        <Button className="px-[8px]" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? <div className="text-[12px] leading-[16px] text-[var(--om-danger)]">{error}</div> : null}
    </form>
  );
}

function ApiKeys() {
  const { items: keys, setItems: setKeys, error: loadError } = useResource<ApiKey>("/api/account/api-keys", (b) => (b.keys as ApiKey[]) ?? []);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const create = async (name: string) => {
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const { key, secret } = await call<{ key: ApiKey; secret: string }>("/api/account/api-keys", { method: "POST", body: JSON.stringify({ name }) });
      setKeys((prev) => [key, ...(prev ?? [])]);
      setFresh(secret);
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await call(`/api/account/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      setKeys((prev) => (prev ?? []).filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the key.");
    }
  };

  const form = <CreateForm label="API key name" placeholder="Key name, e.g. Production" submitLabel="Create" error={error} busy={busy} onSubmit={(v) => void create(v)} onCancel={() => setCreating(false)} />;

  return (
    <>
      <InfoBar>Keys for calling the {brand.name} REST API from your own code</InfoBar>
      {loadError ? <div className="pt-[14px] text-[13px] leading-[18px] text-[var(--om-danger)]">{loadError}</div> : null}
      {fresh ? <SecretOnce label="Copy this key now. It is stored only as a hash and will not be shown again." secret={fresh} onDone={() => setFresh(null)} /> : null}
      {keys === null ? null : keys.length === 0 ? (
        <EmptyState title="No keys" description="Create one to start tasks and read results from scripts and servers.">
          {creating ? form : <CreateButton onClick={() => setCreating(true)} />}
        </EmptyState>
      ) : (
        <>
          <ListHeader count={keys.length === 1 ? "1 API key" : `${keys.length} API keys`} creating={creating} onCreate={() => setCreating(true)}>
            {form}
          </ListHeader>
          <ul className={cn("mt-[12px] flex flex-col rounded-[12px] border bg-[var(--om-bg-sidebar)]", DIVIDER)}>
            {keys.map((key, index) => (
              <li key={key.id} className={cn("flex min-h-[54px] items-center gap-[16px] px-[14px] py-[9px]", index > 0 && "border-t", index > 0 && DIVIDER)}>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{key.name}</div>
                  <div className="truncate font-mono text-[12px] leading-[16px] text-[var(--om-text-3)]">{key.prefix}</div>
                </div>
                <div className="shrink-0 text-right text-[13px] leading-[18px] text-[var(--om-text-3)]">
                  Created {formatDate(key.createdAt)}
                  <br />
                  {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"}
                </div>
                <ConfirmButton label="Revoke" confirmLabel="Revoke key" onConfirm={() => void revoke(key.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function WebhookRow({ hook, first, onChange, onDelete, onSecret }: { hook: Webhook; first: boolean; onChange: (next: Webhook) => void; onDelete: () => void; onSecret: (secret: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await call<{ webhook: Webhook; secret?: string }>(`/api/account/webhooks/${encodeURIComponent(hook.id)}`, { method: "PATCH", body: JSON.stringify(body) });
      onChange(res.webhook);
      if (res.secret) onSecret(res.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  };
  const toggleEvent = (event: string, on: boolean) => {
    const events = on ? [...new Set([...hook.events, event])] : hook.events.filter((e) => e !== event);
    if (events.length === 0) return setError("Keep at least one event.");
    void patch({ events });
  };
  return (
    <li className={cn("flex flex-col gap-[8px] px-[14px] py-[11px]", !first && "border-t", !first && DIVIDER)}>
      <div className="flex items-center gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <div className="truncate font-mono text-[13px] leading-[18px] text-[var(--om-text-1)]">{hook.url}</div>
          <div className="text-[12px] leading-[16px] text-[var(--om-text-3)]">
            {hook.enabled ? "Active" : "Paused"} · Added {formatDate(hook.createdAt)}
          </div>
        </div>
        <Toggle checked={hook.enabled} onCheckedChange={(next) => void patch({ enabled: next })} label={`Deliver events to ${hook.url}`} />
        <Button className="px-[8px]" onClick={() => void patch({ rollSecret: true })}>
          Roll secret
        </Button>
        <ConfirmButton label="Delete" confirmLabel="Delete webhook" onConfirm={onDelete} />
      </div>
      <div className="flex flex-wrap items-center gap-[14px]">
        {Object.entries(EVENT_LABELS).map(([event, label]) => (
          <label key={event} className="flex cursor-pointer items-center gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-2)]">
            <input type="checkbox" checked={hook.events.includes(event)} onChange={(e) => toggleEvent(event, e.target.checked)} className="size-[13px] cursor-pointer accent-[var(--om-btn-accent)]" />
            {label}
          </label>
        ))}
      </div>
      {error ? <div className="text-[12px] leading-[16px] text-[var(--om-danger)]">{error}</div> : null}
    </li>
  );
}

function Webhooks() {
  const { items: hooks, setItems: setHooks, error: loadError } = useResource<Webhook>("/api/account/webhooks", (b) => (b.webhooks as Webhook[]) ?? []);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const create = async (raw: string) => {
    if (!/^https:\/\/\S+$/.test(raw)) {
      setError("Enter a full https:// URL, for example https://example.com/hooks.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { webhook, secret } = await call<{ webhook: Webhook; secret: string }>("/api/account/webhooks", { method: "POST", body: JSON.stringify({ url: raw }) });
      setHooks((prev) => [webhook, ...(prev ?? [])]);
      setFresh(secret);
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the endpoint.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await call(`/api/account/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
      setHooks((prev) => (prev ?? []).filter((h) => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const cancel = () => {
    setError(null);
    setCreating(false);
  };

  const form = <CreateForm label="Webhook URL" type="url" placeholder="https://example.com/hooks" submitLabel="Add" error={error} busy={busy} onSubmit={(v) => void create(v)} onCancel={cancel} />;

  return (
    <>
      <InfoBar>Get an HTTPS callback whenever a task changes state</InfoBar>
      {loadError ? <div className="pt-[14px] text-[13px] leading-[18px] text-[var(--om-danger)]">{loadError}</div> : null}
      {fresh ? <SecretOnce label="Signing secret: use it to verify that requests come from us. It will not be shown again." secret={fresh} onDone={() => setFresh(null)} /> : null}
      {hooks === null ? null : hooks.length === 0 ? (
        <EmptyState title="No endpoints" description={`Add a URL and ${brand.name} posts signed events to it.`}>
          {creating ? form : <CreateButton onClick={() => setCreating(true)} />}
        </EmptyState>
      ) : (
        <>
          <ListHeader count={hooks.length === 1 ? "1 webhook" : `${hooks.length} webhooks`} creating={creating} onCreate={() => setCreating(true)}>
            {form}
          </ListHeader>
          <ul className={cn("mt-[12px] flex flex-col rounded-[12px] border bg-[var(--om-bg-sidebar)]", DIVIDER)}>
            {hooks.map((hook, index) => (
              <WebhookRow
                key={hook.id}
                hook={hook}
                first={index === 0}
                onChange={(next) => setHooks((prev) => (prev ?? []).map((h) => (h.id === next.id ? next : h)))}
                onDelete={() => void remove(hook.id)}
                onSecret={setFresh}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const TABS: { id: DevTab; label: string }[] = [
  { id: "keys", label: "API keys" },
  { id: "webhooks", label: "Webhooks" },
];

export default function DevelopersTab() {
  const [tab, setTab] = useState<DevTab>("keys");
  return (
    <Pane title="Developers">
      <div role="tablist" aria-label="Developers" className={cn(TAB_LIST, "mt-[24px]")}>
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={tabClass(active)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {tab === "keys" ? <ApiKeys /> : <Webhooks />}
    </Pane>
  );
}
