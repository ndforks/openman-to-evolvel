// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Side panel of a task. Its main tab is the agent's live desktop: what the agent is doing right now,
 * the screen through noVNC (the user can take the controls and give them back), a scrubber over past
 * tool calls and a "Back to now" button. A second tab shows the files the task delivered, and a Preview tab (only for a task
 * that builds a website) hosts the live site preview.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppWindow, ClipboardPaste, FileText, Maximize2, Minimize2, Monitor, MonitorPlay, PanelRight, Play, RotateCw, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { getComputerView } from "@/lib/agent/client";
import type { ComputerView } from "@/lib/agent/types";
import { FileGlyph } from "@/components/task/cards";
import { PlanProgress } from "@/components/task/composer";
import { computerTitle, StatusBadge, type StatusLabel } from "@/components/task/parts";
import { isBusy, type TaskFile, type TaskViewModel, type ToolCall } from "@/components/task/reducer";
import { describeCall } from "@/components/task/tools";
import { useTaskWebsite, WebsitePreview } from "@/components/task/website-preview";
import { FilesTab } from "./files-tab";
import { Timeline } from "./timeline";
import { ToolMiniature, ToolView } from "./tool-view";
import { VncViewer, type VncHandle, type VncState } from "./vnc-viewer";

export type PanelTab = "computer" | "files" | "preview";

const ICON_BUTTON = "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]";

export { computerTitle };

/* ---------------------------------------------------------------- data */

const POLL_MS = 8000;

/**
 * Where to watch the computer. Asked once when the task opens, then again every few seconds while the task
 * runs and no stream is known yet (the computer may still be waking up).
 */
export function useComputerView(taskId: string, enabled: boolean, busy: boolean): ComputerView | null {
  const [view, setView] = useState<ComputerView | null>(null);
  const hasStream = view?.vncUrl != null;

  useEffect(() => {
    if (!enabled || hasStream) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      getComputerView(taskId)
        .then((next) => {
          if (!cancelled) setView(next);
        })
        .catch(() => {
          // No view yet: the placeholder stays up and the next poll tries again.
        })
        .finally(() => {
          if (!cancelled && busy) timer = setTimeout(load, POLL_MS);
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, enabled, busy, hasStream]);

  return view;
}

/* ---------------------------------------------------------------- thumbnail */

const STILL_WIDTH = 288;
const STILL_EVERY_MS = 4000;

/** A small JPEG of whatever the noVNC canvas inside `host` shows right now. */
function grabStill(host: HTMLElement | null): string | null {
  const canvas = host?.querySelector("canvas");
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const out = document.createElement("canvas");
  out.width = STILL_WIDTH;
  out.height = Math.round((STILL_WIDTH * canvas.height) / canvas.width);
  try {
    out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/**
 * The computer's screen at thumbnail size. While the task works it is the live stream; once the task rests
 * the last frame is kept as a still and the connection is closed. Opening a task that is already at rest
 * connects just long enough to take one frame.
 */
function ScreenThumbnail({ url, live, children }: { url: string; live: boolean; children: ReactNode }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [connected, setConnected] = useState(false);
  const [still, setStill] = useState<string | null>(null);
  // True once a frame was taken for a task at rest: nothing further to watch until it runs again.
  const [settled, setSettled] = useState(false);
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    if (live) setSettled(false);
  }
  const watching = live || !settled;

  useEffect(() => {
    if (!connected || !watching) return;
    // The first frame needs a moment to arrive after the handshake.
    const first = setTimeout(() => {
      const frame = grabStill(boxRef.current);
      if (frame) setStill(frame);
      if (!live) setSettled(true);
    }, 1400);
    const timer = live
      ? setInterval(() => {
          const frame = grabStill(boxRef.current);
          if (frame) setStill(frame);
        }, STILL_EVERY_MS)
      : undefined;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [connected, live, watching]);

  const showStream = watching && connected && live;
  return (
    <>
      {still && !showStream ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL captured from the live screen.
        <img src={still} alt="" className="absolute inset-0 size-full object-cover" />
      ) : !showStream ? (
        children
      ) : null}
      {watching ? (
        // The screen is 16:9; sized by height and centred it covers the wider-than-tall thumbnail without bars.
        <span ref={boxRef} className={cn("absolute left-1/2 top-0 block aspect-[16/9] h-full -translate-x-1/2", !showStream && "opacity-0")}>
          <VncViewer url={url} interactive={false} quiet onStateChange={(state) => setConnected(state === "connected")} />
        </span>
      ) : null}
    </>
  );
}

/** Small picture of the computer for the strip above the composer. */
export function ComputerThumbnail({ call, vncUrl = null, live = false }: { call: ToolCall | undefined; vncUrl?: string | null; live?: boolean }) {
  const drawn = call ? (
    <ToolMiniature call={call} />
  ) : (
    <span className="flex size-full items-center justify-center">
      <span className="flex aspect-square h-[68%] items-center justify-center rounded-full border border-[#ffffff14] text-[#1c1c1c]">
        <Monitor size={14} strokeWidth={2} aria-hidden="true" className="max-h-[60%]" />
      </span>
    </span>
  );
  return (
    <span className="relative block size-full overflow-hidden bg-[#444345]">
      {vncUrl ? (
        <ScreenThumbnail url={vncUrl} live={live}>
          {drawn}
        </ScreenThumbnail>
      ) : (
        drawn
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-[#ffffff14]" />
    </span>
  );
}

/* ---------------------------------------------------------------- tabs */

function Tab({ active, icon, label, onSelect, onClose }: { active: boolean; icon: ReactNode; label: string; onSelect: () => void; onClose: () => void }) {
  if (!active) {
    return (
      <button type="button" role="tab" aria-selected={false} onClick={onSelect} className="flex h-8 min-w-0 max-w-[160px] shrink cursor-pointer items-center gap-[6px] rounded-[8px] px-2 text-[13px] font-medium leading-[18px] text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill-subtle)]">
        <span className="flex shrink-0 text-[var(--om-icon-2)]">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </button>
    );
  }
  return (
    <div role="tab" aria-selected className="flex h-8 min-w-0 max-w-[160px] shrink items-center gap-[5px] rounded-[8px] bg-[var(--om-fill)] pe-1 ps-2 text-[13px] font-medium leading-[18px] text-[var(--om-text-1)]">
      <span className="flex shrink-0 text-[var(--om-icon-2)]">{icon}</span>
      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%_-_10px),transparent)]">{label}</span>
      <button type="button" aria-label={`Close ${label}`} onClick={onClose} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-3)] outline-none transition-colors hover:bg-[var(--om-fill-strong)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill-strong)]">
        <CloseIcon size={13} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- panel */

export interface ComputerPanelProps {
  /** Null in mock mode: the files tab then fetches nothing. */
  taskId: string | null;
  /** Where the computer's screen can be watched; null while unknown (and always in mock mode). */
  view: ComputerView | null;
  model: TaskViewModel;
  /** Files of the task: those named in the event stream plus any only the server lists. */
  files: TaskFile[];
  label: StatusLabel;
  tab: PanelTab;
  filesTabOpen: boolean;
  onTabChange: (tab: PanelTab) => void;
  onCloseFilesTab: () => void;
  /** Call on screen, or null to follow the newest one. */
  selectedCallId: string | null;
  onSelectCall: (callId: string | null) => void;
  selectedFileId: string | null;
  onSelectFile: (fileId: string | null) => void;
  filesListOpen: boolean;
  onToggleFilesList: () => void;
  /** The panel covers the conversation. */
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  className?: string;
}

export function ComputerPanel({ taskId, view, model, files, label, tab, filesTabOpen, onTabChange, onCloseFilesTab, selectedCallId, onSelectCall, selectedFileId, onSelectFile, filesListOpen, onToggleFilesList, expanded, onToggleExpanded, onClose, className }: ComputerPanelProps) {
  const busy = isBusy(model.status);
  const vncUrl = view?.vncUrl ?? null;
  // null until the user chooses: then the stream's own default applies (view-only unless the server says otherwise).
  const [controlChoice, setControlChoice] = useState<boolean | null>(null);
  // Why the live view gave up, if it did. `attempt` remounts the viewer for another try.
  const [streamError, setStreamError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [vnc, setVnc] = useState<VncHandle | null>(null);
  const router = useRouter();

  /** Puts the browser's clipboard text on the computer's clipboard (noVNC's clipboard support). */
  const pasteIntoComputer = async () => {
    if (!vnc) return;
    let text: string | null = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt("Text to send to the desktop");
    }
    if (!text) return;
    vnc.paste(text);
    vnc.focus();
    toast("Copied to the desktop's clipboard. Paste it there with Ctrl+V (Ctrl+Shift+V in a terminal).");
  };

  const calls = model.callOrder.map((id) => model.calls[id]).filter(Boolean);
  const live = selectedCallId === null || !model.calls[selectedCallId];
  const index = live ? calls.length - 1 : calls.findIndex((c) => c.callId === selectedCallId);
  // While following, a call still in progress is the one to show even if a later one already finished.
  const running = calls.filter((c) => c.state === "running");
  const shownCall: ToolCall | undefined = live ? (running[running.length - 1] ?? calls[calls.length - 1]) : calls[index];
  const info = shownCall ? describeCall(shownCall) : null;

  const streamUsable = vncUrl !== null && streamError === null;
  const showStream = streamUsable && live && tab === "computer";
  const control = showStream && (controlChoice ?? view?.viewOnly === false);
  const agent = brand.agentNoun;
  const selectedFile = files.find((f) => f.fileId === selectedFileId) ?? null;
  // The site this task builds, if any: it gets a Preview tab. Null in mock mode (no task id), so no tab.
  const { site } = useTaskWebsite(taskId);
  const hasPreview = taskId !== null && site !== null;
  const shownTab: PanelTab = tab === "preview" && !hasPreview ? "computer" : tab;

  const onVncState = (state: VncState, reason: string | null) => {
    if (state === "failed") {
      setStreamError(reason ?? "The screen stream is down.");
      setControlChoice(null);
    } else if (state === "connected") setStreamError(null);
  };

  return (
    <aside aria-label={computerTitle()} className={cn("flex min-h-0 min-w-0 flex-col border-s border-[var(--om-border)] bg-[var(--om-bg)]", className)}>
      {/* Tab bar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--om-border)] pe-3 ps-3" role="tablist">
        <Tab active={shownTab === "computer"} icon={<Monitor size={16} strokeWidth={1.7} aria-hidden="true" />} label={computerTitle()} onSelect={() => onTabChange("computer")} onClose={onClose} />
        {filesTabOpen ? (
          <Tab
            active={shownTab === "files"}
            icon={selectedFile ? <FileGlyph file={selectedFile} size={16} /> : <FileText size={16} strokeWidth={1.7} aria-hidden="true" />}
            label={selectedFile ? selectedFile.name.replace(/\.(md|mdx|markdown)$/i, "") : "Files"}
            onSelect={() => onTabChange("files")}
            onClose={onCloseFilesTab}
          />
        ) : null}
        {hasPreview ? <Tab active={shownTab === "preview"} icon={<AppWindow size={16} strokeWidth={1.7} aria-hidden="true" />} label="Preview" onSelect={() => onTabChange("preview")} onClose={() => onTabChange("computer")} /> : null}
        <Menu>
          <Tooltip label="New tab">
            <MenuTrigger asChild>
              <button type="button" aria-label="New tab" className={cn(ICON_BUTTON, "w-auto gap-[6px] px-[7px]")}>
                <PlusIcon size={16} />
                <ChevronDownIcon size={12} className="text-[var(--om-icon-3)]" />
              </button>
            </MenuTrigger>
          </Tooltip>
          <MenuContent align="start" className="w-[220px]">
            <MenuItem onSelect={() => onTabChange("files")}>
              <FileText size={15} strokeWidth={1.7} aria-hidden="true" className="text-[var(--om-icon-2)]" />
              Files
            </MenuItem>
            <MenuItem onSelect={() => onTabChange("computer")}>
              <Monitor size={15} strokeWidth={1.7} aria-hidden="true" className="text-[var(--om-icon-2)]" />
              {computerTitle()}
            </MenuItem>
            {hasPreview ? (
              <MenuItem onSelect={() => onTabChange("preview")}>
                <AppWindow size={15} strokeWidth={1.7} aria-hidden="true" className="text-[var(--om-icon-2)]" />
                Preview
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => router.push("/app/skills/record")}>
              <Video size={15} strokeWidth={1.7} aria-hidden="true" className="text-[var(--om-icon-2)]" />
              Record a skill
            </MenuItem>
          </MenuContent>
        </Menu>
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <Tooltip label={expanded ? "Shrink panel" : "Expand panel"}>
            <button type="button" aria-label={expanded ? "Shrink panel" : "Expand panel"} aria-pressed={expanded} onClick={onToggleExpanded} className={ICON_BUTTON}>
              {expanded ? <Minimize2 size={16} strokeWidth={1.7} aria-hidden="true" /> : <Maximize2 size={16} strokeWidth={1.7} aria-hidden="true" />}
            </button>
          </Tooltip>
          <Tooltip label="Close panel">
            <button type="button" aria-label="Close panel" onClick={onClose} className={ICON_BUTTON}>
              <PanelRight size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      {shownTab === "preview" && taskId ? (
        <WebsitePreview taskId={taskId} className="min-h-0 flex-1" />
      ) : shownTab === "files" ? (
        <FilesTab taskId={taskId} files={files} calls={calls} selectedId={selectedFileId} onSelect={onSelectFile} listOpen={filesListOpen} onToggleList={onToggleFilesList} />
      ) : (
        <>
          {/* What the agent is doing now */}
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--om-border)] pe-4 ps-4 text-[12px] leading-4 text-[var(--om-text-3)]">
            {control ? (
              <>
                <span className="size-[7px] shrink-0 rounded-full bg-[var(--om-icon-accent)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-[var(--om-text-1)]">You have the controls. {agent} is paused.</span>
                <Tooltip label="Send your clipboard to the desktop">
                  <button type="button" aria-label="Paste on the desktop" disabled={!vnc} onClick={() => void pasteIntoComputer()} className={cn(ICON_BUTTON, "disabled:opacity-40")}>
                    <ClipboardPaste size={16} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </Tooltip>
                <button type="button" onClick={() => setControlChoice(false)} className="flex h-8 shrink-0 cursor-pointer items-center rounded-full bg-[var(--om-btn-primary)] px-3 text-[13px] font-medium leading-[18px] text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90">
                  Give back control
                </button>
              </>
            ) : (
              <>
                {info ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap">
                      In <span className="font-medium text-[var(--om-text-2)]">{info.app}</span>
                    </span>
                    <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[var(--om-border-strong)]" />
                    <span className="min-w-0 flex-1 truncate" title={[info.verb, info.target].filter(Boolean).join(" ")}>
                      {info.verb}
                      {info.verb && info.target ? " " : ""}
                      <span className={cn(info.mono && "font-mono")}>{info.target}</span>
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{busy ? `${agent} is warming up` : "The desktop is idle"}</span>
                )}
                <Tooltip label={streamUsable ? "Take the controls" : "You can take the controls once the screen is connected"}>
                  <button
                    type="button"
                    aria-label="Take the controls"
                    aria-disabled={!streamUsable}
                    onClick={() => {
                      if (!streamUsable) return;
                      onSelectCall(null);
                      setControlChoice(true);
                    }}
                    className={cn(ICON_BUTTON, "-me-1", !streamUsable && "cursor-default opacity-40 hover:bg-transparent hover:text-[var(--om-icon-2)]")}
                  >
                    <MonitorPlay size={17} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </Tooltip>
              </>
            )}
          </div>

          {/* Screen */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {vncUrl && streamError === null ? (
              <div className={cn("absolute inset-0", !showStream && "invisible")}>
                <VncViewer key={attempt} url={vncUrl} interactive={control} onStateChange={onVncState} onReady={setVnc} />
              </div>
            ) : null}
            {!showStream ? (
              shownCall ? (
                <div className={cn("absolute inset-0", streamError !== null && live && "top-9")}>
                  <ToolView call={shownCall} taskId={taskId} files={files} />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="flex size-12 items-center justify-center rounded-[14px] bg-[var(--om-fill)] text-[var(--om-icon-2)]">
                    <Monitor size={22} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span className="text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{computerTitle()}</span>
                  <span className="max-w-[300px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{busy ? `${agent}'s screen shows up here once the first step starts.` : "This task has not used the desktop yet."}</span>
                </div>
              )
            ) : null}
            {/* The live view gave up: say so, keep showing the latest step, and offer another try. */}
            {streamError !== null && live ? (
              <div role="status" className="absolute inset-x-0 top-0 flex h-9 items-center gap-2 border-b border-[var(--om-border)] bg-[var(--om-surface)] pe-2 ps-4 text-[12px] leading-4 text-[var(--om-text-3)]">
                <span className="size-[6px] shrink-0 rounded-full bg-[var(--om-warning)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={`${streamError} The most recent step is shown instead.`}>
                  Screen offline: {streamError.charAt(0).toLowerCase() + streamError.slice(1).replace(/\.$/, "")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStreamError(null);
                    setAttempt((n) => n + 1);
                  }}
                  className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium leading-4 text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill)]"
                >
                  <RotateCw size={12} strokeWidth={1.8} aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : null}
            {control ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-[var(--om-icon-accent)]" /> : null}
            {!live ? (
              <button
                type="button"
                onClick={() => onSelectCall(null)}
                className="tv-rise-in absolute bottom-[10px] left-1/2 flex h-10 -translate-x-1/2 cursor-pointer items-center gap-[6px] rounded-full border border-[var(--om-border)] bg-[var(--om-surface)] pe-4 ps-3 text-[14px] font-medium leading-5 text-[var(--om-text-1)] shadow-[0_5px_16px_var(--om-shadow-md)] outline-none transition-colors hover:bg-[var(--om-fill-solid-raised)] focus-visible:border-[var(--om-border-focus)]"
              >
                <Play size={16} strokeWidth={1.7} aria-hidden="true" />
                Back to now
              </button>
            ) : null}
          </div>

          <Timeline count={calls.length} index={index} live={live} running={busy} onSeek={(i) => onSelectCall(calls[i]?.callId ?? null)} onLive={() => onSelectCall(null)} />
        </>
      )}

      {/* Status */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-t border-[var(--om-border)] pe-2 ps-4">
        <StatusBadge label={label} className="shrink-0" />
        <span className="min-w-2 flex-1" />
        <PlanProgress plan={model.plan} />
      </div>
    </aside>
  );
}
