// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Database browser for a full-stack site: tables, rows (page, add, edit, delete) and schema, run on the user's computer. */
import { Pencil, Plus, RotateCw, Table2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { dbDelete, dbInsert, dbRows, dbSchema, dbTables, dbUpdate, type DbRows, type DbValue } from "@/lib/websites/client";
import type { DbColumn, Website } from "@/lib/websites/types";
import { BTN, BTN_PRIMARY, Card, INPUT, Muted, errorText } from "./site-ui";

const PAGE = 50;

function show(v: DbValue): string {
  if (v === null) return "NULL";
  return String(v);
}

/** Text from a form field to a value: empty is NULL; numbers stay numbers for numeric columns. */
function parse(col: DbColumn, raw: string): DbValue {
  if (raw === "") return null;
  if (/INT|REAL|NUM|FLOA|DOUB/i.test(col.type) && raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function RowForm({ columns, initial, onCancel, onSave }: { columns: DbColumn[]; initial?: DbValue[]; onCancel: () => void; onSave: (values: Record<string, DbValue>) => Promise<void> }) {
  const editable = columns.map((c, i) => ({ c, i })).filter(({ c }) => !c.masked && !(c.pk && /INT/i.test(c.type) && !initial));
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(editable.map(({ c, i }) => [c.name, initial && initial[i] !== null ? String(initial[i]) : ""])));
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-[8px] rounded-[10px] border border-[var(--om-border)] p-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        const values: Record<string, DbValue> = {};
        for (const { c, i } of editable) {
          const before = initial ? (initial[i] === null ? "" : String(initial[i])) : "";
          if (!initial && draft[c.name] === "") continue;
          if (initial && draft[c.name] === before) continue;
          values[c.name] = parse(c, draft[c.name]);
        }
        if (!Object.keys(values).length) return onCancel();
        setBusy(true);
        void onSave(values).finally(() => setBusy(false));
      }}
    >
      {editable.map(({ c }) => (
        <label key={c.name} className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-[8px] text-[13px]">
          <span className="truncate text-[var(--om-text-2)]">
            {c.name} <span className="text-[var(--om-text-3)]">{c.type}</span>
          </span>
          <input className={INPUT} value={draft[c.name] ?? ""} placeholder={c.notnull ? "required" : "NULL"} onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))} />
        </label>
      ))}
      <div className="flex justify-end gap-[8px]">
        <button type="button" className={BTN} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
          {initial ? "Save row" : "Add row"}
        </button>
      </div>
    </form>
  );
}

export function SiteDatabase({ site }: { site: Website }) {
  const [tables, setTables] = useState<{ name: string; rows: number }[] | null>(null);
  const [noDb, setNoDb] = useState(false);
  const [table, setTable] = useState<string | null>(null);
  const [view, setView] = useState<"rows" | "schema">("rows");
  const [data, setData] = useState<DbRows | null>(null);
  const [schema, setSchema] = useState<{ columns: DbColumn[]; sql: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    try {
      const r = await dbTables(site.id);
      if (r.code === "no_db") return setNoDb(true);
      setNoDb(false);
      setTables(r.tables ?? []);
      setTable((t) => t ?? r.tables?.find((x) => !["sessions"].includes(x.name))?.name ?? r.tables?.[0]?.name ?? null);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The database could not be read."));
    }
  }, [site.id]);

  const loadTable = useCallback(async () => {
    if (!table) return;
    try {
      if (view === "rows") setData(await dbRows(site.id, table, offset, PAGE));
      else setSchema(await dbSchema(site.id, table));
      setError(null);
    } catch (err) {
      setError(errorText(err, "The table could not be read."));
    }
  }, [site.id, table, view, offset]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadTables(), 0);
    return () => window.clearTimeout(t);
  }, [loadTables]);
  useEffect(() => {
    const t = window.setTimeout(() => void loadTable(), 0);
    return () => window.clearTimeout(t);
  }, [loadTable]);

  const refresh = async () => {
    await loadTables();
    await loadTable();
  };

  if (noDb) return <Muted>This site has no database yet. Full-stack sites get one the first time their server starts.</Muted>;

  return (
    <div className="grid grid-cols-1 gap-[16px] min-[760px]:grid-cols-[200px_minmax(0,1fr)]">
      <Card className="self-start p-[8px]">
        <div className="flex flex-col gap-[2px]">
          {(tables ?? []).map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => {
                setTable(t.name);
                setOffset(0);
                setEditing(null);
              }}
              className={cn("flex items-center justify-between gap-[8px] rounded-[8px] px-[8px] py-[6px] text-left text-[13px]", table === t.name ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-2)] hover:bg-[var(--om-fill)]")}
            >
              <span className="flex min-w-0 items-center gap-[6px]">
                <Table2 size={14} aria-hidden className="shrink-0" />
                <span className="truncate">{t.name}</span>
              </span>
              <span className="tabular-nums text-[12px] text-[var(--om-text-3)]">{t.rows}</span>
            </button>
          ))}
          {tables && !tables.length ? <Muted>No tables yet.</Muted> : null}
        </div>
      </Card>

      <Card
        title={table ?? "Database"}
        actions={
          <>
            <div className="flex gap-[2px] rounded-[9px] border border-[var(--om-border)] p-[2px]">
              {(["rows", "schema"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={cn("h-[24px] rounded-[7px] px-[8px] text-[12px]", view === v ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-3)]")}>
                  {v === "rows" ? "Rows" : "Columns"}
                </button>
              ))}
            </div>
            {view === "rows" && data?.editable ? (
              <button type="button" className={BTN} onClick={() => setEditing("new")}>
                <Plus size={14} aria-hidden /> Add row
              </button>
            ) : null}
            <button type="button" aria-label="Refresh" className={BTN} onClick={() => void refresh()}>
              <RotateCw size={14} aria-hidden />
            </button>
          </>
        }
      >
        {error ? <Muted>{error}</Muted> : null}
        {view === "schema" && schema ? (
          <div className="flex flex-col gap-[12px]">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-[var(--om-text-3)]">
                <tr>
                  <th className="py-[4px] font-normal">Column</th>
                  <th className="font-normal">Type</th>
                  <th className="font-normal">Required</th>
                  <th className="font-normal">Default</th>
                  <th className="font-normal">Key</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((c) => (
                  <tr key={c.name} className="border-t border-[var(--om-border-subtle)] text-[var(--om-text-1)]">
                    <td className="py-[6px] font-mono">{c.name}</td>
                    <td>{c.type || "any"}</td>
                    <td>{c.notnull ? "yes" : ""}</td>
                    <td className="font-mono text-[12px]">{c.default === null ? "" : String(c.default)}</td>
                    <td>{c.pk ? "primary" : c.masked ? "protected" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <pre className="overflow-x-auto rounded-[8px] bg-[var(--om-fill)] p-[10px] text-[12px] text-[var(--om-text-2)]">{schema.sql}</pre>
          </div>
        ) : null}
        {view === "rows" && data && table ? (
          <div className="flex flex-col gap-[10px]">
            {editing === "new" ? (
              <RowForm
                columns={data.columns}
                onCancel={() => setEditing(null)}
                onSave={async (values) => {
                  try {
                    await dbInsert(site.id, table, values);
                    setEditing(null);
                    toast("Row added.", "success");
                    await refresh();
                  } catch (err) {
                    toast(errorText(err), "error");
                  }
                }}
              />
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-[var(--om-text-3)]">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c.name} className="whitespace-nowrap px-[6px] py-[4px] font-normal">
                        {c.name}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) =>
                    editing === r.rowid && r.rowid !== null ? (
                      <tr key={`e${r.rowid}`}>
                        <td colSpan={data.columns.length + 1} className="py-[6px]">
                          <RowForm
                            columns={data.columns}
                            initial={r.values}
                            onCancel={() => setEditing(null)}
                            onSave={async (values) => {
                              try {
                                await dbUpdate(site.id, table, r.rowid!, values);
                                setEditing(null);
                                toast("Row saved.", "success");
                                await loadTable();
                              } catch (err) {
                                toast(errorText(err), "error");
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.rowid ?? i} className="border-t border-[var(--om-border-subtle)] text-[var(--om-text-1)]">
                        {r.values.map((v, j) => (
                          <td key={j} className={cn("max-w-[260px] truncate px-[6px] py-[6px]", v === null && "text-[var(--om-text-3)]")} title={show(v)}>
                            {show(v)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-[6px] text-right">
                          {data.editable && r.rowid !== null ? (
                            <>
                              <button type="button" aria-label="Edit row" className="rounded-[6px] p-[4px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]" onClick={() => setEditing(r.rowid)}>
                                <Pencil size={14} aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label="Delete row"
                                className="rounded-[6px] p-[4px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]"
                                onClick={() => {
                                  if (!window.confirm("Delete this row? This cannot be undone.")) return;
                                  void dbDelete(site.id, table, r.rowid!)
                                    .then(refresh)
                                    .catch((err: unknown) => toast(errorText(err), "error"));
                                }}
                              >
                                <Trash2 size={14} aria-hidden />
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!data.rows.length ? <Muted>No rows.</Muted> : null}
            </div>
            <div className="flex items-center justify-between text-[12px] text-[var(--om-text-3)]">
              <span>
                {data.total ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}` : "0 rows"} · newest first
              </span>
              <span className="flex gap-[6px]">
                <button type="button" className={BTN} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  Previous
                </button>
                <button type="button" className={BTN} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
                  Next
                </button>
              </span>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
