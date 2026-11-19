// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Destructive account actions shared by Settings > Account and Settings > Data controls. */
import { useState, type ReactNode } from "react";
import { brand } from "@/config/brand";
import { refreshTasks } from "@/components/shell/tasks-store";
import { clearPrefs } from "./prefs";
import { Button, TextInput, cn } from "./ui";

export const DELETE_ACCOUNT_DELETES =
  `All your tasks with their messages, file lists and share links; projects and project files; knowledge; personalization and settings; automations and their run history; website records; agent email and phone records; custom connectors; API keys and webhooks; notifications; and your saved ${brand.name} sign-in.`;
export const DELETE_ACCOUNT_KEEPS =
  "Your Orgo account, its credits and plan, your Orgo computers (including the agent computer) and the files on them, and any email address or phone number held at its provider.";

function Confirm({ title, deletes, keeps, action, busyLabel, onConfirm, onCancel }: { title: string; deletes: ReactNode; keeps?: ReactNode; action: string; busyLabel: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={cn("mt-[12px] flex flex-col gap-[10px] rounded-[12px] border border-[#E5484D66] bg-[var(--om-danger-soft)] p-[14px]")}>
      <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
      <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
        <span className="font-medium text-[var(--om-text-1)]">Deleted for good: </span>
        {deletes}
      </div>
      {keeps ? (
        <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">
          <span className="font-medium text-[var(--om-text-1)]">Not touched: </span>
          {keeps}
        </div>
      ) : null}
      <label className="flex flex-col gap-[6px]">
        <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Type DELETE to confirm</span>
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-[200px]" aria-label="Type DELETE to confirm" />
      </label>
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
      <div className="flex justify-end gap-[7px]">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={typed !== "DELETE" || busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            onConfirm().catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Something went wrong.");
              setBusy(false);
            });
          }}
        >
          {busy ? busyLabel : action}
        </Button>
      </div>
    </div>
  );
}

async function destroy(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ confirm: "DELETE" }) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

function RowText({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="truncate text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{title}</div>
      <div className="text-[14px] leading-[20px] text-[var(--om-text-3)]">{description}</div>
    </div>
  );
}

export function DeleteAccountRow({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-[16px]">
        {compact ? (
          <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
            <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Delete account</div>
            <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Delete everything {brand.name} stores for you. Your Orgo account is not affected.</div>
          </div>
        ) : (
          <RowText title="Delete account" description={`Delete everything ${brand.name} stores for you. Your Orgo account is not affected.`} />
        )}
        {open ? null : (
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        )}
      </div>
      {open ? (
        <Confirm
          title={`Delete your ${brand.name} account?`}
          deletes={DELETE_ACCOUNT_DELETES}
          keeps={DELETE_ACCOUNT_KEEPS}
          action="Delete account"
          busyLabel="Deleting…"
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            await destroy("/api/account");
            clearPrefs();
            // A full page load on purpose: it drops every in-memory store.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/");
          }}
        />
      ) : null}
    </div>
  );
}

export function DeleteAllTasksRow({ className, onDone }: { className?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-[16px]">
        <RowText title="Delete all tasks" description={done ?? "Stop and delete every task, archived ones included."} />
        {open ? null : (
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete all
          </Button>
        )}
      </div>
      {open ? (
        <Confirm
          title="Delete all tasks?"
          deletes="Every task, archived ones included, with its messages, list of files and share link. Running tasks are stopped first."
          keeps="Projects, knowledge, settings, automations, and files the agent saved on your Orgo computer."
          action="Delete all tasks"
          busyLabel="Deleting…"
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            const body = await destroy("/api/account/tasks");
            const n = typeof body.deleted === "number" ? body.deleted : 0;
            setDone(`Deleted ${n} task${n === 1 ? "" : "s"}.`);
            setOpen(false);
            void refreshTasks();
            onDone?.();
          }}
        />
      ) : null}
    </div>
  );
}
