// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Heartbeats of periodic jobs (`ops_heartbeats`): the scheduler tick writes one per pass. Server only. */
import { db, fail } from "@/lib/db/client";

export interface Heartbeat {
  name: string;
  at: string;
  detail: Record<string, unknown> | null;
}

export async function readHeartbeat(name: string): Promise<Heartbeat | null> {
  const { data, error } = await db().from("ops_heartbeats").select("name,at,detail").eq("name", name).maybeSingle();
  if (error) fail("read heartbeat", error);
  return (data as Heartbeat | null) ?? null;
}

/** Stores this beat and returns the previous one (so the caller can tell how late it was). */
export async function beat(name: string, detail: Record<string, unknown>): Promise<Heartbeat | null> {
  const previous = await readHeartbeat(name).catch(() => null);
  const { error } = await db().from("ops_heartbeats").upsert({ name, at: new Date().toISOString(), detail });
  if (error) fail("write heartbeat", error);
  return previous;
}

export const TICK = "cron.tick";
/** The worker calls the tick every minute; more than this without one is "late". */
export const TICK_LATE_MS = 3 * 60_000;
