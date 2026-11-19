"use client";

/**
 * The task behaviours beyond one conversation: reference chips, the editable plan card, dividers (branched from,
 * inherited, mode switch), the context-compaction row, "continue in a new task", parallel tasks, collaborators,
 * side chats, the file viewer and Chat mode's "Switch to Agent".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CircleDashed, GitBranch, Layers, ListTree, Loader2, MessageCircle, Plus, Users, X } from "lucide-react";
import { brand } from "@/config/brand";
import { TaskFileViewer } from "@/components/artifacts";
import { taskHref } from "@/components/shell/task-list";
import { refreshTasks } from "@/components/shell/tasks-store";
import { cn } from "@/components/ui/cn";
import { ArrowUpIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { branchTask, continueTask, createSideChat, inviteMember, listChildren, listMembers, listSideChats, removeMember, switchToAgent, type ChildTask, type TaskMemberInfo } from "@/lib/agent/client";
import type { TaskReference, TaskStatus, TaskSummary } from "@/lib/agent/types";
import { Conversation } from "./conversation";
import { Markdown } from "./markdown";
import type { Marker, NoticeBlock, TaskFile } from "./reducer";
import { isBusy } from "./reducer";
import { TASK_REFRESH_EVENT, useTask } from "./use-task";

const errorText = (err: unknown, fallback: string) => {
  const m = err instanceof Error ? /^\d{3}\s+([\s\S]*)$/.exec(err.message) : null;
  if (m) {
    try {
      const body = JSON.parse(m[1]) as { error?: string };
      if (body.error) return body.error;
    } catch {
      return m[1].slice(0, 200) || fallback;
    }
  }
  return err instanceof Error && err.message ? err.message : fallback;
};

const SMALL_BUTTON =
  "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--om-border)] px-3 text-[13px] font-medium text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill-subtle)] disabled:cursor-default disabled:opacity-60";
const BLACK_BUTTON = "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] bg-[var(--om-btn-primary)] px-3 text-[13px] font-medium text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90 disabled:cursor-default disabled:opacity-60";
const CARD = "rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)]";
const ACTIVE: readonly TaskStatus[] = ["waking", "running", "waiting"];

/* ---------------------------------------------------------------- references */

export const MAX_REFS = 20;

/** References picked in a composer, newest last, at most 20. */
export function useReferences() {
  const [refs, setRefs] = useState<TaskReference[]>([]);
  const add = useCallback((ref: TaskReference) => setRefs((cur) => [...cur.filter((r) => r.id !== ref.id), ref].slice(-MAX_REFS)), []);
  const remove = useCallback((id: string) => setRefs((cur) => cur.filter((r) => r.id !== id)), []);
  const clear = useCallback(() => setRefs([]), []);
  return { refs, add, remove, clear };
}

export function ReferenceChips({ refs, onRemove, className }: { refs: TaskReference[]; onRemove?: (id: string) => void; className?: string }) {
  if (!refs.length) return null;
  return (
    <ul aria-label="Referenced tasks" className={cn("flex flex-wrap gap-[6px]", className)}>
      {refs.map((r) => (
        <li key={r.id} data-ref-chip={r.id} className="flex h-[26px] max-w-[240px] items-center gap-[5px] rounded-[8px] bg-[var(--om-fill)] pe-[4px] ps-[7px] text-[12.5px] leading-[18px] text-[var(--om-text-1)]">
          <ListTree size={13} className="shrink-0 text-[var(--om-icon-2)]" aria-hidden="true" />
          {onRemove ? (
            <span className="truncate">{r.title || "Task"}</span>
          ) : (
            <Link href={taskHref(r.id)} className="truncate hover:underline">
              {r.title || "Task"}
            </Link>
          )}
          {onRemove ? (
            <button type="button" aria-label={`Remove ${r.title}`} onClick={() => onRemove(r.id)} className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-[var(--om-icon-3)] hover:bg-[var(--om-fill-strong)]">
              <X size={11} aria-hidden="true" />
            </button>
          ) : (
            <span className="w-[3px]" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** A pill in a composer saying the next task runs in Chat or Plan mode, with a way out. */
export function InteractionChip({ interaction, onClear }: { interaction: "chat" | "plan"; onClear: () => void }) {
  return (
    <span data-interaction-chip={interaction} className="flex h-[30px] shrink-0 items-center gap-[5px] rounded-full bg-[var(--om-fill-accent)] pe-[5px] ps-[10px] text-[13px] font-medium leading-5 text-[var(--om-text-accent)]">
      {interaction === "chat" ? <MessageCircle size={14} aria-hidden="true" /> : <Layers size={14} aria-hidden="true" />}
      {interaction === "chat" ? "Chat" : "Plan"}
      <button type="button" aria-label={`Leave ${interaction === "chat" ? "Chat" : "Plan"} mode`} onClick={onClear} className="flex size-[20px] cursor-pointer items-center justify-center rounded-full hover:bg-[var(--om-fill-strong)]">
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

/* ---------------------------------------------------------------- plan card */

const PLAN_BLOCK = /```plan[^\S\n]*\n([\s\S]*?)(?:```|$)/;

/** Splits a reply into the text around its ```plan block and the plan itself. */
export function splitPlan(text: string): { before: string; plan: string; after: string } | null {
  const m = PLAN_BLOCK.exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index).trim(), plan: m[1].trim(), after: text.slice(m.index + m[0].length).trim() };
}

/** The editable plan Plan mode returns. Nothing runs until Confirm. */
export function PlanCard({ plan, active, onConfirm }: { plan: string; active: boolean; onConfirm: (plan: string) => Promise<void> }) {
  const [text, setText] = useState(plan);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"open" | "sending" | "confirmed" | "dismissed">("open");
  const [error, setError] = useState<string | null>(null);
  // Until the user edits it, the card shows the plan as the agent wrote it.
  const shown = editing ? text : plan;
  const open = active && (state === "open" || state === "sending");
  return (
    <section aria-label="Plan" data-plan-card className={cn(CARD, "flex flex-col overflow-hidden")}>
      <div className="flex items-center gap-2 border-b border-[var(--om-border)] px-[14px] py-[10px]">
        <Layers size={16} className="text-[var(--om-icon-2)]" aria-hidden="true" />
        <span className="flex-1 text-[14px] font-medium text-[var(--om-text-1)]">Plan</span>
        {state === "confirmed" ? <span className="text-[12.5px] text-[var(--om-success)]">Confirmed</span> : state === "dismissed" ? <span className="text-[12.5px] text-[var(--om-text-3)]">Dismissed</span> : open ? <span className="text-[12.5px] text-[var(--om-text-3)]">Waiting for your go-ahead</span> : null}
        {open && !editing ? (
          <button type="button" onClick={() => { setText(plan); setEditing(true); }} className="cursor-pointer rounded-[6px] px-2 py-[2px] text-[12.5px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]">
            Edit
          </button>
        ) : null}
      </div>
      {editing && open ? (
        <textarea aria-label="Edit the plan" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(22, Math.max(8, text.split("\n").length + 1))} className="tv-scroll w-full resize-y bg-transparent px-[14px] py-[10px] font-mono text-[13px] leading-[20px] text-[var(--om-text-1)] outline-none" />
      ) : (
        <div className="px-[14px] py-[6px]">
          <Markdown text={shown} />
        </div>
      )}
      {open ? (
        <div className="flex items-center gap-2 border-t border-[var(--om-border)] px-[14px] py-[10px]">
          <button
            type="button"
            disabled={state === "sending" || !shown.trim()}
            onClick={() => {
              setState("sending");
              setError(null);
              onConfirm(shown.trim())
                .then(() => setState("confirmed"))
                .catch((err) => {
                  setError(errorText(err, "The plan could not be confirmed."));
                  setState("open");
                });
            }}
            className={BLACK_BUTTON}
          >
            {state === "sending" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} aria-hidden="true" />}
            Confirm
          </button>
          <button type="button" onClick={() => setState("dismissed")} className={SMALL_BUTTON}>
            Dismiss
          </button>
          {error ? <span className="text-[12.5px] text-[var(--om-danger)]">{error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- dividers and notices */

export function MarkerRow({ marker }: { marker: Marker }) {
  const label =
    marker.kind === "branched" ? "Branched from" : marker.kind === "inherited" ? "Carried over from" : marker.interaction === "agent" ? "Now running as an agent" : marker.interaction === "plan" ? "Plan mode: drafting before doing" : "Chat mode";
  return (
    <div data-marker={marker.kind} className="tv-fade-in my-5 flex items-center gap-3 text-[12.5px] leading-[18px] text-[var(--om-text-3)]" role="separator">
      <span className="h-px flex-1 bg-[var(--om-border)]" />
      <span className="flex min-w-0 items-center gap-[6px]">
        {marker.kind === "interaction" ? <Layers size={13} aria-hidden="true" /> : <GitBranch size={13} aria-hidden="true" />}
        <span className="shrink-0">{label}</span>
        {marker.fromTaskId ? (
          <Link href={taskHref(marker.fromTaskId)} className="min-w-0 truncate text-[var(--om-text-2)] hover:underline">
            {marker.fromTitle}
          </Link>
        ) : null}
      </span>
      <span className="h-px flex-1 bg-[var(--om-border)]" />
    </div>
  );
}

export function NoticeRow({ block }: { block: NoticeBlock }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-notice={block.notice} className="flex flex-col">
      <button type="button" disabled={!block.detail} onClick={() => setOpen((v) => !v)} className="flex h-7 cursor-pointer items-center gap-[6px] self-start rounded-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)] disabled:cursor-default">
        <Layers size={14} aria-hidden="true" />
        Older context was summarised to fit the model
        {block.detail ? open ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} /> : null}
      </button>
      {open && block.detail ? <p className="ms-5 whitespace-pre-wrap rounded-[8px] bg-[var(--om-fill-subtle)] p-[10px] text-[12.5px] leading-[19px] text-[var(--om-text-2)]">{block.detail}</p> : null}
    </div>
  );
}

/** Under a reply: start a new task that keeps everything up to here. */
export function BranchButton({ taskId, uptoSeq, className }: { taskId: string; uptoSeq?: number; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Tooltip label="Fork into a new task from this point">
      <button
        type="button"
        aria-label="Branch from this reply"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          branchTask(taskId, uptoSeq)
            .then(({ task }) => {
              void refreshTasks();
              router.push(taskHref(task.id));
            })
            .catch((err) => toast(errorText(err, "Could not branch this task."), "error"))
            .finally(() => setBusy(false));
        }}
        className={cn("flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-3)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]", className)}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <GitBranch size={15} strokeWidth={1.7} aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}

/** For a task that grew long: carry a summary and the files into a fresh task. */
export function LongTaskCard({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div data-long-task className={cn(CARD, "flex flex-wrap items-center gap-3 px-[14px] py-[12px]")}>
      <Layers size={18} className="shrink-0 text-[var(--om-icon-2)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-[var(--om-text-1)]">Long conversation</p>
        <p className="text-[12.5px] leading-[18px] text-[var(--om-text-3)]">Earlier turns were summarised. A fresh task starts with that summary and every file, and stays quicker.</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          continueTask(taskId)
            .then(({ task }) => {
              void refreshTasks();
              router.push(taskHref(task.id));
            })
            .catch((err) => toast(errorText(err, "Could not continue in a new task."), "error"))
            .finally(() => setBusy(false));
        }}
        className={BLACK_BUTTON}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        Start a fresh task
      </button>
    </div>
  );
}

/** Chat mode: the one-way switch to the full agent, continuing the same conversation. */
export function SwitchToAgentBar({ taskId, busy }: { taskId: string; busy: boolean }) {
  const [sending, setSending] = useState(false);
  return (
    <div data-chat-bar className="mb-2 flex items-center gap-2 rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)] px-3 py-2 text-[13px] text-[var(--om-text-2)]">
      <MessageCircle size={15} className="shrink-0 text-[var(--om-icon-2)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">Chat mode: talk, search the web and read files. No desktop.</span>
      <button
        type="button"
        disabled={sending || busy}
        onClick={() => {
          setSending(true);
          switchToAgent(taskId)
            .then(() => window.dispatchEvent(new CustomEvent(TASK_REFRESH_EVENT, { detail: taskId })))
            .catch((err) => toast(errorText(err, "Could not switch to Agent."), "error"))
            .finally(() => setSending(false));
        }}
        className={BLACK_BUTTON}
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : null}
        Switch to Agent
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- parallel tasks */

const statusIcon = (s: TaskStatus) =>
  ACTIVE.includes(s) ? <Loader2 size={14} className="shrink-0 animate-spin text-[var(--om-icon-2)]" /> : s === "completed" ? <Check size={14} className="shrink-0 text-[var(--om-success)]" /> : s === "error" ? <X size={14} className="shrink-0 text-[var(--om-danger)]" /> : <CircleDashed size={14} className="shrink-0 text-[var(--om-icon-3)]" />;

/** The parallel tasks this task started, with their progress and results. Renders nothing when there are none. */
export function ParallelTasksCard({ taskId, live }: { taskId: string; live: boolean }) {
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [open, setOpen] = useState(true);
  const anyActive = tasks.some((t) => ACTIVE.includes(t.status));
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listChildren(taskId)
        .then((r) => {
          if (!cancelled) setTasks(r.tasks);
        })
        .catch(() => undefined);
    void load();
    if (!live && !anyActive) return () => void (cancelled = true);
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId, live, anyActive]);
  if (!tasks.length) return null;
  const done = tasks.filter((t) => !ACTIVE.includes(t.status)).length;
  return (
    <section aria-label="Parallel tasks" data-parallel-tasks className={cn(CARD, "flex flex-col")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center gap-2 px-[14px] py-[10px] text-start">
        <ListTree size={16} className="text-[var(--om-icon-2)]" aria-hidden="true" />
        <span className="flex-1 text-[14px] font-medium text-[var(--om-text-1)]">Parallel tasks</span>
        <span className="text-[12.5px] tabular-nums text-[var(--om-text-3)]">
          {done} / {tasks.length} done
        </span>
        {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
      </button>
      {open ? (
        <ul className="flex flex-col border-t border-[var(--om-border)] py-1">
          {tasks.map((t) => (
            <li key={t.id} data-child-task={t.id}>
              <Link href={taskHref(t.id)} className="flex items-start gap-2 px-[14px] py-[7px] hover:bg-[var(--om-fill-subtle)]">
                <span className="mt-[3px]">{statusIcon(t.status)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-[var(--om-text-1)]">{t.title}</span>
                  {t.result ? <span className="line-clamp-2 text-[12.5px] leading-[18px] text-[var(--om-text-3)]">{t.result}</span> : null}
                </span>
                <ArrowUpRight size={14} className="mt-[3px] shrink-0 text-[var(--om-icon-3)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- collaboration */

/** Collaborators of a task: the owner invites by email and removes; collaborators see who else is in. */
export function CollabButton({ taskId, role, compact }: { taskId: string; role: "owner" | "collaborator"; compact: boolean }) {
  const [members, setMembers] = useState<TaskMemberInfo[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    listMembers(taskId)
      .then((r) => setMembers(r.members))
      .catch((err) => setError(errorText(err, "Could not load collaborators.")));
  }, [taskId]);
  const invite = () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    inviteMember(taskId, value)
      .then(() => {
        setEmail("");
        load();
      })
      .catch((err) => setError(errorText(err, "Could not invite.")))
      .finally(() => setBusy(false));
  };
  return (
    <Popover onOpenChange={(o) => o && load()}>
      <Tooltip label={role === "owner" ? "Collaborate" : "Shared with you"}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Collaborate" className={cn("flex h-8 shrink-0 cursor-pointer items-center gap-[5px] rounded-[8px] px-2 text-[14px] font-medium leading-5 text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)] data-[state=open]:bg-[var(--om-fill)]", compact && "w-8 justify-center px-0")}>
            <Users size={17} strokeWidth={1.7} aria-hidden="true" />
            {compact ? null : role === "owner" ? "Collaborate" : "Shared with you"}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} aria-label="Collaborators" className="flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-3 p-4">
        <div>
          <p className="text-[15px] font-semibold text-[var(--om-text-1)]">Collaboration</p>
          <p className="text-[12.5px] leading-[18px] text-[var(--om-text-3)]">
            {role === "owner" ? `People you invite can read this task and send messages. Runs use your computer and your credits.` : `You can read this task and send messages. Its owner's account pays for the work.`}
          </p>
        </div>
        {role === "owner" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite();
            }}
          >
            <input type="email" aria-label="Email to invite" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--om-border)] bg-transparent px-2 text-[13px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]" />
            <button type="submit" disabled={busy || !email.trim()} className={BLACK_BUTTON}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Invite
            </button>
          </form>
        ) : null}
        {error ? <p className="text-[12.5px] text-[var(--om-danger)]">{error}</p> : null}
        <ul className="flex flex-col gap-1" aria-label="People in this task">
          {members === null ? (
            <li className="text-[12.5px] text-[var(--om-text-3)]">Loading…</li>
          ) : members.length === 0 ? (
            <li className="text-[12.5px] text-[var(--om-text-3)]">No collaborators yet.</li>
          ) : (
            members.map((m) => (
              <li key={m.email} data-member={m.email} className="flex h-8 items-center gap-2 text-[13px] text-[var(--om-text-1)]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--om-fill-strong)] text-[11px] uppercase">{m.email[0]}</span>
                <span className="min-w-0 flex-1 truncate">{m.email}</span>
                <span className="text-[12px] text-[var(--om-text-3)]">{m.userId ? "Joined" : "Invited"}</span>
                {role === "owner" ? (
                  <button type="button" aria-label={`Remove ${m.email}`} onClick={() => removeMember(taskId, m.email).then(load).catch((err) => setError(errorText(err, "Could not remove.")))} className="flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-3)] hover:bg-[var(--om-fill)]">
                    <X size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ---------------------------------------------------------------- side chats */

function SideConversation({ sideId }: { sideId: string }) {
  const controller = useTask(sideId, false);
  const [value, setValue] = useState("");
  const busy = isBusy(controller.state.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [controller.state]);
  const send = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    void controller.send(text, busy ? "queue" : "steer");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="tv-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {controller.loading ? <p className="pt-6 text-[13px] text-[var(--om-text-3)]">Loading…</p> : <Conversation taskId={sideId} model={controller.state} mode={controller.task?.mode ?? "lite"} selectedCallId={null} onOpenCall={() => undefined} onOpenFile={() => undefined} onReply={controller.answer} />}
      </div>
      <form
        className="m-3 flex items-end gap-2 rounded-[16px] border border-[var(--om-border-strong)] bg-[var(--om-input-fade)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Message the side chat"
          value={value}
          rows={1}
          placeholder="Ask something on the side…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-[6px] text-[14px] leading-[22px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
        />
        <button type="submit" aria-label="Send to side chat" disabled={!value.trim()} className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] disabled:cursor-default disabled:opacity-40">
          <ArrowUpIcon size={15} />
        </button>
      </form>
    </div>
  );
}

/**
 * Side chats next to a task: questions and ideas while the agent keeps working. They read the main task's
 * conversation, never interrupt it, and stay with the task.
 */
export function SideChatPanel({ taskId, onClose, className }: { taskId: string; onClose: () => void; className?: string }) {
  const [chats, setChats] = useState<TaskSummary[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    listSideChats(taskId)
      .then((r) => setChats(r.sideChats))
      .catch((err) => setError(errorText(err, "Could not load side chats.")));
  }, [taskId]);
  useEffect(() => load(), [load]);
  const start = () => {
    const prompt = draft.trim();
    if (!prompt) return;
    setBusy(true);
    setError(null);
    createSideChat(taskId, prompt)
      .then(({ task }) => {
        setDraft("");
        setActive(task.id);
        load();
      })
      .catch((err) => setError(errorText(err, "Could not start a side chat.")))
      .finally(() => setBusy(false));
  };
  const current = chats?.find((c) => c.id === active);
  return (
    <aside aria-label="Side chat" data-side-chat className={cn("flex min-h-0 min-w-0 flex-col border-s border-[var(--om-border)] bg-[var(--om-bg)]", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--om-border)] px-3">
        {active ? (
          <button type="button" onClick={() => setActive(null)} className="cursor-pointer rounded-[6px] px-1 text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]">
            All side chats
          </button>
        ) : (
          <MessageCircle size={16} className="text-[var(--om-icon-2)]" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--om-text-1)]">{current ? current.title : "Side chat"}</span>
        {active ? (
          <Tooltip label="New side chat">
            <button type="button" aria-label="New side chat" onClick={() => setActive(null)} className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
              <Plus size={16} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip label="Close side chat">
          <button type="button" aria-label="Close side chat" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
            <X size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {active ? (
        <SideConversation key={active} sideId={active} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[13px] leading-[19px] text-[var(--om-text-2)]">Ask questions or talk through ideas while {brand.agentNoun} keeps working. Your main task won&apos;t be interrupted.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
            className="flex items-end gap-2 rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-input-fade)] p-2"
          >
            <textarea aria-label="Start a side chat" value={draft} rows={2} placeholder="Ask something on the side…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); start(); } }} className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 text-[14px] leading-[21px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]" />
            <button type="submit" aria-label="Start side chat" disabled={busy || !draft.trim()} className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] disabled:cursor-default disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpIcon size={15} />}
            </button>
          </form>
          {error ? <p className="text-[12.5px] text-[var(--om-danger)]">{error}</p> : null}
          {chats && chats.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-medium text-[var(--om-text-3)]">Recent</p>
              {chats.map((c) => (
                <button key={c.id} type="button" data-side-chat-row={c.id} onClick={() => setActive(c.id)} className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-start text-[13.5px] text-[var(--om-text-1)] hover:bg-[var(--om-fill)]">
                  {statusIcon(c.status)}
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------- file viewer */

/** One delivered file in the side area, in the artifact viewer that suits its type. */
export function FileAside({ taskId, file, onClose, onAllFiles, className }: { taskId: string; file: TaskFile; onClose: () => void; onAllFiles: () => void; className?: string }) {
  const memo = useMemo(() => ({ fileId: file.fileId, name: file.name, mime: file.mime, size: file.size }), [file.fileId, file.name, file.mime, file.size]);
  return (
    <aside aria-label={file.name} data-file-aside className={cn("flex min-h-0 min-w-0 flex-col border-s border-[var(--om-border)] bg-[var(--om-bg)]", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--om-border)] px-3">
        <button type="button" onClick={onAllFiles} className="cursor-pointer rounded-[6px] px-1 text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]">
          All files
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--om-text-1)]">{file.name}</span>
        <Tooltip label="Close">
          <button type="button" aria-label="Close file" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
            <X size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <TaskFileViewer key={file.fileId} taskId={taskId} file={memo} className="flex min-h-0 flex-1 flex-col" />
    </aside>
  );
}

export function SideChatButton({ onClick, active }: { onClick: () => void; active: boolean }): ReactNode {
  return (
    <Tooltip label="Side chat">
      <button type="button" aria-label="Side chat" aria-pressed={active} onClick={onClick} className={cn("flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)]", active && "bg-[var(--om-fill)] text-[var(--om-icon-1)]")}>
        <MessageCircle size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
