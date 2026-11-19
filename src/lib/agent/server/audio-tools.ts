/**
 * `generate_speech` and `generate_sound_effect` for the agent (through the `omtools` bridge): the server spends the
 * owner's cap, calls ElevenLabs with its own key (`src/lib/voice/audio-gen.ts`) and drops the MP3 into the task's
 * folder on the owner's home computer. Nothing on the computer ever sees the key.
 */
import { AudioGenError, generateSoundEffect, synthesizeSpeech, vendorAudio } from "@/lib/voice/audio-gen";
import { UsageLimitError } from "@/lib/usage";
import { computerFor, orgoClientFor } from "./connection";
import { taskFolder } from "./remote";
import { safeFileName, transfer } from "./uploads";

export interface AudioToolResult {
  text: string;
  error?: boolean;
}

const fail = (message: string): AudioToolResult => ({ text: JSON.stringify({ error: message }), error: true });
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function fileName(wanted: unknown, fallback: string): string {
  const base = safeFileName((str(wanted) ?? fallback).split("/").pop() ?? fallback).replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${base || fallback}.mp3`;
}

export async function runAudioTool(ownerId: string, taskId: string, tool: "generate_speech" | "generate_sound_effect", args: Record<string, unknown>): Promise<AudioToolResult> {
  const offer = vendorAudio();
  if (tool === "generate_speech" ? !offer.speech : !offer.soundEffects) return fail(tool === "generate_speech" ? "Speech with ElevenLabs is not set up on this server; use edge-tts on the computer instead." : "Sound effects are not available on this server.");
  const orgo = orgoClientFor(ownerId);
  const computerId = computerFor(ownerId)?.computerId;
  if (!orgo || !computerId) return fail("Your computer is not reachable right now.");
  try {
    const folder = (await taskFolder(ownerId, taskId)) ?? null;
    if (!folder) return fail("This task's folder could not be made on the computer.");
    const dir = `${folder}/audio`;
    if (tool === "generate_speech") {
      const out = await synthesizeSpeech(ownerId, str(args.text) ?? "", str(args.voice));
      const name = fileName(args.file, "speech");
      await transfer(orgo, computerId, dir, name, out.bytes);
      return { text: JSON.stringify({ path: `${dir}/${name}`, voice: out.voice, characters: out.characters, bytes: out.bytes.byteLength }) };
    }
    const seconds = Number(args.seconds);
    const out = await generateSoundEffect(ownerId, str(args.prompt) ?? "", Number.isFinite(seconds) && seconds > 0 ? seconds : undefined);
    const name = fileName(args.file, "sound");
    await transfer(orgo, computerId, dir, name, out.bytes);
    return { text: JSON.stringify({ path: `${dir}/${name}`, bytes: out.bytes.byteLength }) };
  } catch (err) {
    if (err instanceof UsageLimitError || err instanceof AudioGenError) return fail(err.message);
    return fail(err instanceof Error ? err.message : String(err));
  }
}
