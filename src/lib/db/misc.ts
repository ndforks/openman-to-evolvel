/**
 * Repositories for automations (and their runs), mailboxes, phone numbers and websites.
 * Rows come back camel-cased; every call is scoped by `userId`.
 */
import { db, fail, iso } from "./client";

type Row = Record<string, unknown>;

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const TIME = /(_at)$/;

function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id") continue;
    out[camel(k)] = TIME.test(k) && typeof v === "string" ? iso(v) : v;
  }
  return out as T;
}
function toRow(patch: Row, allowed: readonly string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && allowed.includes(k)) out[snake(k)] = v;
  return out;
}

function repo<T, I extends Row>(table: string, writable: readonly string[], order: { column: string; ascending: boolean }) {
  return {
    async list(userId: string, filter: Row = {}): Promise<T[]> {
      let q = db().from(table).select("*").eq("user_id", userId);
      for (const [k, v] of Object.entries(filter)) q = q.eq(snake(k), v as string);
      const { data, error } = await q.order(order.column, { ascending: order.ascending }).limit(500);
      if (error) fail(`list ${table}`, error);
      return (data as Row[]).map((r) => fromRow<T>(r));
    },
    async get(userId: string, id: string): Promise<T | null> {
      const { data, error } = await db().from(table).select("*").eq("user_id", userId).eq("id", id).maybeSingle();
      if (error) fail(`get ${table}`, error);
      return data ? fromRow<T>(data as Row) : null;
    },
    async create(userId: string, input: I): Promise<T> {
      const { data, error } = await db().from(table).insert({ ...toRow(input, writable), user_id: userId }).select("*").single();
      if (error) fail(`create ${table}`, error);
      return fromRow<T>(data as Row);
    },
    async update(userId: string, id: string, patch: Partial<I>): Promise<T | null> {
      const row = toRow(patch as Row, writable);
      if (Object.keys(row).length === 0) return this.get(userId, id);
      const { data, error } = await db().from(table).update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
      if (error) fail(`update ${table}`, error);
      return data ? fromRow<T>(data as Row) : null;
    },
    async remove(userId: string, id: string): Promise<boolean> {
      const { data, error } = await db().from(table).delete().eq("user_id", userId).eq("id", id).select("id");
      if (error) fail(`delete ${table}`, error);
      return (data ?? []).length > 0;
    },
  };
}

// ------------------------------------------------------------------ automations

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  /** Cron expression or a plain schedule description the UI understands. */
  schedule: string;
  timezone: string;
  mode: string;
  projectId: string | null;
  connectors: string[];
  enabled: boolean;
  externalId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type AutomationInput = Partial<Pick<Automation, "name" | "prompt" | "schedule" | "timezone" | "mode" | "projectId" | "connectors" | "enabled" | "externalId" | "lastRunAt" | "nextRunAt">>;
export const automations = repo<Automation, AutomationInput & Row>(
  "automations",
  ["name", "prompt", "schedule", "timezone", "mode", "projectId", "connectors", "enabled", "externalId", "lastRunAt", "nextRunAt"],
  { column: "created_at", ascending: true },
);

export interface AutomationRun {
  id: string;
  automationId: string;
  taskId: string | null;
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
export type AutomationRunInput = Partial<Pick<AutomationRun, "automationId" | "taskId" | "status" | "error" | "startedAt" | "finishedAt">>;
export const automationRuns = repo<AutomationRun, AutomationRunInput & Row>(
  "automation_runs",
  ["automationId", "taskId", "status", "error", "startedAt", "finishedAt"],
  { column: "started_at", ascending: false },
);

// ------------------------------------------------------------------ mailboxes, phone numbers, websites

export interface Mailbox {
  id: string;
  address: string;
  displayName: string;
  provider: string;
  externalId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type MailboxInput = Partial<Pick<Mailbox, "address" | "displayName" | "provider" | "externalId" | "enabled">>;
export const mailboxes = repo<Mailbox, MailboxInput & Row>("mailboxes", ["address", "displayName", "provider", "externalId", "enabled"], {
  column: "created_at",
  ascending: true,
});

export interface PhoneNumber {
  id: string;
  number: string;
  label: string;
  provider: string;
  externalId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type PhoneNumberInput = Partial<Pick<PhoneNumber, "number" | "label" | "provider" | "externalId" | "enabled">>;
export const phoneNumbers = repo<PhoneNumber, PhoneNumberInput & Row>("phone_numbers", ["number", "label", "provider", "externalId", "enabled"], {
  column: "created_at",
  ascending: true,
});

export interface Website {
  id: string;
  name: string;
  slug: string | null;
  taskId: string | null;
  computerId: string | null;
  url: string | null;
  status: "draft" | "publishing" | "published" | "failed" | "unpublished";
  createdAt: string;
  updatedAt: string;
}
export type WebsiteInput = Partial<Pick<Website, "name" | "slug" | "taskId" | "computerId" | "url" | "status">>;
export const websites = repo<Website, WebsiteInput & Row>("websites", ["name", "slug", "taskId", "computerId", "url", "status"], {
  column: "created_at",
  ascending: false,
});
