/**
 * Speech-to-text providers, one interface per job, picked by whether `ELEVENLABS_API_KEY` is set. Server only.
 *
 * Live (dictation, live meeting transcript), runs in the browser:
 *   - "elevenlabs": Scribe realtime; the server only mints a single-use token (`POST /api/voice/token`).
 *   - "browser":    the browser's own speech recognition (Chrome, Edge, Safari); nothing to do on the server.
 * Transcription (a whole recording or file), runs on the user's own Orgo computer where the audio already is:
 *   - "elevenlabs": the computer posts the file to Scribe batch with a single-use `batch_scribe` token
 *                   (diarized, word timestamps). Speaker labels: yes.
 *   - "computer":   Whisper (faster-whisper) installed on the computer. Speaker labels: no.
 */
import { BATCH_MODEL, elevenLabsKey, fromScribe, scribeJobScript, singleUseToken } from "./elevenlabs";
import type { Transcript, VoiceConfig } from "./types";
import { consumeUsage } from "@/lib/usage";
import { fromWhisper, whisperJobScript } from "./whisper";

export const PART_SIZE = 4 * 1024 * 1024; // under Vercel's 4.5 MB request cap
export const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export interface TranscriptionProvider {
  id: "elevenlabs" | "computer";
  /** True when the engine labels speakers. */
  speakers: boolean;
  /** Label stored on the meeting. */
  label: string;
  /** The detached job script, run in the meeting's folder on the computer; it must leave `out.json`. */
  jobScript(audioPath: string, opts: { dictionary: string[]; language?: string | null; userId?: string; sizeBytes?: number }): Promise<string>;
  /** Parses `out.json`. */
  parse(raw: string): Transcript;
}

const elevenLabsTranscription: TranscriptionProvider = {
  id: "elevenlabs",
  speakers: true,
  label: `elevenlabs:${BATCH_MODEL}`,
  async jobScript(audioPath, { dictionary, language, userId, sizeBytes }) {
    // The server's ElevenLabs key pays for this: counted against the user's caps before a token is minted.
    if (!userId) throw new Error("Transcription needs a user.");
    await consumeUsage(userId, "transcription_jobs", 1);
    await consumeUsage(userId, "transcription_mb", Math.max(1, Math.ceil((sizeBytes ?? MAX_BYTES) / (1024 * 1024))));
    const token = await singleUseToken("batch_scribe");
    return scribeJobScript(audioPath, token, { keyterms: dictionary, language });
  },
  parse: (raw) => fromScribe(raw),
};

const computerTranscription: TranscriptionProvider = {
  id: "computer",
  speakers: false,
  label: "computer:whisper",
  async jobScript(audioPath, { dictionary, language }) {
    // Whisper's initial prompt biases spelling toward the user's names and terms.
    const prompt = dictionary.length ? `Names and terms: ${dictionary.slice(0, 60).join(", ")}.` : "";
    return whisperJobScript(audioPath, { prompt, language });
  },
  parse: (raw) => fromWhisper(raw),
};

export function transcriptionProvider(): TranscriptionProvider {
  return elevenLabsKey() ? elevenLabsTranscription : computerTranscription;
}

export function voiceConfig(): VoiceConfig {
  const key = !!elevenLabsKey();
  return { live: key ? "elevenlabs" : "browser", transcription: key ? "elevenlabs" : "computer", speakers: key, partSize: PART_SIZE, maxBytes: MAX_BYTES };
}
