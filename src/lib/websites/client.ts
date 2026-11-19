// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Browser helpers for `/api/websites/**`. */
import type { CreateTaskInput, TaskSummary } from "@/lib/agent/types";
import type { DbColumn, DomainsState, PreviewState, ScheduleRun, SiteAnalytics, SiteCheckpoint, SiteDomain, SiteSchedule, SiteSecret, SiteVisibility, Website } from "./types";

export { isWebsitePrompt } from "./contract";

export class SiteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function j<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new SiteRequestError(body?.error || `Request failed (${res.status}).`, res.status, body?.code);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = (id: string) => `/api/websites/${encodeURIComponent(id)}`;

export type SiteAndPreview = { site: Website; preview: PreviewState | null };

export const listWebsites = () => fetch("/api/websites", { cache: "no-store" }).then((r) => j<{ sites: Website[] }>(r));
export const websiteForTask = (taskId: string) =>
  fetch(`/api/websites?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" }).then((r) => j<{ site: Website | null; preview: PreviewState | null }>(r));
/** "Build a website": the composer can call this instead of `createTask` when `isWebsitePrompt(prompt)` is true. */
export const createWebsiteTask = (input: CreateTaskInput & { name?: string }) => fetch("/api/websites", json("POST", input)).then((r) => j<{ site: Website; task: TaskSummary }>(r));
export const getWebsite = (id: string, sync: "1" | "0" | "force" = "1") => fetch(`${base(id)}?sync=${sync}`, { cache: "no-store" }).then((r) => j<SiteAndPreview>(r));
export const updateWebsite = (id: string, patch: { name?: string; autoPublish?: boolean; showBadge?: boolean; aiEnabled?: boolean }) => fetch(base(id), json("PATCH", patch)).then((r) => j<{ site: Website }>(r));
export const deleteWebsite = (id: string) => fetch(base(id), { method: "DELETE" }).then((r) => j<{ ok: true }>(r));
export const startPreview = (id: string) => fetch(`${base(id)}/preview`, { method: "POST" }).then((r) => j<SiteAndPreview>(r));
export const stopPreview = (id: string) => fetch(`${base(id)}/preview`, { method: "DELETE" }).then((r) => j<{ site: Website }>(r));
export const publishWebsite = (id: string) => fetch(`${base(id)}/publish`, { method: "POST" }).then((r) => j<{ site: Website }>(r));
export const unpublishWebsite = (id: string) => fetch(`${base(id)}/publish`, { method: "DELETE" }).then((r) => j<{ site: Website }>(r));
export const setVisibility = (id: string, visibility: SiteVisibility, emails?: string[]) => fetch(`${base(id)}/visibility`, json("PUT", { visibility, emails })).then((r) => j<{ site: Website }>(r));
export const listCheckpoints = (id: string) => fetch(`${base(id)}/checkpoints`, { cache: "no-store" }).then((r) => j<{ checkpoints: SiteCheckpoint[] }>(r));
export const saveCheckpoint = (id: string, message?: string) => fetch(`${base(id)}/checkpoints`, json("POST", { message })).then((r) => j<{ checkpoints: SiteCheckpoint[] }>(r));
export const rollbackTo = (id: string, sha: string) => fetch(`${base(id)}/rollback`, json("POST", { sha })).then((r) => j<{ checkpoints: SiteCheckpoint[] }>(r));
export const copyWebsite = (id: string) => fetch(`${base(id)}/copy`, { method: "POST" }).then((r) => j<{ site: Website }>(r));
export const editInNewTask = (id: string, prompt: string) => fetch(`${base(id)}/tasks`, json("POST", { prompt })).then((r) => j<{ task: TaskSummary }>(r));
export const screenshotUrl = (id: string, sha: string) => `${base(id)}/checkpoints/${sha}`;
export const downloadUrl = (id: string) => `${base(id)}/download`;

/* Full-stack features (secrets, database, analytics, schedules, domains). */
type EnvState = "written" | "pending";
export const listSecrets = (id: string) => fetch(`${base(id)}/secrets`, { cache: "no-store" }).then((r) => j<{ secrets: SiteSecret[] }>(r));
export const setSecret = (id: string, name: string, value: string) => fetch(`${base(id)}/secrets`, json("PUT", { name, value })).then((r) => j<{ secrets: SiteSecret[]; env: EnvState }>(r));
export const deleteSecret = (id: string, name: string) => fetch(`${base(id)}/secrets`, json("DELETE", { name })).then((r) => j<{ secrets: SiteSecret[]; env: EnvState }>(r));

export type DbValue = string | number | boolean | null;
export interface DbRows { columns: DbColumn[]; rows: { rowid: number | null; values: DbValue[] }[]; total: number; editable: boolean }
const dbCall = <T>(id: string, body: Record<string, unknown>) => fetch(`${base(id)}/database`, json("POST", body)).then((r) => j<T>(r));
export const dbTables = (id: string) => dbCall<{ tables?: { name: string; rows: number }[]; code?: string; error?: string }>(id, { op: "tables" });
export const dbSchema = (id: string, table: string) => dbCall<{ columns: DbColumn[]; sql: string; editable: boolean }>(id, { op: "schema", table });
export const dbRows = (id: string, table: string, offset = 0, limit = 50) => dbCall<DbRows>(id, { op: "rows", table, offset, limit });
export const dbInsert = (id: string, table: string, values: Record<string, DbValue>) => dbCall<{ ok: true; rowid: number }>(id, { op: "insert", table, values });
export const dbUpdate = (id: string, table: string, rowid: number, values: Record<string, DbValue>) => dbCall<{ ok: true }>(id, { op: "update", table, rowid, values });
export const dbDelete = (id: string, table: string, rowid: number) => dbCall<{ ok: true }>(id, { op: "delete", table, rowid });

export const getAnalytics = (id: string, days: number) => fetch(`${base(id)}/analytics?days=${days}`, { cache: "no-store" }).then((r) => j<SiteAnalytics>(r));

export const getSchedules = (id: string) => fetch(`${base(id)}/schedules`, { cache: "no-store" }).then((r) => j<{ schedules: SiteSchedule[]; runs: ScheduleRun[]; active: boolean }>(r));
export const saveSchedules = (id: string, schedules: (Omit<SiteSchedule, "id"> & { id?: string })[]) => fetch(`${base(id)}/schedules`, json("PUT", { schedules })).then((r) => j<{ schedules: SiteSchedule[] }>(r));
export const runSchedule = (id: string, jobId: string) => fetch(`${base(id)}/schedules`, json("POST", { run: jobId })).then((r) => j<{ ok: true }>(r));

export const getDomains = (id: string) => fetch(`${base(id)}/domains`, { cache: "no-store" }).then((r) => j<DomainsState>(r));
export const addDomain = (id: string, domain: string) => fetch(`${base(id)}/domains`, json("POST", { domain })).then((r) => j<{ domain: SiteDomain }>(r));
export const verifyDomain = (id: string, domainId: string) => fetch(`${base(id)}/domains/${encodeURIComponent(domainId)}`, { method: "POST" }).then((r) => j<{ status: string; message: string | null }>(r));
export const removeDomain = (id: string, domainId: string) => fetch(`${base(id)}/domains/${encodeURIComponent(domainId)}`, { method: "DELETE" }).then((r) => j<{ ok: true }>(r));

/** Starts a browser download of the site's code. */
export function downloadCode(id: string): void {
  const a = document.createElement("a");
  a.href = downloadUrl(id);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
