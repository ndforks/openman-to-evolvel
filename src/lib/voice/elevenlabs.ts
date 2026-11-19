/**
 * ElevenLabs Scribe, confirmed against https://elevenlabs.io/docs (llms.txt, read 2026-11-19) and run against the live
 * API the same day (`node scripts/voice-live-test.mjs`): batch with diarization returns `speaker_0`/`speaker_1` words,
 * realtime tokens open one socket each (a reused token gets `auth_error`). Server only.
 *
 * - Single-use tokens: `POST https://api.elevenlabs.io/v1/single-use-token/{realtime_scribe|batch_scribe}` with
 *   `xi-api-key`; answer `{ token }`, valid once for 15 minutes. `realtime_scribe` also takes
 *   `?max_session_duration_seconds=`.
 * - Realtime: `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=...&audio_format=pcm_16000&commit_strategy=vad`;
 *   the browser sends `{ message_type: "input_audio_chunk", audio_base_64, commit, sample_rate }` and receives
 *   `partial_transcript` / `committed_transcript` (`text`). See `src/lib/voice/live.ts`.
 * - Batch: `POST https://api.elevenlabs.io/v1/speech-to-text` multipart (`model_id`, `file`, `diarize`,
 *   `timestamps_granularity=word`, `tag_audio_events`, `language_code`, `keyterms`), auth by `xi-api-key` or
 *   `?token=` (a `batch_scribe` single-use token). Answer `{ language_code, text, words: [{ text, start, end,
 *   type: word|spacing|audio_event, speaker_id }] }`. Files up to 5 GB.
 */
import type { Transcript, TranscriptSegment } from "./types";

export const ELEVENLABS_API = "https://api.elevenlabs.io";
export const REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
export const REALTIME_MODEL = process.env.ELEVENLABS_REALTIME_MODEL?.trim() || "scribe_v2_realtime";
export const BATCH_MODEL = process.env.ELEVENLABS_STT_MODEL?.trim() || "scribe_v2";

export function elevenLabsKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

/** A single-use token. Throws with ElevenLabs' sentence (never the key) when refused. */
export async function singleUseToken(kind: "realtime_scribe" | "batch_scribe", maxSessionSeconds?: number): Promise<string> {
  const key = elevenLabsKey();
  if (!key) throw new Error("ElevenLabs is not configured.");
  const qs = kind === "realtime_scribe" && maxSessionSeconds ? `?max_session_duration_seconds=${Math.round(maxSessionSeconds)}` : "";
  const res = await fetch(`${ELEVENLABS_API}/v1/single-use-token/${kind}${qs}`, { method: "POST", headers: { "xi-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => null)) as { token?: string; detail?: unknown } | null;
  if (!res.ok || !body?.token) {
    const detail = body?.detail;
    const said = typeof detail === "string" ? detail : detail && typeof detail === "object" && "message" in detail ? String((detail as { message: unknown }).message) : "";
    throw new Error(`ElevenLabs refused a token${said ? `: ${said}` : ` (${res.status})`}.`);
  }
  return body.token;
}

interface ScribeWord {
  text: string;
  start?: number | null;
  end?: number | null;
  type?: "word" | "spacing" | "audio_event";
  speaker_id?: string | null;
}
interface ScribeAnswer {
  language_code?: string;
  text?: string;
  words?: ScribeWord[];
  audio_duration_secs?: number;
  detail?: unknown;
}

/** Turns a Scribe batch answer into segments: a new segment at each speaker change or after a pause/sentence end. */
export function fromScribe(raw: string, model = BATCH_MODEL): Transcript {
  const answer = JSON.parse(raw) as ScribeAnswer;
  if (!answer.words && !answer.text) {
    const d = answer.detail;
    throw new Error(`ElevenLabs could not transcribe the audio${typeof d === "string" ? `: ${d}` : d && typeof d === "object" && "message" in d ? `: ${String((d as { message: unknown }).message)}` : "."}`);
  }
  const words = answer.words ?? [];
  const segments: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;
  let hasSpeakers = false;
  for (const w of words) {
    if (w.type === "audio_event") continue;
    if (w.type === "spacing") {
      if (cur) cur.text += w.text;
      continue;
    }
    const speaker = w.speaker_id ?? undefined;
    if (speaker) hasSpeakers = true;
    const start: number = w.start ?? cur?.end ?? 0;

    const end: number = w.end ?? start;
    const breakHere = !cur || cur.speaker !== speaker || start - cur.end > 1.5 || (/[.!?]$/.test(cur.text.trim()) && end - cur.start > 20);
    if (breakHere) {
      if (cur) segments.push({ ...cur, text: cur.text.trim() });
      cur = { start, end, text: w.text, ...(speaker ? { speaker } : {}) };
    } else if (cur) {
      cur.text += w.text;
      cur.end = end;
    }
  }
  if (cur) segments.push({ ...cur, text: cur.text.trim() });
  const duration = answer.audio_duration_secs ?? segments[segments.length - 1]?.end ?? 0;
  return {
    text: answer.text?.trim() || segments.map((s) => s.text).join(" "),
    language: answer.language_code ?? null,
    duration,
    segments,
    speakers: hasSpeakers,
    provider: `elevenlabs:${model}`,
  };
}

/** Shell script, run on the user's computer, that sends the audio straight to Scribe batch with a single-use token. */
export function scribeJobScript(audioPath: string, token: string, opts: { keyterms: string[]; language?: string | null }): string {
  const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
  const fields = [
    `-F model_id=${q(BATCH_MODEL)}`,
    `-F ${q(`file=@${audioPath}`)}`,
    "-F diarize=true",
    "-F timestamps_granularity=word",
    "-F tag_audio_events=false",
    ...(opts.language ? [`-F language_code=${q(opts.language)}`] : []),
    // keyterms: up to 1000, each <= 50 chars and 5 words, none of < > { } [ ] \
    ...opts.keyterms
      .filter((t) => t.length <= 50 && t.split(/\s+/).length <= 5 && !/[<>{}[\]\\]/.test(t))
      .slice(0, 100)
      .map((t) => `-F ${q(`keyterms=${t}`)}`),
  ];
  return [
    "set -e",
    `echo '{"state":"transcribing","done":0,"total":0}' > out.json.progress`,
    `code=$(curl -sS -o out.json.tmp -w '%{http_code}' --max-time 7200 -X POST ${q(`${ELEVENLABS_API}/v1/speech-to-text?token=${token}`)} ${fields.join(" ")})`,
    `if [ "$code" != "200" ]; then echo "ElevenLabs answered $code: $(head -c 300 out.json.tmp)"; exit 1; fi`,
    "mv -f out.json.tmp out.json",
  ].join("\n");
}
