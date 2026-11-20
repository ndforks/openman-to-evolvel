// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The slide deck viewer: filmstrip, the current slide, speaker notes, present mode (full screen, arrow
 * keys, N for notes) and export to PDF, PPTX or a single web page, made on the user's computer.
 * Each slide arrives as one self-contained HTML document and renders in a sandboxed frame.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2, MonitorPlay, NotebookText, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { exportDeck, fetchDeck, generatorFileUrl } from "@/lib/generators/client";
import type { DeckBundle, ExportFormat } from "@/lib/generators/types";
import { MarkdownBody } from "./basic-viewers";
import { ArtifactHeader, ToolbarButton, ViewerMessage } from "./viewer-chrome";

const W = 1280;
const H = 720;

/** One slide at any width: a 1280 x 720 frame scaled down to fit. */
export function SlideFrame({ html, width, interactive = false, className }: { html: string; width: number; interactive?: boolean; className?: string }) {
  const scale = width / W;
  return (
    <div className={cn("relative shrink-0 overflow-hidden", className)} style={{ width, height: Math.round(H * scale) }}>
      <iframe
        title="Slide"
        srcDoc={html}
        sandbox="allow-scripts"
        tabIndex={-1}
        className={cn("absolute left-0 top-0 origin-top-left border-0", !interactive && "pointer-events-none")}
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/** A callback ref plus the element's inner size, kept current with a ResizeObserver. */
function useSize<T extends HTMLElement>(): [(el: T | null) => void, number, number] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setSize([el.clientWidth, el.clientHeight]);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size[0], size[1]];
}

const fit = (w: number, h: number) => Math.max(0, Math.floor(Math.min(w, (h * W) / H)));

function Present({ bundle, start, onClose }: { bundle: DeckBundle; start: number; onClose: (at: number) => void }) {
  const [i, setI] = useState(start);
  const [notes, setNotes] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const n = bundle.html.length;
  useEffect(() => {
    const el = ref.current;
    void el?.requestFullscreen?.().catch(() => undefined);
    const measure = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose(i);
  }, [i, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) setI((x) => Math.min(n - 1, x + 1));
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) setI((x) => Math.max(0, x - 1));
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(n - 1);
      else if (e.key === "n" || e.key === "N") setNotes((v) => !v);
      else if (e.key === "Escape") close();
      else return;
      e.preventDefault();
    };
    const onFs = () => {
      if (!document.fullscreenElement) onClose(i);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [n, close, onClose, i]);
  const note = bundle.deck.slides[i]?.notes;
  const notesH = notes && note ? Math.min(220, vh * 0.28) : 0;
  return (
    <div ref={ref} className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black" onClick={() => setI((x) => Math.min(n - 1, x + 1))}>
      <SlideFrame html={bundle.html[i] ?? ""} width={fit(vw, vh - notesH)} />
      {notesH ? (
        <div className="w-full overflow-auto bg-[#141414] px-[28px] py-[14px] text-[16px] leading-[24px] text-[#ddd]" style={{ height: notesH }} onClick={(e) => e.stopPropagation()}>
          <MarkdownBody text={note ?? ""} className="text-[16px] text-[#ddd]" />
        </div>
      ) : null}
      <div className="absolute right-[16px] top-[12px] flex items-center gap-[8px] text-[13px] text-white/60" onClick={(e) => e.stopPropagation()}>
        <span>
          {i + 1} / {n} · N notes · Esc to exit
        </span>
        <button type="button" aria-label="Exit presentation" onClick={close} className="flex size-[30px] cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export interface SlideViewerProps {
  taskId: string;
  /** The deck's last change (`GeneratorState.slides.updatedAt`); a new value reloads the deck. */
  version: number;
  className?: string;
}

export function SlideViewer({ taskId, version, className }: SlideViewerProps) {
  const [bundle, setBundle] = useState<DeckBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [made, setMade] = useState<Partial<Record<ExportFormat, string>>>({});
  const [stageRef, sw, sh] = useSize<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    fetchDeck(taskId, version)
      .then((b) => {
        if (cancelled) return;
        setBundle(b);
        setMade(b.exports ?? {});
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the deck."));
    return () => {
      cancelled = true;
    };
  }, [taskId, version]);

  const n = bundle?.html.length ?? 0;
  const at = Math.min(current, Math.max(0, n - 1));
  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setCurrent((x) => Math.min(n - 1, x + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setCurrent((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, presenting]);

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    setExportError(null);
    try {
      const { path, url } = await exportDeck(taskId, format);
      setMade((m) => ({ ...m, [format]: path }));
      window.location.assign(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setExporting(null);
    }
  };

  if (error && !bundle) return <ViewerMessage tone="error">{error}</ViewerMessage>;
  if (!bundle) return <ViewerMessage>Loading slides…</ViewerMessage>;
  const slide = bundle.deck.slides[at];
  const formats: { id: ExportFormat; label: string }[] = [
    { id: "pdf", label: "PDF" },
    { id: "pptx", label: "PPTX" },
    { id: "html", label: "Web" },
  ];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <ArtifactHeader
        title={bundle.deck.title || "Slides"}
        actions={
          <>
            <span className="me-[4px] text-[12px] tabular-nums text-[var(--om-text-3)]">
              {n ? at + 1 : 0} / {n}
            </span>
            <ToolbarButton onClick={() => setShowNotes((v) => !v)} active={showNotes} title="Speaker notes">
              <NotebookText size={14} />
              <span className="max-sm:hidden">Notes</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => setPresenting(true)} disabled={!n} title="Present">
              <MonitorPlay size={14} />
              <span className="max-sm:hidden">Present</span>
            </ToolbarButton>
            {formats.map((f) => (
              <span key={f.id} className="flex items-center">
                <ToolbarButton onClick={() => void runExport(f.id)} disabled={!!exporting || !n} title={`Export ${f.label}`}>
                  {exporting === f.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  {f.label}
                </ToolbarButton>
                {made[f.id] ? (
                  <a href={generatorFileUrl(taskId, made[f.id]!, true)} className="sr-only">
                    Download last {f.label}
                  </a>
                ) : null}
              </span>
            ))}
          </>
        }
      />
      {exportError ? <p className="shrink-0 border-b border-[var(--om-border)] px-[12px] py-[6px] text-[13px] text-[var(--om-danger)]">{exportError}</p> : null}
      {exporting ? <p className="shrink-0 border-b border-[var(--om-border)] px-[12px] py-[6px] text-[13px] text-[var(--om-text-3)]">Exporting {exporting.toUpperCase()} on your computer. This takes about a second per slide.</p> : null}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[148px] shrink-0 flex-col gap-[10px] overflow-y-auto border-e border-[var(--om-border)] p-[10px] max-sm:hidden" aria-label="Slides">
          {bundle.html.map((html, i) => (
            <button key={i} type="button" onClick={() => setCurrent(i)} aria-label={`Slide ${i + 1}: ${bundle.deck.slides[i]?.title ?? ""}`} aria-current={i === at} className="flex cursor-pointer items-start gap-[6px] text-start">
              <span className={cn("w-[14px] shrink-0 pt-[2px] text-end text-[11px] tabular-nums", i === at ? "text-[var(--om-text-1)]" : "text-[var(--om-text-3)]")}>{i + 1}</span>
              <span className={cn("overflow-hidden rounded-[6px] ring-1 ring-[var(--om-border)]", i === at && "ring-2 ring-[var(--om-border-focus)]")}>
                <SlideFrame html={html} width={112} />
              </span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-[var(--om-bg-2)] p-[16px]">
            {n ? (
              <>
                <div className="overflow-hidden rounded-[8px] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
                  <SlideFrame html={bundle.html[at] ?? ""} width={fit(sw - 32, sh - 32)} interactive />
                </div>
                <button type="button" aria-label="Previous slide" disabled={at === 0} onClick={() => setCurrent(at - 1)} className="absolute left-[6px] top-1/2 flex size-[32px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--om-surface)] text-[var(--om-icon-2)] shadow disabled:opacity-0">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" aria-label="Next slide" disabled={at >= n - 1} onClick={() => setCurrent(at + 1)} className="absolute right-[6px] top-1/2 flex size-[32px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--om-surface)] text-[var(--om-icon-2)] shadow disabled:opacity-0">
                  <ChevronRight size={18} />
                </button>
              </>
            ) : (
              <ViewerMessage>The agent has not written any slides yet.</ViewerMessage>
            )}
          </div>
          {showNotes && slide ? (
            <div className="max-h-[32%] shrink-0 overflow-y-auto border-t border-[var(--om-border)] px-[16px] py-[10px]">
              <p className="mb-[4px] text-[11px] font-medium uppercase tracking-[.08em] text-[var(--om-text-3)]">Speaker notes · {slide.title}</p>
              {slide.notes ? <MarkdownBody text={slide.notes} className="text-[14px] leading-[21px] [&_p]:my-[4px]" /> : <p className="text-[13px] text-[var(--om-text-3)]">No notes for this slide.</p>}
            </div>
          ) : null}
        </div>
      </div>
      {presenting ? (
        <Present
          bundle={bundle}
          start={at}
          onClose={(i) => {
            setPresenting(false);
            setCurrent(i);
          }}
        />
      ) : null}
    </div>
  );
}
