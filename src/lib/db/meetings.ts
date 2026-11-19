// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Meetings: a recording or uploaded audio/video file on its way to a notes task (table `meetings`,
 * migration `supabase/migrations/20261119210000_meetings.sql`). The audio itself lives on the user's computer.
 * Every call is scoped by `userId`. Server only.
 */
import type { MeetingStatus, MeetingView, Transcript } from "@/lib/voice/types";
import { db, fail, iso } from "./client";

export interface MeetingRecord extends MeetingView {
  mime: string | null;
  computerId: string | null;
  guestDir: string | null;
  transcript: Transcript | null;
  startedAt: string | null;
}

export interface MeetingPatch {
  title?: string;
  status?: MeetingStatus;
  partsDone?: number[];
  computerId?: string | null;
  guestDir?: string | null;
  provider?: string | null;
  speakers?: boolean;
  progress?: MeetingView["progress"];
  transcript?: Transcript | null;
  taskId?: string | null;
  error?: string | null;
  startedAt?: string | null;
}

type Row = Record<string, unknown>;

function fromRow(r: Row): MeetingRecord {
  return {
    id: String(r.id),
    title: String(r.title ?? "Meeting"),
    source: r.source === "upload" ? "upload" : "recording",
    status: (r.status as MeetingStatus) ?? "uploading",
    fileName: String(r.file_name ?? ""),
    mime: (r.mime as string | null) ?? null,
    sizeBytes: Number(r.size_bytes ?? 0),
    partSize: Number(r.part_size ?? 0),
    partsTotal: Number(r.parts_total ?? 0),
    partsDone: Array.isArray(r.parts_done) ? (r.parts_done as number[]).map(Number) : [],
    computerId: (r.computer_id as string | null) ?? null,
    guestDir: (r.guest_dir as string | null) ?? null,
    provider: (r.provider as string | null) ?? null,
    speakers: r.speakers === true,
    progress: (r.progress as MeetingView["progress"]) ?? null,
    transcript: (r.transcript as Transcript | null) ?? null,
    taskId: (r.task_id as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    startedAt: r.started_at ? iso(r.started_at as string) : null,
    createdAt: iso(r.created_at as string),
    updatedAt: iso(r.updated_at as string),
  };
}

/** What the browser may see: no transcript body, no guest paths. */
export function toMeetingView(m: MeetingRecord): MeetingView {
  return {
    id: m.id,
    title: m.title,
    source: m.source,
    status: m.status,
    fileName: m.fileName,
    sizeBytes: m.sizeBytes,
    partSize: m.partSize,
    partsTotal: m.partsTotal,
    partsDone: m.partsDone,
    provider: m.provider,
    speakers: m.speakers,
    progress: m.progress,
    taskId: m.taskId,
    error: m.error,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function createMeeting(
  userId: string,
  input: { title: string; source: "recording" | "upload"; fileName: string; mime: string | null; sizeBytes: number; partSize: number; partsTotal: number },
): Promise<MeetingRecord> {
  const { data, error } = await db()
    .from("meetings")
    .insert({ user_id: userId, title: input.title, source: input.source, file_name: input.fileName, mime: input.mime, size_bytes: input.sizeBytes, part_size: input.partSize, parts_total: input.partsTotal })
    .select("*")
    .single();
  if (error) fail("create meeting", error);
  return fromRow(data as Row);
}

export async function getMeeting(userId: string, id: string): Promise<MeetingRecord | null> {
  const { data, error } = await db().from("meetings").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get meeting", error);
  return data ? fromRow(data as Row) : null;
}

export async function listMeetings(userId: string, limit = 20): Promise<MeetingRecord[]> {
  const { data, error } = await db().from("meetings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail("list meetings", error);
  return (data as Row[]).map(fromRow);
}

const COLUMNS: Record<keyof MeetingPatch, string> = {
  title: "title",
  status: "status",
  partsDone: "parts_done",
  computerId: "computer_id",
  guestDir: "guest_dir",
  provider: "provider",
  speakers: "speakers",
  progress: "progress",
  transcript: "transcript",
  taskId: "task_id",
  error: "error",
  startedAt: "started_at",
};

function toRow(patch: MeetingPatch): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && k in COLUMNS) row[COLUMNS[k as keyof MeetingPatch]] = v;
  return row;
}

export async function updateMeeting(userId: string, id: string, patch: MeetingPatch): Promise<MeetingRecord | null> {
  const { data, error } = await db().from("meetings").update(toRow(patch)).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update meeting", error);
  return data ? fromRow(data as Row) : null;
}

/**
 * Moves a meeting from one status to another only if it is still in `from`: a compare-and-set, so two
 * pollers can never both start the transcription or both create the notes task. Null when another won.
 */
export async function claimMeeting(userId: string, id: string, from: MeetingStatus, patch: MeetingPatch & { status: MeetingStatus }): Promise<MeetingRecord | null> {
  const { data, error } = await db().from("meetings").update(toRow(patch)).eq("user_id", userId).eq("id", id).eq("status", from).select("*").maybeSingle();
  if (error) fail("claim meeting", error);
  return data ? fromRow(data as Row) : null;
}

export async function deleteMeeting(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("meetings").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete meeting", error);
  return (data ?? []).length > 0;
}
