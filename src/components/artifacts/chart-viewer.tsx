// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Charts: the image the agent rendered, and the data it plotted (`ChartData` JSON) as a sortable table.
 * With data but no image, a plain line or bar chart is drawn from the data.
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { ChartData } from "@/lib/generators/types";
import { DataGrid } from "./table-viewer";
import { ArtifactHeader, DownloadButton, ToolbarButton, ViewerMessage } from "./viewer-chrome";
import type { ArtifactSource, Cell } from "./util";

const PALETTE = ["#4e8cf5", "#f2a33a", "#3fb27f", "#e5655c", "#9b7bf0", "#34b5c9"];

function useChartData(url: string | undefined): { data: ChartData | null; error: string | null } {
  const [state, setState] = useState<{ url: string; data: ChartData | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load the chart data (${r.status}).`))))
      .then((d: ChartData) => {
        if (!cancelled) setState({ url, data: d && Array.isArray(d.columns) && Array.isArray(d.rows) ? d : null, error: null });
      })
      .catch((err: unknown) => !cancelled && setState({ url, data: null, error: err instanceof Error ? err.message : "Could not load the chart data." }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url && state?.url === url ? state : { data: null, error: null };
}

/** A small SVG line or bar chart from chart data: x is the first column (or `x`), each numeric `y` a series. */
export function DrawnChart({ data }: { data: ChartData }) {
  const { xs, series } = useMemo(() => {
    const xi = Math.max(0, data.x ? data.columns.indexOf(data.x) : 0);
    const ys = (Array.isArray(data.y) ? data.y : data.y ? [data.y] : data.columns.filter((_, i) => i !== xi)).map((name) => data.columns.indexOf(name)).filter((i) => i >= 0 && i !== xi);
    const rows = data.rows.slice(0, 400);
    return {
      xs: rows.map((r) => String(r[xi] ?? "")),
      series: ys.map((i) => ({ name: data.columns[i], values: rows.map((r) => (typeof r[i] === "number" ? (r[i] as number) : Number(r[i]) || 0)) })),
    };
  }, [data]);
  if (!series.length || !xs.length) return <ViewerMessage>Nothing to draw.</ViewerMessage>;
  const W = 760, H = 380, L = 56, B = 40, T = 16, R = 16;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
  const bar = data.type === "bar" || data.type === "pie";
  const step = (W - L - R) / xs.length;
  const x = (i: number) => L + step * i + step / 2;
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  return (
    <div className="flex flex-col gap-[8px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-[var(--om-text-3)]" role="img" aria-label="Chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.2} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="currentColor">
              {Math.abs(t) >= 1000 ? `${(t / 1000).toFixed(1)}k` : Number(t.toFixed(2))}
            </text>
          </g>
        ))}
        {xs.map((label, i) => (i % Math.ceil(xs.length / 10) === 0 ? <text key={i} x={x(i)} y={H - B + 18} textAnchor="middle" fontSize={11} fill="currentColor">{label.slice(0, 12)}</text> : null))}
        {series.map((s, si) =>
          bar ? (
            s.values.map((v, i) => {
              const w = (step * 0.8) / series.length;
              return <rect key={`${si}-${i}`} x={x(i) - step * 0.4 + w * si} y={Math.min(y(v), y(0))} width={Math.max(1, w - 2)} height={Math.abs(y(v) - y(0))} fill={PALETTE[si % PALETTE.length]} rx={2} />;
            })
          ) : (
            <polyline key={si} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth={2.5} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          ),
        )}
      </svg>
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-[14px] px-[8px] text-[12px] text-[var(--om-text-2)]">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-[6px]">
              <span className="size-[10px] rounded-[2px]" style={{ background: PALETTE[i % PALETTE.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChartViewer({ title, image, data, caption }: { title: string; image?: ArtifactSource; data?: ArtifactSource; caption?: string }) {
  const [tab, setTab] = useState<"chart" | "data">("chart");
  const loaded = useChartData(data?.url);
  const rows: Cell[][] | null = loaded.data ? [loaded.data.columns, ...loaded.data.rows] : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader
        title={title}
        actions={
          <>
            <ToolbarButton onClick={() => setTab("chart")} active={tab === "chart"}>Chart</ToolbarButton>
            {data ? <ToolbarButton onClick={() => setTab("data")} active={tab === "data"}>Data</ToolbarButton> : null}
            {image?.downloadUrl ? <DownloadButton href={image.downloadUrl} label="PNG" /> : null}
            {data?.downloadUrl ? <DownloadButton href={data.downloadUrl} label="JSON" /> : null}
          </>
        }
      />
      {tab === "chart" ? (
        <div className={cn("min-h-0 flex-1 overflow-auto p-[16px]", image && "flex items-center justify-center bg-[var(--om-bg-2)]")}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={title} className="max-h-full max-w-full rounded-[8px] bg-white object-contain" />
          ) : loaded.data ? (
            <DrawnChart data={loaded.data} />
          ) : (
            <ViewerMessage tone={loaded.error ? "error" : "muted"}>{loaded.error ?? "Loading…"}</ViewerMessage>
          )}
        </div>
      ) : rows ? (
        <DataGrid rows={rows} />
      ) : (
        <ViewerMessage tone={loaded.error ? "error" : "muted"}>{loaded.error ?? "Loading…"}</ViewerMessage>
      )}
      {caption ? <p className="shrink-0 border-t border-[var(--om-border)] px-[16px] py-[10px] text-[13px] text-[var(--om-text-2)]">{caption}</p> : null}
    </div>
  );
}
