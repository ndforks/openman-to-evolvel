"use client";

/**
 * The list of real cloud computers with live status and the actions on them: watch the screen, restart, delete.
 * Used by the Computers page and by Settings > Computers (`density="compact"`).
 * Restart and delete ask first. The computer that runs the agent is listed with both actions disabled.
 */
import "@/components/task/task-view.css";
import { Monitor } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { VncViewer } from "@/components/computer/vnc-viewer";
import { ModalShell } from "@/components/modals/ModalShell";
import type { ComputerView } from "@/lib/agent/types";
import type { CloudComputer, CloudComputerStatus } from "@/lib/orgo/types";
import { cx } from "../cx";
import { describeComputer, useComputersStore, type ComputerAction } from "./useComputers";

const AGENT_NOTE = "Runs the agent for every task, so it can't be restarted or deleted here.";

/* ---------- small pieces ---------- */

/** Computer glyph at the start of each row. */
export function MonitorArt() {
  return (
    <span aria-hidden="true" className="flex h-[28px] w-[32px] shrink-0 items-center justify-center rounded-[7px] bg-[var(--om-fill-accent)] text-[var(--om-icon-accent)]">
      <Monitor size={17} strokeWidth={1.8} />
    </span>
  );
}

function Spinner({ size = 12 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size }} className="shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />;
}

const STATUS_COLOR: Record<CloudComputerStatus, string> = {
  running: "var(--om-success)",
  starting: "var(--om-warning)",
  restarting: "var(--om-warning)",
  updating: "var(--om-warning)",
  waking: "var(--om-warning)",
  sleeping: "var(--om-text-disabled)",
  stopped: "var(--om-text-disabled)",
  deleted: "var(--om-text-disabled)",
  error: "var(--om-danger)",
};

const CHANGING: readonly CloudComputerStatus[] = ["starting", "restarting", "updating", "waking"];

/** Coloured dot and Orgo's status in plain words; a spinner while something is in flight. */
function StatusPill({ computer, action, compact }: { computer: CloudComputer; action?: ComputerAction; compact: boolean }) {
  const label = action === "restart" ? "Restarting" : action === "delete" ? "Deleting" : computer.statusLabel;
  const changing = !!action || CHANGING.includes(computer.status);
  const color = action ? "var(--om-warning)" : STATUS_COLOR[computer.status];
  return (
    <span role="status" title={`Orgo status: ${computer.rawStatus}`} className={cx("flex shrink-0 items-center gap-[6px] whitespace-nowrap text-[var(--om-text-2)]", compact ? "text-[13px] leading-[18px]" : "text-[13px] leading-[18px]")}>
      {changing ? (
        <span style={{ color }} className="flex">
          <Spinner size={compact ? 10 : 11} />
        </span>
      ) : (
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
    </span>
  );
}

function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--om-fill)] px-[6px] text-[12px] leading-[16px] text-[var(--om-text-2)]">
      {children}
    </span>
  );
}

function RowButton({ children, danger, compact, ...rest }: { children: ReactNode; danger?: boolean; compact: boolean; onClick: () => void; disabled?: boolean; title?: string; "aria-label": string }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-border-strong)] font-medium outline-none transition-colors focus-visible:border-[var(--om-border-focus)] disabled:cursor-not-allowed disabled:opacity-40",
        compact ? "h-[26px] px-[8px] text-[13px] leading-[18px]" : "h-[29px] px-[10px] text-[13px] leading-[18px]",
        danger ? "text-[var(--om-danger)] enabled:hover:bg-[var(--om-danger-soft)]" : "text-[var(--om-text-1)] enabled:hover:bg-[var(--om-fill-subtle)]",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- dialogs ---------- */

const DIALOG = "flex w-[440px] max-w-[calc(100vw-32px)] flex-col rounded-[20px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

function ConfirmDialog({ computer, action, onCancel, onConfirm }: { computer: CloudComputer; action: ComputerAction; onCancel: () => void; onConfirm: () => void }) {
  const deleting = action === "delete";
  return (
    <ModalShell title={deleting ? `Delete ${computer.name}?` : `Restart ${computer.name}?`} onClose={onCancel} closeButton={false} className={DIALOG}>
      <div className="text-[18px] font-semibold leading-[26px] tracking-[-0.01em] text-[var(--om-text-1)]">{deleting ? `Delete ${computer.name}?` : `Restart ${computer.name}?`}</div>
      <p className="pt-[8px] text-[14px] leading-[20px] text-[var(--om-text-2)]">
        {deleting
          ? "This deletes the computer on Orgo with everything on it: files, installed software and settings. It can't be undone."
          : "The computer reboots in place. Its files are kept; anything running on it stops and open sessions disconnect."}
      </p>
      <p className="pt-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{describeComputer(computer)}</p>
      <div className="flex justify-end gap-[9px] pt-[22px]">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-[36px] cursor-pointer items-center rounded-[10px] border border-[var(--om-border-strong)] px-[14px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cx(
            "flex h-[36px] cursor-pointer items-center rounded-[10px] px-[14px] text-[14px] font-medium leading-[20px] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
            deleting ? "bg-[var(--om-danger)] text-white" : "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]",
          )}
        >
          {deleting ? "Delete computer" : "Restart"}
        </button>
      </div>
    </ModalShell>
  );
}

/** The computer's live screen through noVNC, from `GET /api/computers/[id]/view`. */
function ScreenDialog({ computer, onClose }: { computer: CloudComputer; onClose: () => void }) {
  const [view, setView] = useState<ComputerView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/computers/${computer.id}/view`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (ComputerView & { error?: string }) | null;
        if (!alive) return;
        if (!res.ok || !data) setFailure(data?.error ?? `The screen could not be opened (the server answered ${res.status}).`);
        else if (!data.vncUrl) setFailure("This computer isn't running, so there is no screen to show.");
        else setView(data);
      })
      .catch(() => {
        if (alive) setFailure("The request could not be sent. Check your connection and try again.");
      });
    return () => {
      alive = false;
    };
  }, [computer.id]);

  return (
    <ModalShell
      title={`${computer.name}: screen`}
      onClose={onClose}
      closeClassName="right-[16px] top-[14px]"
      className="flex w-[1040px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[18px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-[10px] pl-[18px] pr-[52px]">
        <span className="truncate text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{computer.name}</span>
        <Badge title={view?.viewOnly ? "Mouse and keyboard are not sent to this computer." : undefined}>{view ? (view.viewOnly ? "View only" : "Live: click to control") : "Connecting"}</Badge>
      </div>
      <div className="relative w-full bg-black" style={{ aspectRatio: view ? `${view.width} / ${view.height}` : "16 / 9", maxHeight: "calc(100vh - 140px)" }}>
        {view?.vncUrl ? (
          <VncViewer url={view.vncUrl} interactive={!view.viewOnly} className="absolute inset-0" />
        ) : (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-[8px] px-[24px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">
            {failure ?? (
              <>
                <Spinner /> Opening the screen...
              </>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- the list ---------- */

export function CloudComputerList({ computers, density = "regular", className }: { computers: CloudComputer[]; density?: "regular" | "compact"; className?: string }) {
  const busy = useComputersStore((s) => s.busy);
  const restart = useComputersStore((s) => s.restart);
  const remove = useComputersStore((s) => s.remove);
  const [confirm, setConfirm] = useState<{ id: string; action: ComputerAction } | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const compact = density === "compact";

  const asked = confirm ? computers.find((c) => c.id === confirm.id) : undefined;
  const watched = watching ? computers.find((c) => c.id === watching) : undefined;

  const run = async (id: string, action: ComputerAction) => {
    setConfirm(null);
    setFailures(({ [id]: _cleared, ...rest }) => {
      void _cleared;
      return rest;
    });
    const failure = await (action === "delete" ? remove(id) : restart(id));
    if (failure) setFailures((current) => ({ ...current, [id]: failure }));
  };

  return (
    <>
      <ul className={cx("flex flex-col overflow-hidden border", compact ? "rounded-[12px] border-[var(--om-fill-strong)] bg-[var(--om-card)]" : "rounded-[14px] border-[var(--om-border)] bg-[#222222]", className)}>
        {computers.map((computer, index) => {
          const action = busy[computer.id];
          const failure = failures[computer.id];
          const locked = computer.protected;
          const lockedTitle = locked ? AGENT_NOTE : undefined;
          return (
            <li key={computer.id} className={cx("flex flex-col", index > 0 && "border-t", index > 0 && (compact ? "border-[var(--om-fill-strong)]" : "border-[var(--om-border)]"))}>
              <div className={cx("flex items-center", compact ? "min-h-[58px] gap-[13px] px-[14px] py-[9px]" : "min-h-[68px] gap-[14px] px-[16px] py-[12px]")}>
                <MonitorArt />
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <div className="flex min-w-0 items-center gap-[7px]">
                    <Link href={`/app/computers/${computer.id}`} className={cx("truncate font-medium text-[var(--om-text-1)] hover:underline", compact ? "text-[14px] leading-[20px]" : "text-[15px] leading-[22px]")}>
                      {computer.name}
                    </Link>
                    {locked ? <Badge title={AGENT_NOTE}>Agent</Badge> : null}
                    {computer.temporary ? <Badge title={computer.endsAt ? `Orgo deletes it on ${new Date(computer.endsAt).toLocaleString()}.` : undefined}>Temporary</Badge> : null}
                  </div>
                  <div className={cx("truncate text-[var(--om-text-3)]", compact ? "text-[13px] leading-[18px]" : "text-[13px] leading-[18px]")}>{describeComputer(computer)}</div>
                  {locked ? <div className={cx("text-[var(--om-text-3)]", compact ? "text-[12px] leading-[16px]" : "text-[13px] leading-[18px]")}>{AGENT_NOTE}</div> : null}
                </div>
                <StatusPill computer={computer} action={action} compact={compact} />
                <div className="flex shrink-0 items-center gap-[6px]">
                  <Link
                    href={`/app/computers/${computer.id}`}
                    aria-label={`Open ${computer.name}: terminal, monitoring, backups`}
                    className={cx(
                      "flex shrink-0 items-center justify-center rounded-[8px] border border-[var(--om-border-strong)] font-medium text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]",
                      compact ? "h-[26px] px-[8px] text-[13px] leading-[18px]" : "h-[29px] px-[10px] text-[13px] leading-[18px]",
                    )}
                  >
                    Open
                  </Link>
                  <RowButton compact={compact} aria-label={`View the screen of ${computer.name}`} disabled={computer.status !== "running" || !!action} onClick={() => setWatching(computer.id)}>
                    View
                  </RowButton>
                  <RowButton compact={compact} aria-label={`Restart ${computer.name}`} title={lockedTitle} disabled={locked || !!action || computer.status !== "running"} onClick={() => setConfirm({ id: computer.id, action: "restart" })}>
                    Restart
                  </RowButton>
                  <RowButton compact={compact} danger aria-label={`Delete ${computer.name}`} title={lockedTitle} disabled={locked || !!action} onClick={() => setConfirm({ id: computer.id, action: "delete" })}>
                    Delete
                  </RowButton>
                </div>
              </div>
              {failure ? (
                <p role="alert" className={cx("pb-[10px] text-[13px] leading-[18px] text-[var(--om-danger)]", compact ? "px-[14px]" : "px-[16px]")}>
                  {failure}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {asked && confirm ? <ConfirmDialog computer={asked} action={confirm.action} onCancel={() => setConfirm(null)} onConfirm={() => void run(asked.id, confirm.action)} /> : null}
      {watched ? <ScreenDialog computer={watched} onClose={() => setWatching(null)} /> : null}
    </>
  );
}
