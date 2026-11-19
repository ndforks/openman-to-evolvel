// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Manage: one card per automation with pause/resume, test run, edit, locate task and delete. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy, Edit3, ExternalLink, MoreHorizontal, Pause, Play, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brand } from "@/config/brand";
import type { AutomationView } from "@/lib/automations/types";
import { cx } from "../cx";
import { taskHref } from "../routes";
import { MENU_SURFACE } from "../ui";
import { automationsApi } from "./api";
import { StartIcon } from "./icons";
import { StatusIcon } from "./UpdatesTab";

const KIND_LABEL = { schedule: "Schedule", trigger: "Triggered task", advanced: "Advanced automation" } as const;
const ITEM = "flex h-[34px] cursor-pointer select-none items-center gap-[10px] rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)] data-[disabled]:cursor-default data-[disabled]:opacity-40";

function nextLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return `Next run ${sameDay ? "today" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Card({ a, reload, onError }: { a: AutomationView; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    onError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };
  const webhook = a.triggers.find((t) => t.type === "webhook");
  const status = !a.enabled ? (a.pausedReason && a.pausedReason !== "Paused by you." ? "Paused after failures" : "Paused") : a.nextRunAt || a.triggers.some((t) => t.type !== "timer") ? "Active" : "Ended";

  return (
    <div className={cx("flex flex-col gap-[10px] rounded-[14px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] px-[16px] py-[14px]", !a.enabled && "opacity-80")}>
      <div className="flex items-center gap-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
        <StartIcon start={a.kind} size={14} />
        <span>{KIND_LABEL[a.kind]}</span>
        <span>·</span>
        <span className={cx(status === "Active" ? "text-[var(--om-success,#25BA3B)]" : status.startsWith("Paused after") ? "text-[var(--om-danger)]" : "")}>{status}</span>
        <span className="flex-1" />
        {busy ? <span className="text-[12px]">{busy}…</span> : null}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label={`More actions for ${a.name}`} className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]">
            <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={8} className={cx(MENU_SURFACE, "w-[200px]")}>
            {a.enabled ? (
              <DropdownMenu.Item className={ITEM} onSelect={() => void act("Pausing", () => automationsApi.pause(a.id))}>
                <Pause size={15} strokeWidth={1.8} aria-hidden /> Pause
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item className={ITEM} onSelect={() => void act("Resuming", () => automationsApi.resume(a.id))}>
                <Play size={15} strokeWidth={1.8} aria-hidden /> Resume
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className={ITEM} onSelect={() => void act("Starting test run", () => automationsApi.test(a.id))}>
              <Zap size={15} strokeWidth={1.8} aria-hidden /> Test run
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} onSelect={() => router.push(`/app/automations/${a.id}/edit`)}>
              <Edit3 size={15} strokeWidth={1.8} aria-hidden /> Edit
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ITEM} disabled={!(a.taskId ?? a.sourceTaskId)} onSelect={() => router.push(taskHref((a.taskId ?? a.sourceTaskId)!))}>
              <ExternalLink size={15} strokeWidth={1.8} aria-hidden /> Locate task
            </DropdownMenu.Item>
            {webhook?.type === "webhook" && webhook.url ? (
              <DropdownMenu.Item className={ITEM} onSelect={() => void navigator.clipboard?.writeText(webhook.url)}>
                <Copy size={15} strokeWidth={1.8} aria-hidden /> Copy webhook URL
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Separator className="my-[4px] h-px bg-[var(--om-border)]" />
            <DropdownMenu.Item className={cx(ITEM, "text-[var(--om-danger)]")} onSelect={() => setConfirm(true)}>
              <Trash2 size={15} strokeWidth={1.8} aria-hidden /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      <div className="flex flex-col gap-[4px]">
        <span className="text-[15px] font-medium leading-[22px] text-[var(--om-text-1)]">{a.name}</span>
        <span className="line-clamp-2 text-[13px] leading-[19px] text-[var(--om-text-2)]">{a.prompt}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
        <span>{a.describe}</span>
        {a.enabled && nextLabel(a.nextRunAt) ? <span>{nextLabel(a.nextRunAt)}</span> : null}
        {a.lastRun ? (
          <span className="flex items-center gap-[4px]">
            <StatusIcon status={a.lastRun.status} size={13} /> Last run {new Date(a.lastRun.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        ) : null}
        <span>{(brand.modes as Record<string, { label: string }>)[a.mode]?.label ?? a.mode}</span>
        <span>{a.runIn === "same" ? "Same task" : "Separate task"}</span>
      </div>
      {!a.enabled && a.pausedReason && a.pausedReason !== "Paused by you." ? <p className="rounded-[8px] bg-[var(--om-fill)] px-[10px] py-[6px] text-[13px] leading-[18px] text-[var(--om-danger)]">{a.pausedReason} Fix it, then use Test run and Resume.</p> : null}
      {confirm ? (
        <div className="flex items-center gap-[8px] rounded-[10px] border border-[var(--om-border)] px-[12px] py-[8px] text-[13px]">
          <span className="flex-1">Delete this automation and its run history?</span>
          <button type="button" onClick={() => setConfirm(false)} className="h-[28px] cursor-pointer rounded-[8px] px-[10px] hover:bg-[var(--om-fill)]">
            Cancel
          </button>
          <button type="button" onClick={() => void act("Deleting", () => automationsApi.remove(a.id))} className="h-[28px] cursor-pointer rounded-[8px] bg-[var(--om-danger)] px-[10px] font-medium text-white hover:opacity-90">
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ManageTab({ automations, reload }: { automations: AutomationView[]; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-[10px]">
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--om-danger)]">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-[10px] lg:grid-cols-2">
        {automations.map((a) => (
          <Card key={a.id} a={a} reload={reload} onError={setError} />
        ))}
      </div>
    </div>
  );
}
