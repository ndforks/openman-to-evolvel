"use client";

/**
 * Settings → Data controls.
 * Shared tasks (revoke), archived tasks (unarchive, delete), export your data (zip built on the server),
 * delete all tasks, delete account. "Browser sign-ins" (a row with Manage) opens the cloud browser's
 * saved sessions (`CloudBrowserSettings`, `/api/browser`).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { patchTask, removeTask } from "@/components/shell/tasks-store";
import { DeleteAccountRow, DeleteAllTasksRow } from "@/components/settings/DangerZone";
import { CloudBrowserSettings } from "@/components/modals/CloudBrowserSettings";
import { Button, DIVIDER, Pane, cn, useCopy } from "@/components/settings/ui";
import { toast } from "@/components/ui/toast";
import { useUI } from "@/lib/ui-store";

interface SharedTask {
  taskId: string;
  title: string;
  url: string;
  updatedAt: string;
}

interface ArchivedTask {
  id: string;
  title: string;
  updatedAt: string;
}

/** Titled block that shows either its rows or a one-line empty message. */
function ListBlock({ title, empty, loading, error, children }: { title: string; empty: string; loading?: boolean; error?: string | null; children?: ReactNode }) {
  return (
    <section className={cn("flex w-full flex-col border-b pb-[12px]", DIVIDER)}>
      <div className="flex items-center justify-between gap-[12px]">
        <h3 className="min-w-0 truncate text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{title}</h3>
      </div>
      {error ? (
        <p className="pb-[8px] pt-[2px] text-[14px] leading-[20px] text-[var(--om-danger)]">{error}</p>
      ) : loading ? (
        <p className="pb-[8px] pt-[2px] text-[14px] leading-[20px] text-[var(--om-text-disabled)]">Loading…</p>
      ) : (
        (children ?? <p className="pb-[8px] pt-[2px] text-[14px] leading-[20px] text-[var(--om-text-disabled)]">{empty}</p>)
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SharedRow({ entry, onRevoke }: { entry: SharedTask; onRevoke: () => Promise<void> }) {
  const [copied, copy] = useCopy();
  const [busy, setBusy] = useState(false);
  const close = useUI((s) => s.close);
  return (
    <li className="flex items-center justify-between gap-[16px]">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <Link href={`/app/task/${entry.taskId}`} onClick={close} className="truncate text-[14px] leading-[20px] text-[var(--om-text-1)] hover:underline">
          {entry.title}
        </Link>
        <div className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">Anyone with the link · {entry.url}</div>
      </div>
      <div className="flex shrink-0 items-center gap-[8px]">
        <Button className="px-[8px]" onClick={() => copy(entry.url)}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          className="px-[8px]"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onRevoke().finally(() => setBusy(false));
          }}
        >
          Revoke
        </Button>
      </div>
    </li>
  );
}

function ArchivedRow({ task, onChange }: { task: ArchivedTask; onChange: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    fn()
      .then(onChange)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setBusy(false));
  };
  return (
    <li className="flex items-center justify-between gap-[16px]">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <div className="truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{task.title}</div>
        <div className={cn("truncate text-[13px] leading-[18px]", error ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>{error ?? `Archived · last active ${formatDate(task.updatedAt)}`}</div>
      </div>
      <div className="flex shrink-0 items-center gap-[8px]">
        {confirm ? (
          <>
            <Button className="px-[8px]" onClick={() => setConfirm(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" className="px-[8px]" disabled={busy} onClick={() => run(() => removeTask(task.id))}>
              Delete task
            </Button>
          </>
        ) : (
          <>
            <Button className="px-[8px]" disabled={busy} onClick={() => run(() => patchTask(task.id, { archived: false }))}>
              Unarchive
            </Button>
            <Button className="px-[8px]" disabled={busy} onClick={() => setConfirm(true)}>
              Delete
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function useList<T>(url: string, pick: (body: Record<string, unknown>) => T[]): { items: T[] | null; error: string | null; reload: () => void } {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setItems(pick(body));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load."));
    // `pick` is a stable inline mapper per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(reload, [reload]);
  return { items, error, reload };
}

function ExportRow() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/account/export", { credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "data-export.zip";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setState("error");
    }
  };
  return (
    <div className="flex items-center gap-[16px]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">Export your data</div>
        <div className={cn("text-[14px] leading-[20px]", state === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>
          {state === "error" ? error : state === "done" ? "Download started." : "One zip with every task and its history, plus projects, knowledge and settings."}
        </div>
      </div>
      <Button disabled={state === "busy"} onClick={() => void download()}>
        {state === "busy" ? "Preparing…" : "Export"}
      </Button>
    </div>
  );
}

/** Row "Browser sign-ins" with Manage; Manage shows the saved sessions and the persist switch in place. */
function CloudBrowserRow() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">Browser sign-ins</div>
          <div className="text-[14px] leading-[20px] text-[var(--om-text-3)]">Cookies and logins the agent&apos;s browser keeps between tasks. Review or clear them.</div>
        </div>
        <Button aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Done" : "Manage"}
        </Button>
      </div>
      {open ? <CloudBrowserSettings /> : null}
    </div>
  );
}

export default function DataControlsTab() {
  const shared = useList<SharedTask>("/api/account/shares", (b) => (b.shares as SharedTask[]) ?? []);
  const archived = useList<ArchivedTask>("/api/tasks?archived=1", (b) => ((b.tasks as ArchivedTask[]) ?? []).map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt })));

  const revoke = async (taskId: string) => {
    // The server revokes the link (DELETE /api/shares/[taskId]); a link already gone counts as done.
    const res = await fetch(`/api/shares/${encodeURIComponent(taskId)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) toast("The link could not be revoked. Try again.", "error");
    else toast("Link revoked", "success");
    shared.reload();
  };

  return (
    <Pane title="Data controls">
      <div className="flex flex-col gap-[24px] pb-[16px] pt-[24px]">
      <ListBlock title="Shared tasks" empty="Nothing is shared right now." loading={shared.items === null} error={shared.error}>
        {shared.items?.length ? (
          <ul className="flex flex-col gap-[12px] pt-[6px]">
            {shared.items.map((entry) => (
              <SharedRow key={entry.taskId} entry={entry} onRevoke={() => revoke(entry.taskId)} />
            ))}
          </ul>
        ) : undefined}
      </ListBlock>
      <ListBlock title="Archived tasks" empty="The archive is empty." loading={archived.items === null} error={archived.error}>
        {archived.items?.length ? (
          <ul className="flex max-h-[260px] flex-col gap-[12px] overflow-y-auto pt-[6px] [scrollbar-width:thin]">
            {archived.items.map((task) => (
              <ArchivedRow key={task.id} task={task} onChange={archived.reload} />
            ))}
          </ul>
        ) : undefined}
      </ListBlock>
      <CloudBrowserRow />
      <ExportRow />
      <DeleteAllTasksRow onDone={archived.reload} />
      <DeleteAccountRow />
      </div>
    </Pane>
  );
}
