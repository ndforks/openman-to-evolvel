// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Share links for tasks. One per task; the token is the public part of the URL. */
import { randomBytes } from "node:crypto";
import { db, fail, iso } from "./client";

export type ShareVisibility = "private" | "public";

export interface Share {
  id: string;
  taskId: string;
  token: string;
  visibility: ShareVisibility;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  task_id: string;
  user_id: string;
  token: string;
  visibility: ShareVisibility;
  created_at: string;
  updated_at: string;
}
const toShare = (r: Row): Share => ({ id: r.id, taskId: r.task_id, token: r.token, visibility: r.visibility, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const newToken = () => randomBytes(18).toString("base64url");

export async function getShareForTask(userId: string, taskId: string): Promise<Share | null> {
  const { data, error } = await db().from("shares").select("*").eq("user_id", userId).eq("task_id", taskId).maybeSingle();
  if (error) fail("get share", error);
  return data ? toShare(data as Row) : null;
}

/** Creates the task's share or changes its visibility. The caller must have checked the task is the user's. */
export async function upsertShare(userId: string, taskId: string, visibility: ShareVisibility): Promise<Share> {
  const existing = await getShareForTask(userId, taskId);
  if (existing) {
    const { data, error } = await db().from("shares").update({ visibility }).eq("user_id", userId).eq("id", existing.id).select("*").single();
    if (error) fail("update share", error);
    return toShare(data as Row);
  }
  const { data, error } = await db().from("shares").insert({ user_id: userId, task_id: taskId, token: newToken(), visibility }).select("*").single();
  if (error) fail("create share", error);
  return toShare(data as Row);
}

/** Deletes the link; a later share gets a new token, so the old URL stays dead. */
export async function revokeShare(userId: string, taskId: string): Promise<boolean> {
  const { data, error } = await db().from("shares").delete().eq("user_id", userId).eq("task_id", taskId).select("id");
  if (error) fail("revoke share", error);
  return (data ?? []).length > 0;
}

/** Public lookup by token. Only `public` shares resolve. Returns the owner so the page can read the task. */
export async function resolveShareToken(token: string): Promise<(Share & { userId: string }) | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  const { data, error } = await db().from("shares").select("*").eq("token", token).eq("visibility", "public").maybeSingle();
  if (error) fail("resolve share", error);
  if (!data) return null;
  const row = data as Row;
  return { ...toShare(row), userId: row.user_id };
}
