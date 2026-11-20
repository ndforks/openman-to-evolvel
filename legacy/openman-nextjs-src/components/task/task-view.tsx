// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The screen a user sees while the agent works on a task: the conversation with its work log on the left,
 * the composer underneath, and the agent's computer in a side panel on the right.
 * Add `?mock=1` to the URL to play a scripted task with no backend.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, Puzzle } from "lucide-react";
import { brand, type ModeId } from "@/config/brand";
import { useComposerStore } from "@/components/composer/store";
import { ComputerPanel, ComputerThumbnail, computerTitle, useComputerView, type PanelTab } from "@/components/computer/computer-panel";
import { usePref } from "@/components/settings/prefs";
import { cn } from "@/components/ui/cn";
import { SuggestedKnowledge } from "@/components/pages/personalization/SuggestedKnowledge";
import { GeneratorPanel, WideResearchCard, useIsGeneratorTask } from "@/components/artifacts";
import { useGeneratorState } from "@/lib/generators/client";
import { switchToAgent } from "@/lib/agent/client";
import type { Interaction, TaskSummary } from "@/lib/agent/types";
import { CollabButton, FileAside, LongTaskCard, ParallelTasksCard, SideChatButton, SideChatPanel } from "./extras";
import { ConnectCard, connectRequestFrom } from "./connect-card";
import { TaskComposer } from "./composer";
import { Conversation, ConversationSkeleton } from "./conversation";
import { mergeFiles, useServerFiles } from "./files";
import { statusLabel } from "./parts";
import { isBusy, selectCurrentCall, selectFiles, type SendMode } from "./reducer";
import { TaskHeader } from "./task-header";
import { TASK_REFRESH_EVENT, useTask, type TaskController } from "./use-task";
import { WebsitePreview } from "./website-preview";
import "./task-view.css";

/** Distance from the bottom, in px, within which the list keeps following new content. */
const FOLLOW_THRESHOLD = 96;

export function TaskView({ taskId }: { taskId: string }) {
  const mock = useSearchParams().get("mock") === "1";
  // Keyed so that moving to another task (or toggling the mock) starts from a clean slate.
  return <TaskScreen key={`${taskId}:${mock ? "mock" : "live"}`} taskId={taskId} mock={mock} />;
}

function TaskScreen({ taskId, mock }: { taskId: string; mock: boolean }) {
  const controller = useTask(taskId, mock);
  return <TaskFrame taskId={taskId} controller={controller} />;
}

export interface TaskFrameProps {
  taskId: string;
  controller: TaskController;
  /** Whether the side panel starts open for someone who has never opened or closed it. */
  defaultPanelOpen?: boolean;
}

/** Everything on screen, given a loaded (or loading) task. Split from the data hook so it can be rendered with fixed data. */
export function TaskFrame({ taskId, controller, defaultPanelOpen = false }: TaskFrameProps) {
  const { state: model, task, loading, loadError, mock } = controller;
  // The task's own mode. Only a backend that does not report one leaves the composer's current choice as a stand-in.
  const composerMode = useComposerStore((s) => s.mode);
  const mode: ModeId | null = task ? (task.mode ?? composerMode) : null;

  const [panelOpen, setPanelOpen] = usePref<boolean>("task.computerPanel", defaultPanelOpen);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [tab, setTab] = useState<PanelTab>("computer");
  const [filesTabOpen, setFilesTabOpen] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [filesListOpen, setFilesListOpen] = useState(true);
  // The right-hand area can also hold a side chat or one delivered file instead of the computer panel.
  const [sideOpen, setSideOpen] = useState(false);
  const [viewFileId, setViewFileId] = useState<string | null>(null);

  const ext = task as (TaskSummary & { interaction?: Interaction; role?: "owner" | "collaborator"; childKind?: string | null }) | null;
  const interaction: Interaction = model.interaction ?? ext?.interaction ?? "agent";
  const owner = (ext?.role ?? "owner") === "owner";
  const chat = interaction === "chat";
  const isChild = !!ext?.childKind;

  const busy = isBusy(model.status);
  const title = task?.title?.trim() || "New task";
  const label = statusLabel(model.status, model.brief, brand.agentNoun);
  const currentCall = selectCurrentCall(model);
  const live = !mock && !loading && !loadError;

  // Where the computer's screen can be watched: the panel shows it, and so does the thumbnail above the composer.
  const view = useComputerView(taskId, live && owner && !chat, busy);
  // Generator tasks (slides, analysis, batch research, audio) show what they made in the side area; batch research
  // asks for confirmation inline, in the conversation.
  const generator = useIsGeneratorTask(live ? taskId : null, busy);
  const { state: genState, refresh: refreshGen } = useGeneratorState(live && generator ? taskId : null, busy);
  const awaitingResearch = genState?.research?.plan?.mode === "wide" && genState.research.phase === "awaiting-confirmation" ? genState.research : null;
  // Files named in the event stream, plus any the server lists beyond those. Asked again when a file arrives or a run ends.
  const serverFiles = useServerFiles(taskId, live, `${model.fileOrder.length}:${busy ? "busy" : "rest"}`);
  const files = useMemo(() => mergeFiles(selectFiles(model), serverFiles), [model, serverFiles]);

  // Tab title: a tick once finished, a bang while the task waits for the user.
  const taskTitle = task?.title;
  const status = model.status;
  useEffect(() => {
    if (!taskTitle) return;
    const previous = document.title;
    document.title = status === "completed" ? `✓ ${taskTitle}` : status === "waiting" ? `! ${taskTitle}` : `${taskTitle} - ${brand.name}`;
    return () => {
      document.title = previous;
    };
  }, [taskTitle, status]);

  /* ---------------- scrolling: follow new content until the user scrolls away ---------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [scrolled, setScrolled] = useState(false);
  const [away, setAway] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Only the user can stop the list from following. The layout also moves the scroll position on its own
  // (a work log folding away, a file card moving under the result), and that must not count as scrolling away.
  const userScrollAt = useRef(0);
  const dragging = useRef(false);
  const markUserScroll = () => {
    userScrollAt.current = performance.now();
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const byUser = dragging.current || performance.now() - userScrollAt.current < 800;
    if (distance < FOLLOW_THRESHOLD) following.current = true;
    else if (byUser) following.current = false;
    setAway(!following.current);
    setScrolled(el.scrollTop > 2);
  };

  // Content grows in many small steps (tokens, rows, cards); one observer covers them all.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom, loading]);

  // A turn starting or ending rearranges the list without necessarily changing its height; catch up after it has settled.
  const turnCount = model.turns.length;
  useEffect(() => {
    if (!following.current) return;
    const frame = requestAnimationFrame(() => {
      if (following.current) scrollToBottom();
    });
    return () => cancelAnimationFrame(frame);
  }, [status, turnCount, panelOpen, scrollToBottom]);

  /* ---------------- panel ---------------- */
  const openCall = (callId: string) => {
    setSelectedCallId(callId);
    setTab("computer");
    setPanelOpen(true);
  };
  const openFiles = (fileId?: string) => {
    // A file opens in the artifact viewer next to the conversation; "all files" opens the list in the panel.
    if (fileId && files.some((f) => f.fileId === fileId)) {
      setSelectedFileId(fileId);
      setViewFileId(fileId);
      setSideOpen(false);
      return;
    }
    setViewFileId(null);
    setSideOpen(false);
    if (fileId) setSelectedFileId(fileId);
    setFilesListOpen(!fileId);
    setFilesTabOpen(true);
    setTab("files");
    setPanelOpen(true);
  };
  const viewFile = viewFileId ? (files.find((f) => f.fileId === viewFileId) ?? null) : null;
  const openComputer = () => {
    if (chat) return;
    setViewFileId(null);
    setSideOpen(false);
    setTab("computer");
    setPanelOpen(true);
  };
  const closePanel = () => {
    setPanelOpen(false);
    setPanelExpanded(false);
  };

  const send = async (text: string, sendMode: SendMode, extra?: Parameters<TaskController["send"]>[2]) => {
    following.current = true;
    await controller.send(text, sendMode, extra);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const lastUserText = [...model.turns].reverse().find((t) => t.kind === "user")?.text;
  // An app the agent said it needs but is not connected: from the latest agent turn's text and tool results.
  const connectApp = useMemo(() => {
    const turn = [...model.turns].reverse().find((t) => t.kind === "agent");
    if (!turn || turn.kind !== "agent") return null;
    const texts: string[] = [];
    for (const block of turn.blocks) {
      if (block.kind === "text") texts.push(block.text);
      else if (block.kind === "tools") for (const id of block.callIds) texts.push(model.calls[id]?.output ?? "");
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const app = connectRequestFrom(texts[i]);
      if (app) return app;
    }
    return null;
  }, [model.turns, model.calls]);
  const finished = model.status === "completed";
  // Time worked: finished turns in full, the open turn up to its latest block.
  const workedMs = model.turns.reduce((sum, t) => {
    if (t.kind !== "agent") return sum;
    const end = t.endedAt ?? t.blocks[t.blocks.length - 1]?.at ?? t.at;
    const span = Date.parse(end) - Date.parse(t.at);
    return Number.isFinite(span) && span > 0 ? sum + span : sum;
  }, 0);
  const tokenTotal = model.turns.reduce((sum, t) => (t.kind === "agent" && t.usage ? sum + t.usage.inputTokens + t.usage.outputTokens : sum), 0);

  // The strip above the composer carries the status unless the computer tab of the panel already shows it.
  const stripVisible = !chat && (!panelOpen || tab !== "computer");
  const confirmPlan = useCallback(async (plan: string) => {
    following.current = true;
    await switchToAgent(taskId, plan);
    window.dispatchEvent(new CustomEvent(TASK_REFRESH_EVENT, { detail: taskId }));
  }, [taskId]);
  const asideOpen = sideOpen || !!viewFile;

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[var(--om-bg)] font-sans text-[var(--om-text-1)] antialiased">
      <section className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", panelOpen && panelExpanded && !asideOpen && "hidden", (panelOpen || asideOpen) && "max-md:hidden")} aria-label={title}>
        <TaskHeader
          taskId={taskId}
          title={title}
          mode={mode}
          favorite={task?.favorite === true}
          archived={(task as { archived?: boolean } | null)?.archived === true}
          mock={mock}
          onPatched={controller.patchTask}
          panelOpen={panelOpen}
          scrolled={scrolled}
          busy={busy}
          steps={model.callOrder.length}
          filesCount={files.length}
          workedMs={workedMs}
          tokens={tokenTotal > 0 ? tokenTotal : null}
          onOpenFiles={() => openFiles()}
          onTogglePanel={openComputer}
          onStop={() => void controller.stop()}
          owner={owner}
          hidePanelToggle={chat}
          extraActions={
            mock || loadError ? null : (
              <>
                {isChild ? null : <CollabButton taskId={taskId} role={owner ? "owner" : "collaborator"} compact={panelOpen || asideOpen} />}
                {owner && !isChild ? (
                  <SideChatButton
                    active={sideOpen}
                    onClick={() => {
                      setViewFileId(null);
                      setSideOpen((v) => !v);
                    }}
                  />
                ) : null}
              </>
            )
          }
        />

        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={markUserScroll}
          onTouchMove={markUserScroll}
          onKeyDown={markUserScroll}
          onPointerDown={(event) => {
            // A press on the scrollbar itself (the element, not its content) starts a drag.
            if (event.target === event.currentTarget) dragging.current = true;
          }}
          onPointerUp={() => {
            dragging.current = false;
            markUserScroll();
          }}
          className="tv-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none]"
        >
          <div ref={contentRef} className="mx-auto w-full max-w-[800px] px-8 pb-10 pt-2">
            {loadError ? (
              <div className="flex flex-col items-center gap-3 pt-[18vh] text-center" role="alert">
                <span className="text-[16px] font-semibold leading-6 text-[var(--om-text-1)]">Could not open this task</span>
                <span className="max-w-[420px] break-words text-[14px] leading-5 text-[var(--om-text-3)]">{loadError}</span>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" onClick={controller.reload} className="flex h-8 cursor-pointer items-center rounded-[8px] bg-[var(--om-btn-primary)] px-3 text-[14px] font-medium leading-5 text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90">
                    Try again
                  </button>
                  <Link href="/app" className="flex h-8 items-center rounded-[8px] border border-[var(--om-border-strong)] px-3 text-[14px] font-medium leading-5 text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]">
                    New task
                  </Link>
                </div>
              </div>
            ) : loading ? (
              <ConversationSkeleton />
            ) : (
              <Conversation
                taskId={mock ? null : taskId}
                model={model}
                mode={mode ?? composerMode}
                selectedCallId={panelOpen && tab === "computer" ? selectedCallId : null}
                onOpenCall={openCall}
                onOpenFile={openFiles}
                onReply={controller.answer}
                onRetry={lastUserText ? () => void send(lastUserText, "steer") : undefined}
                interaction={interaction}
                onConfirmPlan={mock ? undefined : confirmPlan}
                canBranch={owner && !isChild && !mock}
              />
            )}
            {!loading && !loadError && !mock ? (
              <div className="mt-3 flex flex-col gap-3 empty:hidden">
                {awaitingResearch ? <WideResearchCard taskId={taskId} research={awaitingResearch} onChange={refreshGen} /> : null}
                {isChild ? null : <ParallelTasksCard taskId={taskId} live={busy} />}
                {owner && model.compacted && !busy ? <LongTaskCard taskId={taskId} /> : null}
                {connectApp && !busy ? <ConnectCard app={connectApp} /> : null}
                {finished ? <SuggestedKnowledge taskId={taskId} status={model.status} /> : null}
                {finished ? (
                  <div>
                    <Link
                      href={`/app/skills?add=build&task=${encodeURIComponent(taskId)}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--om-border)] px-3 text-[13px] font-medium text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill-subtle)]"
                    >
                      <Puzzle size={14} aria-hidden="true" />
                      Save as skill
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[800px] shrink-0 px-4">
          {away ? (
            <button
              type="button"
              aria-label="Jump to the newest message"
              onClick={() => {
                following.current = true;
                scrollToBottom(true);
              }}
              className="tv-fade-in absolute -top-12 end-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full border border-[var(--om-border-strong)] bg-[var(--om-surface)] text-[var(--om-icon-1)] shadow-[0_5px_16px_var(--om-shadow-md)] outline-none transition-colors hover:bg-[var(--om-fill-solid-raised)] focus-visible:border-[var(--om-border-focus)]"
            >
              <ArrowDown size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
          {loadError ? null : (
            <TaskComposer
              busy={busy}
              strip={stripVisible ? { label, plan: model.plan, thumbnail: <ComputerThumbnail call={currentCall} vncUrl={view?.vncUrl ?? null} live={busy || model.status === "waiting"} />, compact: !busy && model.status !== "waiting", onOpenComputer: openComputer } : null}
              queued={model.queued}
              error={controller.actionError}
              onSend={send}
              onStop={controller.stop}
              taskId={mock ? null : taskId}
              interaction={interaction}
            />
          )}
        </div>
      </section>

      {sideOpen && !mock ? (
        <SideChatPanel taskId={taskId} onClose={() => setSideOpen(false)} className="tv-fade-in w-[420px] min-w-[360px] max-w-[45%] shrink-0 max-md:w-full max-md:max-w-none max-md:flex-1" />
      ) : viewFile && !mock ? (
        <FileAside
          taskId={taskId}
          file={viewFile}
          onClose={() => setViewFileId(null)}
          onAllFiles={() => openFiles()}
          className="tv-fade-in w-1/2 min-w-[min(520px,58%)] max-w-[800px] shrink-0 max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:flex-1"
        />
      ) : panelOpen && !chat ? (
        <ComputerPanel
          taskId={mock ? null : taskId}
          view={view}
          model={model}
          files={files}
          label={label}
          tab={tab}
          filesTabOpen={filesTabOpen || tab === "files"}
          onTabChange={(next) => {
            if (next === "files") setFilesTabOpen(true);
            setTab(next);
          }}
          onCloseFilesTab={() => {
            setFilesTabOpen(false);
            setTab("computer");
          }}
          selectedCallId={selectedCallId}
          onSelectCall={setSelectedCallId}
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
          filesListOpen={filesListOpen}
          onToggleFilesList={() => setFilesListOpen((v) => !v)}
          expanded={panelExpanded}
          onToggleExpanded={() => setPanelExpanded((v) => !v)}
          onClose={closePanel}
          className={cn("tv-fade-in shrink-0", panelExpanded ? "w-full flex-1 border-s-0" : "w-1/2 min-w-[min(520px,58%)] max-w-[800px] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:flex-1 max-md:border-s-0")}
        />
      ) : !mock && !loadError && generator ? (
        <aside aria-label="Generated output" data-generator-panel className="tv-fade-in flex w-1/2 min-w-[min(520px,58%)] max-w-[800px] shrink-0 flex-col border-s border-[var(--om-border)] bg-[var(--om-bg)] max-md:hidden">
          <GeneratorPanel taskId={taskId} live={busy} />
        </aside>
      ) : !mock && !loadError ? (
        // The site this task builds, when it builds one. WebsitePreview renders nothing otherwise, and the empty aside hides itself.
        <aside aria-label="Website preview" className="tv-fade-in flex w-1/2 min-w-[min(520px,58%)] max-w-[800px] shrink-0 flex-col border-s border-[var(--om-border)] bg-[var(--om-bg)] empty:hidden max-md:hidden">
          <WebsitePreview taskId={taskId} className="min-h-0 flex-1" />
        </aside>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {label.text}. {panelOpen ? `${computerTitle()} is open.` : ""}
      </span>
    </div>
  );
}

/** Shown by the route while the task id is being resolved. */
export function TaskViewFallback() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--om-bg)]">
      <div className="h-12 shrink-0" />
      <div className="mx-auto w-full max-w-[800px] flex-1 px-8 pt-2">
        <ConversationSkeleton />
      </div>
    </div>
  );
}
