// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Chat-app links ("Reach <brand> from anywhere"): one row per user and channel. Server only.
 * The live truth is on the user's computer (Hermes' own `.env` and gateway state); this row remembers what was
 * linked (workspace / bot name) and, for Slack, the tokens sealed with `seal` so a rebuilt computer can be re-linked.
 */
import { db, fail, iso } from "./client";

export type ChannelId = "telegram" | "slack";

export interface ChannelLink {
  userId: string;
  channel: ChannelId;
  computerId: string | null;
  /** Bot handle (Telegram) or "Workspace · @bot" (Slack). */
  externalName: string | null;
  /** Slack team id; Telegram bot handle. */
  externalId: string | null;
  /** Sealed JSON of the credentials (Slack only). Never sent to a browser. */
  secretEnc: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  user_id: string;
  channel: ChannelId;
  computer_id: string | null;
  external_name: string | null;
  external_id: string | null;
  secret_enc: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): ChannelLink => ({
  userId: r.user_id,
  channel: r.channel,
  computerId: r.computer_id,
  externalName: r.external_name,
  externalId: r.external_id,
  secretEnc: r.secret_enc,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listChannelLinks(userId: string): Promise<ChannelLink[]> {
  const { data, error } = await db().from("channel_links").select("*").eq("user_id", userId);
  if (error) fail("list channel links", error);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function saveChannelLink(link: { userId: string; channel: ChannelId; computerId?: string | null; externalName?: string | null; externalId?: string | null; secretEnc?: string | null }): Promise<void> {
  const row: Partial<Row> = { user_id: link.userId, channel: link.channel, updated_at: new Date().toISOString() };
  if (link.computerId !== undefined) row.computer_id = link.computerId;
  if (link.externalName !== undefined) row.external_name = link.externalName;
  if (link.externalId !== undefined) row.external_id = link.externalId;
  if (link.secretEnc !== undefined) row.secret_enc = link.secretEnc;
  const { error } = await db().from("channel_links").upsert(row, { onConflict: "user_id,channel" });
  if (error) fail("save channel link", error);
}

export async function deleteChannelLink(userId: string, channel: ChannelId): Promise<void> {
  const { error } = await db().from("channel_links").delete().eq("user_id", userId).eq("channel", channel);
  if (error) fail("delete channel link", error);
}
