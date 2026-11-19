// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Tables (CSV, TSV, XLSX): sheet tabs, a filter box, and sort by any column. */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ArtifactHeader, ViewerMessage } from "./viewer-chrome";
import { loadTable, type ArtifactSource, type Cell, type Sheet } from "./util";

const SHOWN = 1000;

const fmt = (v: Cell) => (v === null ? "" : typeof v === "number" ? (Number.isInteger(v) && v >= 1000 && v <= 2200 ? String(v) : Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 })) : v);

/** The grid itself, for any rows (the first row is the header). Used by the table and chart viewers. */
export function DataGrid({ rows, className }: { rows: Cell[][]; className?: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const header = rows[0] ?? [];
  const width = Math.max(header.length, ...rows.slice(1, 200).map((r) => r.length));
  const body = useMemo(() => {
    let list = rows.slice(1);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => r.some((c) => c !== null && String(c).toLowerCase().includes(q)));
    if (sort) {
      const { col, dir } = sort;
      list = [...list].sort((a, b) => {
        const x = a[col] ?? null;
        const y = b[col] ?? null;
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
      });
    }
    return list;
  }, [rows, query, sort]);
  const numeric = useMemo(() => Array.from({ length: width }, (_, i) => rows.slice(1, 60).filter((r) => r[i] !== null && r[i] !== undefined).every((r) => typeof r[i] === "number")), [rows, width]);

  const toggle = (col: number) => setSort((s) => (s?.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-[8px] border-b border-[var(--om-border)] px-[12px] py-[8px]">
        <label className="flex h-[30px] min-w-0 flex-1 items-center gap-[6px] rounded-[8px] border border-[var(--om-border)] px-[8px] focus-within:border-[var(--om-border-focus)]">
          <Search size={14} className="shrink-0 text-[var(--om-icon-3)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter rows" className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-3)]" />
        </label>
        <span className="shrink-0 text-[12px] text-[var(--om-text-3)]">
          {body.length.toLocaleString()} {body.length === 1 ? "row" : "rows"}
          {query ? ` of ${(rows.length - 1).toLocaleString()}` : ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[13px] leading-[18px]">
          <thead className="sticky top-0 z-[1] bg-[var(--om-surface)]">
            <tr>
              <th className="w-[1%] border-b border-e border-[var(--om-border)] px-[8px] py-[7px] text-end font-normal text-[var(--om-text-3)]">#</th>
              {Array.from({ length: width }, (_, i) => (
                <th key={i} className="border-b border-e border-[var(--om-border)] p-0 text-start font-medium text-[var(--om-text-1)]">
                  <button type="button" onClick={() => toggle(i)} className={cn("flex w-full cursor-pointer items-center gap-[4px] whitespace-nowrap px-[10px] py-[7px] hover:bg-[var(--om-fill)]", numeric[i] && "justify-end")}>
                    <span className="truncate">{header[i] === null || header[i] === undefined ? `Column ${i + 1}` : String(header[i])}</span>
                    {sort?.col === i ? sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.slice(0, SHOWN).map((row, r) => (
              <tr key={r} className="hover:bg-[var(--om-fill-subtle)]">
                <td className="border-b border-e border-[var(--om-border)] px-[8px] py-[6px] text-end text-[var(--om-text-3)]">{r + 1}</td>
                {Array.from({ length: width }, (_, i) => (
                  <td key={i} className={cn("max-w-[360px] truncate border-b border-e border-[var(--om-border)] px-[10px] py-[6px] text-[var(--om-text-1)]", numeric[i] && "text-end tabular-nums")} title={row[i] === null || row[i] === undefined ? undefined : String(row[i])}>
                    {fmt(row[i] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {body.length > SHOWN ? <p className="p-[12px] text-[12px] text-[var(--om-text-3)]">Showing the first {SHOWN.toLocaleString()} rows. Filter to narrow down, or download the file.</p> : null}
      </div>
    </div>
  );
}

export function TableViewer({ source, title }: { source: ArtifactSource; title?: string }) {
  const [sheets, setSheets] = useState<{ url: string; sheets: Sheet[] } | null>(null);
  const [error, setError] = useState<{ url: string; message: string } | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadTable(source)
      .then((s) => !cancelled && setSheets({ url: source.url, sheets: s }))
      .catch((err: unknown) => !cancelled && setError({ url: source.url, message: err instanceof Error ? err.message : "Could not read the table." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.url]);
  const loaded = sheets?.url === source.url ? sheets.sheets : null;
  const failed = error?.url === source.url ? error.message : null;
  const sheet = loaded?.[Math.min(active, (loaded?.length ?? 1) - 1)];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} title={title} />
      {failed ? (
        <ViewerMessage tone="error">{failed}</ViewerMessage>
      ) : !sheet ? (
        <ViewerMessage>Loading…</ViewerMessage>
      ) : (
        <>
          <DataGrid key={`${source.url}:${active}`} rows={sheet.rows} />
          {loaded && loaded.length > 1 ? (
            <div role="tablist" className="flex shrink-0 gap-[2px] overflow-x-auto border-t border-[var(--om-border)] px-[8px] py-[6px]">
              {loaded.map((s, i) => (
                <button
                  key={s.name + i}
                  role="tab"
                  aria-selected={i === active}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn("cursor-pointer whitespace-nowrap rounded-[6px] px-[10px] py-[4px] text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]", i === active && "bg-[var(--om-fill)] font-medium text-[var(--om-text-1)]")}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
