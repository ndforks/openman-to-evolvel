// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * What the computer panel shows for one tool call when it is not showing the live screen:
 * a terminal for commands, a reading view for pages, an editor for files, a result list for searches.
 * It is built from the previews the events carry (what the call was given and what came back).
 */
import { Fragment, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { useFileContent } from "@/components/task/files";
import { Markdown } from "@/components/task/markdown";
import type { TaskFile, ToolCall } from "@/components/task/reducer";
import { ToolIcon, describeCall, isReceipt, toolKind } from "@/components/task/tools";

const URL_PATTERN = /(https?:\/\/[^\s'"<>)\]]+)/g;

/** Plain text with URLs turned into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-[#4c9df3] underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return <p className="tv-shimmer px-4 py-3 text-[13px] leading-[18px]">{children}</p>;
}

/* ---------------------------------------------------------------- terminal */

function TerminalView({ call }: { call: ToolCall }) {
  const running = call.state === "running";
  return (
    <div className="tv-scroll size-full overflow-auto bg-[#131313] px-3 py-2 font-mono text-[14px] leading-[18px] text-[#c8c8c8]">
      <pre className="whitespace-pre-wrap break-all font-mono">
        <span className="font-semibold text-[#5ab00a]">ubuntu@sandbox:~$</span> <span className="text-white">{call.input ?? ""}</span>
        {call.output ? (
          <>
            {"\n"}
            <span className={cn(call.state === "error" && "text-[#ef6b6b]")}>
              <Linkified text={call.output.replace(/\n+$/, "")} />
            </span>
          </>
        ) : null}
        {running ? <span aria-hidden="true" className="ms-1 inline-block h-[14px] w-[7px] translate-y-[2px] animate-pulse bg-[#c8c8c8]" /> : null}
        {!running ? (
          <>
            {"\n"}
            <span className="font-semibold text-[#5ab00a]">ubuntu@sandbox:~$</span>
          </>
        ) : null}
      </pre>
    </div>
  );
}

/* ---------------------------------------------------------------- browser and search */

/**
 * Search results arrive as plain lines ("Title - https://..."). As Markdown they would run together
 * into one paragraph, so they become a list of links. Text that already is Markdown is left alone.
 */
function asResultList(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.some((line) => /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/.test(line))) return text;
  return lines
    .map((line) => {
      const match = /^(.*?)\s+[-–—]\s+(https?:\/\/\S+)$/.exec(line);
      if (match) return `- [${match[1].replace(/[[\]]/g, "")}](${match[2]})`;
      return /^https?:\/\/\S+$/.test(line) ? `- <${line}>` : `- ${line}`;
    })
    .join("\n");
}

function ReadingView({ call, emptyLabel, list = false }: { call: ToolCall; emptyLabel: string; list?: boolean }) {
  const info = describeCall(call);
  if (!call.output) {
    return (
      <div className="size-full overflow-auto">
        {call.state === "running" ? (
          <Pending>{emptyLabel}</Pending>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-4">
            <span className="text-[20px] font-bold leading-7 text-[var(--om-text-1)]">{info.target || info.app}</span>
            <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{call.state === "error" ? "This step failed before it returned anything." : "No preview was recorded for this step."}</span>
          </div>
        )}
      </div>
    );
  }
  // What a browser step returns is not always a page: scripts print markup, JSON or raw values. Those read better as they are.
  const prose = list || !(/<\/?[a-z][^>]*>/i.test(call.output) || /^\s*[[{(]/.test(call.output));
  return (
    <div className="tv-scroll size-full overflow-auto px-4 py-4">
      {prose ? (
        <Markdown text={list ? asResultList(call.output) : call.output} variant="doc" />
      ) : (
        <pre className={cn("whitespace-pre-wrap break-words font-mono text-[13px] leading-5 text-[var(--om-text-2)]", call.state === "error" && "text-[#ef6b6b]")}>
          <Linkified text={call.output} />
        </pre>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

const SEGMENTS = ["Diff", "Original", "Modified"] as const;
type Segment = (typeof SEGMENTS)[number];

/** One source line with light Markdown colouring (a One Dark-style palette). */
function SourceLine({ line }: { line: string }) {
  if (/^#{1,6}\s/.test(line)) return <span className="text-[#61afef]">{line}</span>;
  if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
    const marker = /^\s*([-*+]|\d+\.)\s/.exec(line)![0];
    return (
      <>
        <span className="text-[#61afef]">{marker}</span>
        <Inline text={line.slice(marker.length)} />
      </>
    );
  }
  if (/^\s*(```|~~~)/.test(line)) return <span className="text-[#98c379]">{line}</span>;
  if (/^\s*>/.test(line)) return <span className="text-[#7f848e]">{line}</span>;
  return <Inline text={line} />;
}

function Inline({ text }: { text: string }) {
  // Bold, inline code and bracketed references stand out; everything else stays plain.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <span key={i} className="font-bold text-white">{part}</span>;
        if (/^`[^`]+`$/.test(part)) return <span key={i} className="text-[#e5c07b]">{part}</span>;
        if (/^\[\d+\]$/.test(part)) return <span key={i} className="text-[#98c379]">{part}</span>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** The delivered file a write or edit produced: the server names it after the call, or it shares the path's file name. */
function fileOfCall(call: ToolCall, files: readonly TaskFile[]): TaskFile | null {
  const byCall = files.find((file) => file.fileId === `file_${call.callId}`);
  if (byCall) return byCall;
  const path = (call.input ?? "").split("\n")[0].trim();
  const name = path.split("/").pop();
  return name ? ([...files].reverse().find((file) => file.name === name) ?? null) : null;
}

function EditorView({ call, taskId, files }: { call: ToolCall; taskId: string | null; files: readonly TaskFile[] }) {
  const [segment, setSegment] = useState<Segment>("Modified");
  const kind = toolKind(call.tool);
  const changes = kind === "write" || kind === "edit";
  // A write usually reports only a receipt ("Wrote 496 bytes"); the file itself comes from the server when it has it.
  const file = changes ? fileOfCall(call, files) : null;
  const content = useFileContent(taskId, file);
  const reported = call.output ?? "";
  const text = content.state === "text" ? content.text : reported;
  const lines = text.replace(/\n+$/, "").split("\n");

  let body: ReactNode;
  if (text && changes && isReceipt(text)) {
    // The tool confirmed the write without echoing the file.
    body = <p className="px-4 py-3 text-[13px] leading-[18px] text-[var(--om-text-2)]">{text}</p>;
  } else if (!text) {
    body = call.state === "running" ? <Pending>{changes ? "Writing the file..." : "Opening the file..."}</Pending> : <p className="px-4 py-3 text-[13px] leading-[18px] text-[var(--om-text-3)]">No preview was recorded for this file.</p>;
  } else if (changes && segment === "Original") {
    body = <p className="px-4 py-3 text-[13px] leading-[18px] text-[var(--om-text-3)]">The earlier version of this file was not recorded.</p>;
  } else {
    const diff = changes && segment === "Diff";
    body = (
      <div className="min-w-0 whitespace-pre-wrap break-words py-2 font-mono text-[14px] leading-[21px] text-[#d7dae0]">
        {lines.map((line, i) => (
          <div key={i} className={cn("flex min-h-[21px] px-4", diff ? "bg-[#98c37914]" : i === 0 && "bg-[#2c313c]")}>
            {diff ? <span aria-hidden="true" className="w-4 shrink-0 select-none text-[#98c379]">+</span> : null}
            <span className="min-w-0 flex-1">
              <SourceLine line={line} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-0 flex-col">
      {changes && text && !isReceipt(text) ? (
        <div className="flex shrink-0 justify-center pb-1 pt-[9px]">
          <div role="tablist" aria-label="File view" className="flex h-7 items-center rounded-[8px] bg-[var(--om-fill-subtle)] p-[2px]">
            {SEGMENTS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={segment === name}
                onClick={() => setSegment(name)}
                className={cn("h-6 cursor-pointer rounded-[6px] px-[10px] text-[13px] leading-[18px] outline-none transition-colors", segment === name ? "bg-[var(--om-fill-strong)] font-medium text-[var(--om-text-1)]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)]")}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="tv-scroll min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- generic */

function GenericView({ call }: { call: ToolCall }) {
  const info = describeCall(call);
  return (
    <div className="tv-scroll flex size-full flex-col gap-3 overflow-auto px-4 py-4">
      <div className="flex items-center gap-[10px]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--om-fill)] text-[var(--om-icon-2)]">
          <ToolIcon tool={call.tool} size={18} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{info.app}</span>
          <span className="truncate text-[12px] leading-4 text-[var(--om-text-3)]">{call.state === "running" ? "In progress" : call.state === "error" ? "Failed" : "Done"}</span>
        </div>
      </div>
      {call.input ? <p className="whitespace-pre-wrap break-words text-[14px] leading-[22px] text-[var(--om-text-2)]">{call.input}</p> : null}
      {call.output ? (
        <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-[var(--om-border)] bg-[var(--om-fill-sunken)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--om-text-2)]">
          <Linkified text={call.output} />
        </pre>
      ) : call.state === "running" ? (
        <Pending>Working...</Pending>
      ) : null}
    </div>
  );
}

export function ToolView({ call, taskId = null, files = [] }: { call: ToolCall; taskId?: string | null; files?: readonly TaskFile[] }) {
  switch (toolKind(call.tool)) {
    case "terminal":
    case "code":
      return <TerminalView call={call} />;
    case "browser":
      return <ReadingView call={call} emptyLabel="Loading the page..." />;
    case "search":
      return <ReadingView call={call} emptyLabel="Searching..." list />;
    case "write":
    case "edit":
    case "read":
      return <EditorView key={call.callId} call={call} taskId={taskId} files={files} />;
    default:
      return <GenericView call={call} />;
  }
}

/**
 * Tiny, non-interactive rendering of a call for the thumbnail above the composer:
 * a few lines of what the screen holds, scaled down.
 */
export function ToolMiniature({ call }: { call: ToolCall }) {
  const kind = toolKind(call.tool);
  const terminal = kind === "terminal" || kind === "code";
  const text = `${terminal ? `$ ${call.input ?? ""}\n` : ""}${call.output ?? (terminal ? "" : (call.input ?? ""))}`.slice(0, 900);
  return (
    <div aria-hidden="true" className={cn("size-full overflow-hidden", terminal ? "bg-[#131313]" : "bg-[var(--om-bg)]")}>
      <pre className={cn("w-[360px] origin-top-left scale-[0.2] whitespace-pre-wrap break-words p-4 text-[17px] leading-[24px]", terminal ? "font-mono text-[#c8c8c8]" : "font-sans text-[var(--om-text-1)]")}>{text}</pre>
    </div>
  );
}
