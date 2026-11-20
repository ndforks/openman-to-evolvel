// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** The message column: user bubbles and agent turns (header, status line, narration, work log, cards, result). */
import { Fragment, useState } from "react";
import { Copy, Star } from "lucide-react";
import { brand, type ModeId } from "@/config/brand";
import { BrandIcon } from "@/components/ui/brand-icon";
import { cn } from "@/components/ui/cn";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import type { Interaction } from "@/lib/agent/types";
import { ApprovalCard, ErrorCard, FileCard, QuestionCard } from "./cards";
import { BranchButton, MarkerRow, NoticeRow, PlanCard, ReferenceChips, splitPlan } from "./extras";
import { Markdown } from "./markdown";
import { DashedCircleIcon, Dots, PauseCircleIcon, formatClock, formatDuration, useNow } from "./parts";
import { isBusy, type AgentTurn, type Block, type TaskViewModel, type ToolCall, type UserTurn } from "./reducer";
import { filePreview } from "./tools";
import { StepMarker, ThinkingRow, WorkGroup } from "./work-log";

/** "Lite", "Max", "Flex", or nothing for the standard mode: what is left of the mode label once the product name is removed. */
export function modeBadge(mode: ModeId): string {
  return brand.modes[mode].label.replace(brand.modes.standard.label, "").replace(brand.name, "").trim();
}

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return [copied, copy];
}

const GHOST_BUTTON = "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-3)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]";

/* ---------------------------------------------------------------- user */

function UserBubble({ turn }: { turn: UserTurn }) {
  const [copied, copy] = useCopied();
  return (
    <div className="group/user tv-fade-in mt-6 flex w-full flex-col items-end">
      <div
        className={cn(
          "max-w-[90%] whitespace-pre-wrap break-words rounded-[12px] rounded-ee-[4px] bg-[var(--om-fill-solid)] px-3 py-3 text-[16px] leading-6 text-[var(--om-text-1)] outline outline-[0.5px] outline-[var(--om-border-subtle)] transition-opacity",
          turn.pending && "opacity-70",
        )}
      >
        {turn.text}
      </div>
      {turn.references?.length ? <ReferenceChips refs={turn.references} className="mt-[6px] max-w-[90%] justify-end" /> : null}
      <div className="mt-1 flex h-7 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/user:opacity-100">
        <span className="px-1 text-[12px] leading-4 text-[var(--om-text-3)]">{formatClock(turn.at)}</span>
        <Tooltip label={copied ? "Copied" : "Copy"}>
          <button type="button" aria-label="Copy message" onClick={() => copy(turn.text)} className={GHOST_BUTTON}>
            {copied ? <CheckIcon size={15} /> : <Copy size={15} strokeWidth={1.7} aria-hidden="true" />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- agent */

function AgentHeader({ badge }: { badge: string }) {
  return (
    <div className="flex h-[26px] items-center" role="img" aria-label={brand.name}>
      <BrandIcon src={brand.logoMark} width={24} height={24} />
      <BrandIcon src={brand.logoWord} width={77} height={24} className="ms-0.5" />
      {badge ? <span className="ms-2 flex h-[21px] items-center rounded-[6px] border border-[var(--om-border-strong)] px-[6px] text-[12px] leading-4 text-[var(--om-text-3)]">{badge}</span> : null}
    </div>
  );
}

const STATUS_LINE = "flex h-5 items-center text-[14px] leading-5 text-[var(--om-text-3)]";
/** Amber one-line notice at the end of a turn that is paused or was stopped. */
const MARKER_ROW = "tv-fade-in flex h-6 items-center gap-[6px] text-[14px] leading-5 text-[var(--om-warning)]";

function Rating() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap text-[14px] leading-5 text-[var(--om-text-2)]">{rating ? "Noted, thank you" : "Rate this answer"}</span>
      <div className="flex items-center gap-[3px]" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const lit = n <= (hover || rating);
          return (
            <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={rating === n} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => setRating(n)} className="cursor-pointer rounded-[4px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--om-border-focus)]">
              <Star size={17} strokeWidth={0} aria-hidden="true" className={cn("transition-colors", lit ? "fill-[var(--om-warning)]" : "fill-[var(--om-fill-strong)]")} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AgentTurnProps {
  /** Null in mock mode: file cards then show only what the work log carries. */
  taskId: string | null;
  turn: AgentTurn;
  model: TaskViewModel;
  badge: string;
  /** No earlier agent turn exists: the first status reads "Thinking it through", later ones "<agent> is on it". */
  first: boolean;
  /** Last turn of the conversation: it carries the live row and, once done, the result footer. */
  last: boolean;
  selectedCallId: string | null;
  onOpenCall: (callId: string) => void;
  onOpenFile: (fileId: string) => void;
  onReply: (requestId: string, reply: { choice?: string; answer?: string }) => Promise<void>;
  onRetry?: () => void;
  /** How the task works now; a plan card can be confirmed only while it is in Plan mode. */
  interaction: Interaction;
  onConfirmPlan?: (plan: string) => Promise<void>;
  /** Branch is offered (the owner, on a task that is not a parallel task or side chat). */
  canBranch: boolean;
  /** The last event of this turn, for Branch; undefined for the newest turn (branch from everything). */
  uptoSeq?: number;
}

function TextWithPlan({ text, streaming, className, planActive, onConfirmPlan }: { text: string; streaming: boolean; className: string; planActive: boolean; onConfirmPlan?: (plan: string) => Promise<void> }) {
  const parts = splitPlan(text);
  if (!parts || !onConfirmPlan) return <Markdown text={text} streaming={streaming} className={className} />;
  return (
    <div className={cn(className, "flex flex-col gap-3")}>
      {parts.before ? <Markdown text={parts.before} /> : null}
      <PlanCard plan={parts.plan} active={planActive && !streaming} onConfirm={onConfirmPlan} />
      {parts.after ? <Markdown text={parts.after} streaming={streaming} /> : null}
    </div>
  );
}

function AgentTurnView({ taskId, turn, model, badge, first, last, selectedCallId, onOpenCall, onOpenFile, onReply, onRetry, interaction, onConfirmPlan, canBranch, uptoSeq }: AgentTurnProps) {
  const done = turn.endedAt !== undefined;
  const running = !done && turn.state === "running";
  const now = useNow(running);
  const [logOpen, setLogOpen] = useState(false);
  const [copied, copy] = useCopied();

  const blocks = turn.blocks;
  let lastWork = -1;
  let lastTools = -1;
  blocks.forEach((b, i) => {
    // A card that has been answered is part of how the result came about, so it folds away with the work log.
    const settledCard = (b.kind === "question" && (b.answer !== undefined || b.skipped === true)) || (b.kind === "approval" && (b.choice !== undefined || b.skipped === true));
    if (b.kind === "tools" || b.kind === "step" || settledCard) lastWork = i;
    if (b.kind === "tools") lastTools = i;
  });
  const hasTools = lastTools >= 0;
  const result = blocks.slice(lastWork + 1);
  // A completed turn folds its work log away and keeps the result, as long as there is a result to keep.
  // A stopped or failed turn stays open: what it was doing is the point.
  const collapsible = done && hasTools && result.length > 0 && turn.state !== "stopped";
  const collapsed = collapsible && !logOpen;
  const visible = collapsed ? result : blocks;

  const started = Date.parse(turn.at);
  // The counter runs while the agent works; it rests at the last block while the turn waits for the user.
  const until = done ? Date.parse(turn.endedAt as string) : running ? now : Date.parse(blocks[blocks.length - 1]?.at ?? turn.at);
  const elapsed = Math.max(0, until - started);
  const callsOf = (ids: string[]): ToolCall[] => ids.map((id) => model.calls[id]).filter(Boolean);
  const anyRunning = running && blocks.some((b) => b.kind === "tools" && b.callIds.some((id) => model.calls[id]?.state === "running"));
  const lastBlock = blocks[blocks.length - 1];
  const streaming = lastBlock?.kind === "text" && lastBlock.streaming;
  const showThinking = running && last && blocks.length > 0 && !anyRunning && !streaming;
  const resultText = result
    .filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("\n\n");
  const allCalls = model.callOrder.map((id) => model.calls[id]).filter(Boolean);

  let statusLine = null;
  if (running && blocks.length === 0) {
    statusLine = (
      <div className={STATUS_LINE} role="status">
        {first ? "Thinking it through" : `${brand.agentNoun} is on it`}
        <Dots />
      </div>
    );
  } else if (hasTools && !done) {
    statusLine = <div className={STATUS_LINE}>Busy for {formatDuration(elapsed)}</div>;
  } else if (hasTools && done) {
    const label = `Took ${formatDuration(elapsed)}`;
    statusLine = collapsible ? (
      <button type="button" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)} className={cn(STATUS_LINE, "cursor-pointer gap-1 self-start outline-none transition-colors hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]")}>
        {label}
        {logOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
      </button>
    ) : (
      <div className={STATUS_LINE}>{label}</div>
    );
  }

  return (
    <div className="group/agent tv-fade-in mt-5 flex w-full flex-col">
      <AgentHeader badge={badge} />
      {statusLine ? <div className="mt-2 flex flex-col">{statusLine}</div> : null}
      {visible.map((block, i) => {
        const key = block.id;
        const gap = i === 0 && !statusLine ? "mt-2" : "mt-3";
        switch (block.kind) {
          case "text":
            return <TextWithPlan key={key} text={block.text} streaming={block.streaming} className={gap} planActive={last && interaction === "plan"} onConfirmPlan={onConfirmPlan} />;
          case "notice":
            return (
              <div key={key} className={gap}>
                <NoticeRow block={block} />
              </div>
            );
          case "tools":
            return (
              <div key={key} className={gap}>
                <WorkGroup calls={callsOf(block.callIds)} at={block.at} live={running && blocks.indexOf(block) === lastTools} selectedCallId={selectedCallId} onOpenCall={onOpenCall} />
              </div>
            );
          case "step":
            return (
              <div key={key} className={gap}>
                <StepMarker title={block.title} plan={model.plan} turnEnded={done} />
              </div>
            );
          case "question":
            return (
              <div key={key} className={gap}>
                <QuestionCard block={block} onReply={onReply} />
              </div>
            );
          case "approval":
            return (
              <div key={key} className={gap}>
                <ApprovalCard block={block} onReply={onReply} />
              </div>
            );
          case "files":
            return (
              <div key={key} className={cn(gap, "flex flex-col gap-2")}>
                {block.fileIds.map((id) => {
                  const file = model.files[id];
                  return file ? <FileCard key={id} taskId={taskId} file={file} fallbackPreview={filePreview(allCalls, file)} onOpen={onOpenFile} /> : null;
                })}
              </div>
            );
          case "error":
            return (
              <div key={key} className={gap}>
                <ErrorCard message={block.message} onRetry={last ? onRetry : undefined} />
              </div>
            );
        }
      })}
      {showThinking ? (
        <div className="mt-3">
          <ThinkingRow />
        </div>
      ) : null}
      {!done && turn.state === "waiting" ? (
        <div className={cn(MARKER_ROW, "mt-3")}>
          <DashedCircleIcon />
          <span className="min-w-0 truncate">Paused until you reply</span>
        </div>
      ) : null}
      {done && last && turn.state === "stopped" ? (
        <div className={cn(MARKER_ROW, "mt-3")}>
          <PauseCircleIcon />
          <span className="min-w-0 truncate">Stopped. Send a message to pick it back up.</span>
        </div>
      ) : null}
      {done && last && turn.state === "completed" && resultText ? (
        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-1 gap-y-2">
          <Tooltip label={copied ? "Copied" : "Copy"}>
            <button type="button" aria-label="Copy result" onClick={() => copy(resultText)} className={cn(GHOST_BUTTON, "-ms-[6px]")}>
              {copied ? <CheckIcon size={15} /> : <Copy size={15} strokeWidth={1.7} aria-hidden="true" />}
            </button>
          </Tooltip>
          {taskId && canBranch ? <BranchButton taskId={taskId} uptoSeq={uptoSeq} /> : null}
          <span className="px-1 text-[13px] leading-[18px] text-[var(--om-text-3)]">{formatClock(turn.endedAt as string)}</span>
          <div className="ms-auto">
            <Rating />
          </div>
        </div>
      ) : null}
      {done && !last && turn.state === "completed" && resultText && taskId && canBranch ? (
        <div className="mt-1 flex h-7 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/agent:opacity-100">
          <BranchButton taskId={taskId} uptoSeq={uptoSeq} className="-ms-[6px]" />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- list */

export interface ConversationProps {
  /** Null in mock mode. */
  taskId: string | null;
  model: TaskViewModel;
  /** The mode the task runs in; shown as the tag next to the wordmark. */
  mode: ModeId;
  selectedCallId: string | null;
  onOpenCall: (callId: string) => void;
  onOpenFile: (fileId: string) => void;
  onReply: (requestId: string, reply: { choice?: string; answer?: string }) => Promise<void>;
  /** Resend the last user message after a failure. */
  onRetry?: () => void;
  interaction?: Interaction;
  onConfirmPlan?: (plan: string) => Promise<void>;
  canBranch?: boolean;
}

export function Conversation({ taskId, model, mode, selectedCallId, onOpenCall, onOpenFile, onReply, onRetry, interaction = "agent", onConfirmPlan, canBranch = false }: ConversationProps) {
  const badge = modeBadge(mode);
  const turns = model.turns;
  const firstAgent = turns.findIndex((t) => t.kind === "agent");
  const lastTurn = turns[turns.length - 1];
  // Right after a message is sent the agent has not produced anything yet: show its header and "thinking".
  const awaiting = lastTurn?.kind === "user" && isBusy(model.status);

  return (
    <div className="flex w-full flex-col">
      {model.markers.filter((m) => m.afterTurns === 0).map((m) => (
        <MarkerRow key={m.id} marker={m} />
      ))}
      {turns.map((turn, i) => {
        const next = turns.slice(i + 1).find((t) => t.kind === "user") as UserTurn | undefined;
        const uptoSeq = next?.seq !== undefined ? next.seq - 1 : undefined;
        return (
          <Fragment key={turn.id}>
            {turn.kind === "user" ? (
              <UserBubble turn={turn} />
            ) : (
              <AgentTurnView
                taskId={taskId}
                turn={turn}
                model={model}
                badge={badge}
                first={i === firstAgent}
                last={i === turns.length - 1}
                selectedCallId={selectedCallId}
                onOpenCall={onOpenCall}
                onOpenFile={onOpenFile}
                onReply={onReply}
                onRetry={onRetry}
                interaction={interaction}
                onConfirmPlan={onConfirmPlan}
                canBranch={canBranch}
                uptoSeq={uptoSeq}
              />
            )}
            {model.markers.filter((m) => m.afterTurns === i + 1).map((m) => (
              <MarkerRow key={m.id} marker={m} />
            ))}
          </Fragment>
        );
      })}
      {awaiting ? (
        <div className="tv-fade-in mt-5 flex w-full flex-col">
          <AgentHeader badge={badge} />
          <div className={cn(STATUS_LINE, "mt-2")} role="status">
            {firstAgent < 0 ? "Thinking it through" : `${brand.agentNoun} is on it`}
            <Dots />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Placeholder while the stored events load. */
export function ConversationSkeleton() {
  const bar = "rounded-[6px] bg-[var(--om-fill)]";
  return (
    <div className="flex w-full animate-pulse flex-col" aria-hidden="true">
      <div className={cn(bar, "mt-6 h-12 w-[62%] self-end rounded-[12px]")} />
      <div className={cn(bar, "mt-[52px] h-[26px] w-[120px]")} />
      <div className={cn(bar, "mt-4 h-4 w-[88%]")} />
      <div className={cn(bar, "mt-2 h-4 w-[72%]")} />
      <div className={cn(bar, "mt-2 h-4 w-[80%]")} />
    </div>
  );
}
