/**
 * The generator registry, client-safe half: what each generator is called, what it prefills, where its
 * output lands, and which official skill (if any) it carries. The prompt contracts and the availability
 * checks are server-side (`contracts.ts`, `server.ts`).
 */
import type { GeneratorKind, GeneratorVariant } from "./types";

/** Well-known output paths, relative to the task folder. The server parses these and nothing else. */
export const OUTPUT = {
  marker: ".openman/generator.json",
  inputs: "inputs",
  slides: { dir: "slides", manifest: "slides/deck.json", theme: "slides/theme.css", exports: "slides/exports" },
  data: { dir: "analysis", manifest: "analysis/analysis.json" },
  research: { dir: "research", plan: "research/plan.json", items: "research/items", progress: "research/progress.json", manifest: "research/research.json" },
  audio: { dir: "audio", manifest: "audio/audio.json" },
  image: { dir: "images", manifest: "images/images.json" },
  video: { dir: "video", manifest: "video/video.json" },
} as const;

/** Tag put at the head of a generator task's instructions, so the server can tell its kind without asking the computer. */
export const GENERATOR_TAG = (kind: GeneratorKind, variant?: GeneratorVariant) => `[om-generator:${kind}${variant ? `:${variant}` : ""}]`;
export const GENERATOR_TAG_RE = /\[om-generator:(slides|data|research|audio|image|video)(?::(spreadsheet|visualization|topic|speech))?\]/;

/** Text the follow-up message carries when the user confirms a batch research estimate. */
export const WIDE_RESEARCH_GO = "Confirmed. Start the batch research run now, following the plan in research/plan.json.";

export interface HomeEntry {
  /** Stable id for React keys and analytics. */
  id: string;
  kind: GeneratorKind;
  variant?: GeneratorVariant;
  label: string;
  /** Composer text; the caret lands after it. */
  prompt: string;
  /** Placeholder shown while this generator is picked. */
  placeholder: string;
  /** Where Home shows it. */
  place: "quick" | "more";
}

/**
 * Home entries backed by a generator. "Build a website" and the plain-prompt entries (game, document,
 * automation) are not generators and live with the Home cards themselves.
 */
export const GENERATOR_ENTRIES: readonly HomeEntry[] = [
  { id: "slides", kind: "slides", label: "Slide deck", prompt: "Make a slide deck about ", placeholder: "Describe the deck: topic, audience, length", place: "quick" },
  { id: "research", kind: "research", variant: "topic", label: "Research report", prompt: "Research ", placeholder: "What should be researched? Lists of many similar items run in parallel", place: "quick" },
  { id: "video", kind: "video", label: "Make a video", prompt: "Make a video about ", placeholder: "Describe the video", place: "quick" },
  { id: "spreadsheet", kind: "data", variant: "spreadsheet", label: "Spreadsheet", prompt: "Build a spreadsheet that ", placeholder: "Describe the spreadsheet, or attach data to work from", place: "quick" },
  { id: "image", kind: "image", label: "Image", prompt: "Draw an image of ", placeholder: "Describe the image", place: "more" },
  { id: "visualization", kind: "data", variant: "visualization", label: "Chart", prompt: "Chart ", placeholder: "Attach a CSV or spreadsheet, or describe the data to chart", place: "more" },
  { id: "audio", kind: "audio", variant: "speech", label: "Voiceover", prompt: "Record a voiceover of ", placeholder: "Text to narrate, or what the voiceover should say", place: "more" },
];

/** Official-library skills that fit a generator (installed on demand, loaded with skill_view). */
export const OFFICIAL_SKILL: Partial<Record<GeneratorKind, string>> = {};

export function entryById(id: string | null | undefined): HomeEntry | undefined {
  return GENERATOR_ENTRIES.find((e) => e.id === id);
}
