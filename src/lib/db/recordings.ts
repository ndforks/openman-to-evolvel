/**
 * Recorded demonstrations ("Record a skill"). Server only; every query is scoped by `user_id`.
 * Tables: `recordings` (one row per recording), `recording_parts` (the raw timeline, appended in numbered parts)
 * and `recording_images` (screenshots, base64). See supabase/migrations/20261119200000_recordings.sql.
 */
import type { RecordedStep, Recording, RecordingStatus } from "@/lib/recording/types";
import { db, fail, iso } from "./client";

interface RecordingRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: RecordingStatus;
  computer_id: string | null;
  screen_w: number | null;
  screen_h: number | null;
  steps: RecordedStep[] | null;
  task_id: string | null;
  skill_name: string | null;
  detail: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

const toRecording = (r: RecordingRow): Recording => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: r.status,
  computerId: r.computer_id,
  screenW: r.screen_w,
  screenH: r.screen_h,
  steps: r.steps,
  taskId: r.task_id,
  skillName: r.skill_name,
  detail: r.detail,
  startedAt: iso(r.started_at),
  endedAt: r.ended_at ? iso(r.ended_at) : null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRecordingId = (id: string) => UUID.test(id);

export async function createRecording(userId: string, input: { name: string; computerId: string | null; screenW?: number | null; screenH?: number | null }): Promise<Recording> {
  const { data, error } = await db()
    .from("recordings")
    .insert({ user_id: userId, name: input.name, computer_id: input.computerId, screen_w: input.screenW ?? null, screen_h: input.screenH ?? null })
    .select("*")
    .single();
  if (error) fail("create recording", error);
  return toRecording(data as RecordingRow);
}

export async function getRecording(userId: string, id: string): Promise<Recording | null> {
  if (!isRecordingId(id)) return null;
  const { data, error } = await db().from("recordings").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get recording", error);
  return data ? toRecording(data as RecordingRow) : null;
}

/** Newest first. Steps are left out of the list to keep it small. */
export async function listRecordings(userId: string, opts: { statuses?: RecordingStatus[]; limit?: number } = {}): Promise<Recording[]> {
  let q = db()
    .from("recordings")
    .select("id,user_id,name,description,status,computer_id,screen_w,screen_h,task_id,skill_name,detail,started_at,ended_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  const { data, error } = await q;
  if (error) fail("list recordings", error);
  return (data as Omit<RecordingRow, "steps">[]).map((r) => toRecording({ ...r, steps: null }));
}

export interface RecordingPatch {
  name?: string;
  description?: string;
  status?: RecordingStatus;
  steps?: RecordedStep[] | null;
  taskId?: string | null;
  skillName?: string | null;
  detail?: string | null;
  endedAt?: string | null;
  screenW?: number | null;
  screenH?: number | null;
}

export async function updateRecording(userId: string, id: string, patch: RecordingPatch): Promise<Recording | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.steps !== undefined) row.steps = patch.steps;
  if (patch.taskId !== undefined) row.task_id = patch.taskId;
  if (patch.skillName !== undefined) row.skill_name = patch.skillName;
  if (patch.detail !== undefined) row.detail = patch.detail;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
  if (patch.screenW !== undefined) row.screen_w = patch.screenW;
  if (patch.screenH !== undefined) row.screen_h = patch.screenH;
  const { data, error } = await db().from("recordings").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update recording", error);
  return data ? toRecording(data as RecordingRow) : null;
}

export async function deleteRecording(userId: string, id: string): Promise<boolean> {
  if (!isRecordingId(id)) return false;
  const { data, error } = await db().from("recordings").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete recording", error);
  return (data as unknown[]).length > 0;
}

/* ---------------------------------------------------------------- timeline parts */

/** Stores one part of the raw timeline. Re-sending the same `seq` replaces it, so a retried upload is harmless. */
export async function putRecordingPart(userId: string, recordingId: string, seq: number, events: RecordedStep[]): Promise<void> {
  const { error } = await db().from("recording_parts").upsert({ recording_id: recordingId, seq, user_id: userId, events }, { onConflict: "recording_id,seq" });
  if (error) fail("save recording part", error);
}

/** The whole raw timeline, parts in order. */
export async function recordingTimeline(userId: string, recordingId: string): Promise<RecordedStep[]> {
  const { data, error } = await db().from("recording_parts").select("seq,events").eq("user_id", userId).eq("recording_id", recordingId).order("seq", { ascending: true });
  if (error) fail("read recording timeline", error);
  return (data as { seq: number; events: RecordedStep[] }[]).flatMap((p) => (Array.isArray(p.events) ? p.events : []));
}

/* ---------------------------------------------------------------- images */

export async function putRecordingImage(userId: string, recordingId: string, img: { key: string; mime: string; width?: number | null; height?: number | null; data: string }): Promise<void> {
  const { error } = await db()
    .from("recording_images")
    .upsert({ recording_id: recordingId, key: img.key, user_id: userId, mime: img.mime, width: img.width ?? null, height: img.height ?? null, data: img.data }, { onConflict: "recording_id,key" });
  if (error) fail("save recording image", error);
}

export async function getRecordingImage(userId: string, recordingId: string, key: string): Promise<{ mime: string; data: string } | null> {
  if (!isRecordingId(recordingId)) return null;
  const { data, error } = await db().from("recording_images").select("mime,data").eq("user_id", userId).eq("recording_id", recordingId).eq("key", key).maybeSingle();
  if (error) fail("get recording image", error);
  return (data as { mime: string; data: string } | null) ?? null;
}

export async function countRecordingImages(userId: string, recordingId: string): Promise<number> {
  const { count, error } = await db().from("recording_images").select("key", { count: "exact", head: true }).eq("user_id", userId).eq("recording_id", recordingId);
  if (error) fail("count recording images", error);
  return count ?? 0;
}
