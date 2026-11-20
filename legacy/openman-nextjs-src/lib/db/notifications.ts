// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** In-app notifications. */
import { db, fail, iso } from "./client";

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
const toNotification = (r: Row): Notification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  read: r.read_at !== null,
  readAt: r.read_at ? iso(r.read_at) : null,
  createdAt: iso(r.created_at),
});

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<{ notifications: Notification[]; unread: number }> {
  let q = db().from("notifications").select("*").eq("user_id", userId);
  if (opts.unreadOnly) q = q.is("read_at", null);
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(Math.min(opts.limit ?? 50, 200)),
    db().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (error) fail("list notifications", error);
  if (countError) fail("count notifications", countError);
  return { notifications: (data as Row[]).map(toNotification), unread: count ?? 0 };
}

export async function createNotification(userId: string, n: { kind?: string; title: string; body?: string; link?: string | null }): Promise<Notification> {
  const { data, error } = await db()
    .from("notifications")
    .insert({ user_id: userId, kind: n.kind ?? "info", title: n.title, body: n.body ?? "", link: n.link ?? null })
    .select("*")
    .single();
  if (error) fail("create notification", error);
  return toNotification(data as Row);
}

/** Marks the given notifications read, or all of them when `ids` is omitted. Returns how many changed. */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  let q = db().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (ids) {
    if (ids.length === 0) return 0;
    q = q.in("id", ids);
  }
  const { data, error } = await q.select("id");
  if (error) fail("mark notifications read", error);
  return (data ?? []).length;
}

export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("notifications").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete notification", error);
  return (data ?? []).length > 0;
}
