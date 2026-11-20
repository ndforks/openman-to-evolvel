// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Websites the agent builds on the user's computer. Every query is scoped by `user_id`. */
import type { SiteSchedule, SiteSecret, SiteStatus, SiteTemplate, SiteVisibility, Website } from "@/lib/websites/types";
import { db, fail, iso } from "./client";

/** Server-only bookkeeping kept in `meta`; never sent to the browser as is. */
export interface WebsiteMeta {
  taskIds?: string[];
  previewUrlId?: string | null;
  /** The user stopped the preview: sync does not restart the dev server until they start it again. */
  previewStopped?: boolean;
  publishedUrlId?: string | null;
  publishedAppId?: string | null;
  publishedSha?: string | null;
  error?: string | null;
  invited?: string[];
  /** Latest version with a screenshot, used as the site's thumbnail. */
  thumbSha?: string | null;
  /** From the agent's marker (full-stack sites). */
  features?: string[];
  /** AI features in the built app (written into the site's env as OM_AI_ENABLED). */
  aiEnabled?: boolean;
  /** Scheduled jobs (the source of truth; mirrored to `.openman/schedules.json` on the computer). */
  schedules?: SiteSchedule[];
  /** Secrets changed while the computer slept: the env file is rewritten at the next start. */
  envDirty?: boolean;
}

export interface WebsiteRow {
  id: string;
  user_id: string;
  name: string;
  slug: string | null;
  task_id: string | null;
  computer_id: string | null;
  url: string | null;
  status: SiteStatus;
  folder: string | null;
  template: SiteTemplate | null;
  dev_port: number | null;
  prod_port: number | null;
  preview_url: string | null;
  published_url: string | null;
  visibility: SiteVisibility;
  auto_publish: boolean;
  show_badge: boolean;
  published_at: string | null;
  meta: WebsiteMeta;
  created_at: string;
  updated_at: string;
}

export function toWebsite(r: WebsiteRow): Website {
  const meta = r.meta ?? {};
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    taskId: r.task_id,
    computerId: r.computer_id,
    folder: r.folder,
    template: r.template,
    devPort: r.dev_port,
    prodPort: r.prod_port,
    previewUrl: r.preview_url,
    publishedUrl: r.published_url,
    visibility: r.visibility,
    autoPublish: r.auto_publish,
    showBadge: r.show_badge,
    status: r.status,
    publishedAt: r.published_at ? iso(r.published_at) : null,
    publishedSha: meta.publishedSha ?? null,
    taskIds: meta.taskIds ?? (r.task_id ? [r.task_id] : []),
    error: meta.error ?? null,
    thumbSha: meta.thumbSha ?? null,
    features: meta.features ?? [],
    aiEnabled: !!meta.aiEnabled,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function listWebsiteRows(userId: string): Promise<WebsiteRow[]> {
  const { data, error } = await db().from("websites").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail("list websites", error);
  return (data ?? []) as WebsiteRow[];
}

export async function getWebsiteRow(userId: string, id: string): Promise<WebsiteRow | null> {
  const { data, error } = await db().from("websites").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get website", error);
  return (data as WebsiteRow | null) ?? null;
}

/** The site a task works on: its own task id, or one listed in `meta.taskIds` (an "Edit in new task"). */
export async function getWebsiteRowForTask(userId: string, taskId: string): Promise<WebsiteRow | null> {
  const direct = await db().from("websites").select("*").eq("user_id", userId).eq("task_id", taskId).limit(1).maybeSingle();
  if (direct.error) fail("get website for task", direct.error);
  if (direct.data) return direct.data as WebsiteRow;
  const viaMeta = await db().from("websites").select("*").eq("user_id", userId).contains("meta", { taskIds: [taskId] }).limit(1).maybeSingle();
  if (viaMeta.error) fail("get website for task", viaMeta.error);
  return (viaMeta.data as WebsiteRow | null) ?? null;
}

/** Ports already taken by the user's sites on one computer. */
export async function usedPorts(userId: string, computerId: string): Promise<Set<number>> {
  const { data, error } = await db().from("websites").select("dev_port,prod_port").eq("user_id", userId).eq("computer_id", computerId);
  if (error) fail("list website ports", error);
  const out = new Set<number>();
  for (const r of (data ?? []) as { dev_port: number | null; prod_port: number | null }[]) {
    if (r.dev_port) out.add(r.dev_port);
    if (r.prod_port) out.add(r.prod_port);
  }
  return out;
}

export async function insertWebsiteRow(userId: string, row: Partial<WebsiteRow> & { id: string; name: string }): Promise<WebsiteRow> {
  const { data, error } = await db()
    .from("websites")
    .insert({ ...row, user_id: userId })
    .select("*")
    .single();
  if (error) fail("create website", error);
  return data as WebsiteRow;
}

export async function updateWebsiteRow(userId: string, id: string, patch: Partial<Omit<WebsiteRow, "id" | "user_id">>): Promise<WebsiteRow | null> {
  const { data, error } = await db().from("websites").update(patch).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update website", error);
  return (data as WebsiteRow | null) ?? null;
}

export async function deleteWebsiteRow(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("websites").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete website", error);
  return (data ?? []).length > 0;
}

/* ---------------------------------------------------------------- secrets (website_secrets) */

/** Names only, never values. */
export async function listWebsiteSecrets(userId: string, websiteId: string): Promise<SiteSecret[]> {
  const { data, error } = await db().from("website_secrets").select("name,updated_at").eq("user_id", userId).eq("website_id", websiteId).order("name");
  if (error) fail("list website secrets", error);
  return ((data ?? []) as { name: string; updated_at: string }[]).map((r) => ({ name: r.name, updatedAt: iso(r.updated_at) }));
}

/** Sealed values, for writing the env file on the user's computer. Server only. */
export async function sealedWebsiteSecrets(userId: string, websiteId: string): Promise<{ name: string; valueEnc: string }[]> {
  const { data, error } = await db().from("website_secrets").select("name,value_enc").eq("user_id", userId).eq("website_id", websiteId);
  if (error) fail("read website secrets", error);
  return ((data ?? []) as { name: string; value_enc: string }[]).map((r) => ({ name: r.name, valueEnc: r.value_enc }));
}

export async function putWebsiteSecret(userId: string, websiteId: string, name: string, valueEnc: string): Promise<void> {
  const { error } = await db()
    .from("website_secrets")
    .upsert({ user_id: userId, website_id: websiteId, name, value_enc: valueEnc }, { onConflict: "user_id,website_id,name" });
  if (error) fail("save website secret", error);
}

export async function deleteWebsiteSecret(userId: string, websiteId: string, name: string): Promise<boolean> {
  const { data, error } = await db().from("website_secrets").delete().eq("user_id", userId).eq("website_id", websiteId).eq("name", name).select("id");
  if (error) fail("delete website secret", error);
  return (data ?? []).length > 0;
}
