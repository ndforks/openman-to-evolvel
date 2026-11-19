// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Recording (or uploaded file) -> audio on the user's computer -> transcript -> a notes task. Server only.
 *
 * 1. `beginMeeting`: a `meetings` row; the browser then sends the file in parts of `PART_SIZE`.
 * 2. `receivePart`: each part goes to the user's computer (see `guest.ts`); resending a part is harmless.
 * 3. `finishUpload`: parts are joined on the computer and the transcription job starts there, detached.
 * 4. `advanceMeeting` (called by the status route on every poll): reads the job; when it is done, stores the
 *    transcript and creates a task as the user whose first message holds the transcript and asks for
 *    structured notes. Compare-and-set status changes make each step happen once even with several pollers.
 * Nothing runs in the background on our server, so a restart loses nothing: the next poll picks up.
 */
import { getAccount } from "@/lib/db/accounts";
import { claimMeeting, createMeeting, getMeeting, updateMeeting, type MeetingRecord } from "@/lib/db/meetings";
import { getSettings } from "@/lib/db/settings";
import { createTask } from "@/lib/agent/server/tasks";
import { homeComputerId } from "@/lib/provision";
import { orgoFor, type Session } from "@/lib/session";
import type { Store } from "@/lib/store";
import { fromScribe } from "./elevenlabs";
import { fromWhisper } from "./whisper";
import { applyDictionary, cleanDictionary, DICTIONARY_PREF } from "./dictionary";
import { GuestError, assemble, guestDir, listParts, putPart, readJob, startJob, writeText } from "./guest";
import { MAX_BYTES, PART_SIZE, transcriptionProvider } from "./providers";
import { clock, type Transcript } from "./types";

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function computerFor(session: Session): Promise<string> {
  const account = session.dev ? null : await getAccount(session.userId).catch(() => null);
  const id = homeComputerId(session, account);
  if (!id) throw new VoiceError("Your computer is not set up yet. Finish setup first.", 409);
  return id;
}

export async function dictionaryFor(userId: string): Promise<string[]> {
  try {
    const settings = await getSettings(userId);
    const prefs = (settings.prefs ?? {}) as Record<string, unknown>;
    return cleanDictionary(prefs[DICTIONARY_PREF]);
  } catch {
    return [];
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
};

export function extensionFor(fileName: string, mime: string | null): string {
  const fromName = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName) return fromName;
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[base] ?? "bin";
}

export function isMediaFile(fileName: string, mime: string | null): boolean {
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("audio/") || base.startsWith("video/")) return true;
  return /\.(webm|ogg|oga|opus|m4a|mp4|m4v|mp3|wav|flac|aac|mov|mkv|avi|wma|amr|3gp)$/i.test(fileName);
}

export async function beginMeeting(session: Session, input: { title?: string; source: "recording" | "upload"; fileName: string; mime?: string | null; sizeBytes: number }): Promise<MeetingRecord> {
  if (!isMediaFile(input.fileName, input.mime ?? null)) throw new VoiceError("Choose an audio or video file.");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) throw new VoiceError("The file is empty.");
  if (input.sizeBytes > MAX_BYTES) throw new VoiceError("Files up to 2 GB can be transcribed.", 413);
  await computerFor(session); // fail early when there is no computer
  const partsTotal = Math.ceil(input.sizeBytes / PART_SIZE);
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const title = (input.title?.trim() || (input.source === "upload" ? input.fileName.replace(/\.[^.]+$/, "") : `Meeting ${date}`)).slice(0, 120);
  return createMeeting(session.userId, { title, source: input.source, fileName: input.fileName.slice(0, 255), mime: input.mime?.slice(0, 100) ?? null, sizeBytes: input.sizeBytes, partSize: PART_SIZE, partsTotal });
}

export async function receivePart(session: Session, meeting: MeetingRecord, index: number, bytes: Uint8Array): Promise<MeetingRecord> {
  if (meeting.status !== "uploading") throw new VoiceError("This upload is already finished.", 409);
  if (!Number.isInteger(index) || index < 0 || index >= meeting.partsTotal) throw new VoiceError("That part is out of range.");
  const expected = index === meeting.partsTotal - 1 ? meeting.sizeBytes - index * meeting.partSize : meeting.partSize;
  if (bytes.byteLength !== expected) throw new VoiceError(`Part ${index} should be ${expected} bytes, not ${bytes.byteLength}.`);
  const computerId = meeting.computerId ?? (await computerFor(session));
  const orgo = await orgoFor(session);
  await putPart(orgo, computerId, meeting.id, index, bytes);
  // Re-read before writing so parts sent close together do not drop each other.
  const fresh = (await getMeeting(session.userId, meeting.id)) ?? meeting;
  const done = [...new Set([...fresh.partsDone, index])].sort((a, b) => a - b);
  return (await updateMeeting(session.userId, meeting.id, { partsDone: done, computerId, guestDir: guestDir(meeting.id) })) ?? fresh;
}

/** Joins the parts and starts transcribing. Safe to call twice. */
export async function finishUpload(session: Session, meeting: MeetingRecord): Promise<MeetingRecord> {
  if (meeting.status !== "uploading") return meeting;
  const computerId = meeting.computerId ?? (await computerFor(session));
  const orgo = await orgoFor(session);
  // The computer is the source of truth for which parts arrived.
  const sizes = await listParts(orgo, computerId, meeting.id);
  const missing: number[] = [];
  for (let i = 0; i < meeting.partsTotal; i += 1) {
    const expected = i === meeting.partsTotal - 1 ? meeting.sizeBytes - i * meeting.partSize : meeting.partSize;
    if (sizes.get(i) !== expected) missing.push(i);
  }
  if (missing.length > 0) {
    await updateMeeting(session.userId, meeting.id, { partsDone: [...sizes.keys()].filter((i) => !missing.includes(i)).sort((a, b) => a - b) });
    throw new VoiceError(`Parts still missing: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}.`, 409);
  }
  const claimed = await claimMeeting(session.userId, meeting.id, "uploading", { status: "transcribing", startedAt: new Date().toISOString(), computerId, progress: { state: "starting", done: 0, total: 0 } });
  if (!claimed) return (await getMeeting(session.userId, meeting.id)) ?? meeting;
  try {
    const audio = await assemble(orgo, computerId, meeting.id, meeting.partsTotal, meeting.sizeBytes, extensionFor(meeting.fileName, meeting.mime));
    const provider = transcriptionProvider();
    const script = await provider.jobScript(audio, { dictionary: await dictionaryFor(session.userId), userId: session.userId, sizeBytes: meeting.sizeBytes });
    await startJob(orgo, computerId, meeting.id, script);
    return (await updateMeeting(session.userId, meeting.id, { provider: provider.label, speakers: provider.speakers })) ?? claimed;
  } catch (err) {
    const message = err instanceof GuestError || err instanceof VoiceError || err instanceof Error ? err.message : "The transcription could not start.";
    return (await updateMeeting(session.userId, meeting.id, { status: "error", error: message })) ?? claimed;
  }
}

/** Polls the job on the computer and, once it is done, creates the notes task. */
export async function advanceMeeting(session: Session, store: Store, meeting: MeetingRecord): Promise<MeetingRecord> {
  if (meeting.status !== "transcribing" || !meeting.computerId) return meeting;
  const orgo = await orgoFor(session);
  let job;
  try {
    job = await readJob(orgo, meeting.computerId, meeting.id);
  } catch (err) {
    // The computer did not answer this time: keep waiting, show why.
    return { ...meeting, progress: { state: err instanceof Error ? err.message.slice(0, 120) : "waiting for your computer", done: meeting.progress?.done ?? 0, total: meeting.progress?.total ?? 0 } };
  }
  if (job.state === "running") {
    return job.progress ? ((await updateMeeting(session.userId, meeting.id, { progress: job.progress })) ?? meeting) : meeting;
  }
  if (job.state === "failed") {
    return (await claimMeeting(session.userId, meeting.id, "transcribing", { status: "error", error: job.error ?? "The transcription failed." })) ?? meeting;
  }

  let transcript: Transcript;
  try {
    const provider = meeting.provider?.startsWith("elevenlabs") ? "elevenlabs" : "computer";
    transcript = provider === "elevenlabs" ? fromScribe(job.output ?? "") : fromWhisper(job.output ?? "");
  } catch (err) {
    return (await claimMeeting(session.userId, meeting.id, "transcribing", { status: "error", error: err instanceof Error ? err.message : "The transcript could not be read." })) ?? meeting;
  }
  const dictionary = await dictionaryFor(session.userId);
  transcript = { ...transcript, text: applyDictionary(transcript.text, dictionary), segments: transcript.segments.map((s) => ({ ...s, text: applyDictionary(s.text, dictionary) })) };
  if (!transcript.text.trim()) {
    return (await claimMeeting(session.userId, meeting.id, "transcribing", { status: "error", error: "No speech was found in the recording.", transcript })) ?? meeting;
  }

  const claimed = await claimMeeting(session.userId, meeting.id, "transcribing", { status: "summarizing", transcript, progress: null });
  if (!claimed) return (await getMeeting(session.userId, meeting.id)) ?? meeting;
  try {
    const transcriptPath = `${guestDir(meeting.id)}/transcript.txt`;
    await writeText(orgo, meeting.computerId, transcriptPath, transcriptText(transcript)).catch(() => undefined);
    const task = await createTask(store, { prompt: notesPrompt(claimed, transcript, transcriptPath), mode: "standard" });
    return (await updateMeeting(session.userId, meeting.id, { status: "done", taskId: task.id })) ?? claimed;
  } catch (err) {
    return (await updateMeeting(session.userId, meeting.id, { status: "error", error: err instanceof Error ? `The notes task could not be created: ${err.message}` : "The notes task could not be created." })) ?? claimed;
  }
}

/** Retries a failed meeting from the furthest point it can: transcription when the audio is on the computer. */
export async function retryMeeting(session: Session, meeting: MeetingRecord): Promise<MeetingRecord> {
  if (meeting.status !== "error") return meeting;
  if (meeting.transcript) {
    return (await updateMeeting(session.userId, meeting.id, { status: "transcribing", error: null })) ?? meeting; // next poll re-reads out.json
  }
  const computerId = meeting.computerId ?? (await computerFor(session));
  const orgo = await orgoFor(session);
  const ext = extensionFor(meeting.fileName, meeting.mime);
  const audio = `${guestDir(meeting.id)}/audio.${ext}`;
  const provider = transcriptionProvider();
  await updateMeeting(session.userId, meeting.id, { status: "transcribing", error: null, provider: provider.label, speakers: provider.speakers, progress: { state: "starting", done: 0, total: 0 } });
  try {
    await startJob(orgo, computerId, meeting.id, await provider.jobScript(audio, { dictionary: await dictionaryFor(session.userId), userId: session.userId, sizeBytes: meeting.sizeBytes }));
  } catch (err) {
    return (await updateMeeting(session.userId, meeting.id, { status: "error", error: err instanceof Error ? err.message : "Retry failed." })) ?? meeting;
  }
  return (await getMeeting(session.userId, meeting.id)) ?? meeting;
}

export function transcriptText(t: Transcript): string {
  return t.segments.map((s) => `[${clock(s.start)}]${s.speaker ? ` ${s.speaker.replace(/^speaker_/, "Speaker ")}:` : ""} ${s.text}`).join("\n");
}

const MAX_INLINE = 150_000;

export function notesPrompt(meeting: MeetingRecord, t: Transcript, transcriptPath: string): string {
  const when = new Date(meeting.createdAt || Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const origin = meeting.source === "upload" ? `an uploaded file (${meeting.fileName})` : "an in-person meeting I recorded";
  const speakerRule = t.speakers
    ? "The transcript labels speakers (Speaker 0, Speaker 1, ...) from voice. Map a label to a name only where the transcript makes it clear (someone is named, introduces themselves or is addressed by name); otherwise keep the label."
    : "The transcript has no speaker labels. Attribute a statement or action item to a person only where the content makes it clear (they are named, introduce themselves, or are addressed by name). Otherwise leave it unattributed; never guess who said what.";
  let body = transcriptText(t);
  let note = "";
  if (body.length > MAX_INLINE) {
    body = body.slice(0, MAX_INLINE);
    note = `\n(The transcript is cut here because it is long; read the rest from ${transcriptPath}.)`;
  }
  return `Meeting notes: ${meeting.title}

Turn the transcript below, from ${origin} on ${when} (${clock(t.duration)} long), into structured meeting notes:

1. Summary: one short paragraph.
2. Attendees: the people who took part or were mentioned as present.
3. Key points, grouped by topic.
4. Decisions.
5. Action items: owner, task, and due date when one was said.
6. Open questions, if any.

${speakerRule} Write the notes in this chat (no files needed). Keep the transcript as context: I may ask for follow-up work such as an email, slides or a document. The full transcript with timestamps is also saved on this computer at ${transcriptPath}.

Transcript:
${body}${note}`;
}
