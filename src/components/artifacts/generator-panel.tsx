"use client";

/**
 * What a generator task made, in one panel: the slide deck, the analysis (charts, tables, report), the
 * batch research (confirm card, progress, merged table and report) or the audio tracks. Renders nothing
 * for an ordinary task, so it can be mounted for every task.
 */
import { useState, type ReactNode } from "react";
import { BarChart3, FileText, Table2 } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { generatorFileUrl, useGeneratorState } from "@/lib/generators/client";
import type { GeneratorState } from "@/lib/generators/types";
import { AudioPlayer, MarkdownViewer } from "./basic-viewers";
import { ChartViewer } from "./chart-viewer";
import { WideResearchCard } from "./research-card";
import { SlideViewer } from "./slide-viewer";
import { TableViewer } from "./table-viewer";
import { ArtifactHeader, ViewerMessage } from "./viewer-chrome";
import type { ArtifactSource } from "./util";

function src(taskId: string, path: string): ArtifactSource {
  return { name: path.split("/").pop() ?? path, url: generatorFileUrl(taskId, path), downloadUrl: generatorFileUrl(taskId, path, true) };
}

const join = (dir: string, rel: string) => `${dir}/${rel.replace(/^\.?\//, "")}`;

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
  render: () => ReactNode;
}

function Tabs({ tabs, header }: { tabs: Tab[]; header?: ReactNode }) {
  const [active, setActive] = useState(0);
  const at = Math.min(active, tabs.length - 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {tabs.length > 1 ? (
        <div role="tablist" className="flex shrink-0 gap-[4px] overflow-x-auto border-b border-[var(--om-border)] px-[10px] py-[6px]">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={i === at}
              onClick={() => setActive(i)}
              className={cn(
                "flex h-[28px] shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-[8px] px-[10px] text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]",
                i === at && "bg-[var(--om-fill)] font-medium text-[var(--om-text-1)]",
              )}
            >
              {t.icon}
              <span className="max-w-[220px] truncate">{t.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div key={tabs[at]?.id} className="flex min-h-0 flex-1 flex-col">
        {tabs[at]?.render()}
      </div>
    </div>
  );
}

function DataPanel({ taskId, state }: { taskId: string; state: GeneratorState }) {
  const a = state.data;
  if (!a) return <ViewerMessage>The analysis will appear here when the agent writes it.</ViewerMessage>;
  const dir = "analysis";
  const tabs: Tab[] = [
    ...a.charts.map((c, i) => ({
      id: `chart-${i}`,
      label: c.title,
      icon: <BarChart3 size={14} />,
      render: () => <ChartViewer title={c.title} image={src(taskId, join(dir, c.image))} data={c.data ? src(taskId, join(dir, c.data)) : undefined} caption={c.caption} />,
    })),
    ...a.tables.map((t, i) => ({ id: `table-${i}`, label: t.title, icon: <Table2 size={14} />, render: () => <TableViewer source={src(taskId, join(dir, t.file))} title={t.title} /> })),
    ...(a.report ? [{ id: "report", label: "Report", icon: <FileText size={14} />, render: () => <MarkdownViewer source={src(taskId, join(dir, a.report!))} resolve={(p) => generatorFileUrl(taskId, join(dir, p))} /> }] : []),
  ];
  if (!tabs.length) return <ViewerMessage>The agent is still working on the analysis.</ViewerMessage>;
  return <Tabs tabs={tabs} header={a.summary ? <p className="shrink-0 border-b border-[var(--om-border)] px-[14px] py-[10px] text-[13px] leading-[19px] text-[var(--om-text-2)]">{a.summary}</p> : null} />;
}

function ResearchPanel({ taskId, state, refresh }: { taskId: string; state: GeneratorState; refresh: () => void }) {
  const r = state.research;
  if (!r) return null;
  const card = r.plan?.mode === "wide" ? <WideResearchCard taskId={taskId} research={r} onChange={refresh} className="m-[12px]" /> : null;
  const res = r.result;
  const dir = "research";
  const tabs: Tab[] = res
    ? [
        ...(res.table ? [{ id: "table", label: "Table", icon: <Table2 size={14} />, render: () => <TableViewer source={src(taskId, join(dir, res.table!))} title={res.title} /> }] : []),
        ...(res.report ? [{ id: "report", label: "Report", icon: <FileText size={14} />, render: () => <MarkdownViewer source={src(taskId, join(dir, res.report!))} resolve={(p) => generatorFileUrl(taskId, join(dir, p))} /> }] : []),
        ...(res.dataset && res.dataset !== res.table ? [{ id: "dataset", label: "Dataset", icon: <Table2 size={14} />, render: () => <TableViewer source={src(taskId, join(dir, res.dataset!))} /> }] : []),
      ]
    : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {card ? <div className={cn("shrink-0 overflow-y-auto", tabs.length && "max-h-[45%] border-b border-[var(--om-border)]")}>{card}</div> : null}
      {tabs.length ? <Tabs tabs={tabs} /> : !card ? <ViewerMessage>{r.phase === "planning" ? "Planning the research…" : "Researching…"}</ViewerMessage> : null}
    </div>
  );
}

function AudioPanel({ taskId, state }: { taskId: string; state: GeneratorState }) {
  const set = state.audio;
  if (!set?.tracks.length) return <ViewerMessage>The audio will appear here when the agent has made it.</ViewerMessage>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader title={set.title} />
      <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto p-[14px]">
        {set.tracks.map((t, i) => {
          const s = src(taskId, join("audio", t.file));
          const meta = [t.voice, t.durationSec ? `${Math.round(t.durationSec)} s` : ""].filter(Boolean).join(" · ");
          return <AudioPlayer key={i} src={s.url} title={t.title} detail={[meta, t.text].filter(Boolean).join(" — ")} downloadUrl={s.downloadUrl} />;
        })}
      </div>
    </div>
  );
}

export interface GeneratorPanelProps {
  taskId: string;
  /** True while the task runs: the panel polls for new output. */
  live: boolean;
  className?: string;
}

/** The panel for a generator task. Null until known, and for an ordinary task. */
export function GeneratorPanel({ taskId, live, className }: GeneratorPanelProps) {
  const { state, refresh } = useGeneratorState(taskId, live);
  if (!state || !state.kind) return null;
  let body: ReactNode = null;
  if (state.kind === "slides")
    body = state.slides?.deck ? <SlideViewer taskId={taskId} version={state.slides.updatedAt} /> : <ViewerMessage>{state.error ?? "Slides will appear here as the agent writes them."}</ViewerMessage>;
  else if (state.kind === "data") body = <DataPanel taskId={taskId} state={state} />;
  else if (state.kind === "research") body = <ResearchPanel taskId={taskId} state={state} refresh={refresh} />;
  else if (state.kind === "audio") body = <AudioPanel taskId={taskId} state={state} />;
  else body = <ViewerMessage>{state.error ?? "Working…"}</ViewerMessage>;
  return <div className={cn("flex min-h-0 flex-1 flex-col bg-[var(--om-bg)]", className)}>{body}</div>;
}

/** Whether a task is a generator task (for deciding to open the side panel). `undefined` while unknown. */
export function useIsGeneratorTask(taskId: string | null, live: boolean): boolean | undefined {
  const { state } = useGeneratorState(taskId, live, 8000);
  return state ? state.kind !== null : undefined;
}
