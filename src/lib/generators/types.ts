/**
 * Generators: the kinds of work started from Home and the composer that end in a known artifact
 * (a slide deck, an analysis, a batch research table, audio). Client-safe: types only.
 *
 * Every generator task works in its task folder on the user's computer (`$HOME/tasks/<taskId>`) and
 * writes a manifest the server can parse at a well-known path (see `OUTPUT` in `registry.ts`).
 */

export type GeneratorKind = "slides" | "data" | "research" | "audio" | "image" | "video";

/** A finer flavour of a kind, which changes only the prompt contract ("data" makes a spreadsheet or charts). */
export type GeneratorVariant = "spreadsheet" | "visualization" | "topic" | "speech";

export interface GeneratorAvailability {
  kind: GeneratorKind;
  available: boolean;
  /** Why it is not offered, and exactly what would enable it. Present when `available` is false. */
  needs?: string;
  /** For audio: what it can make (speech always; sound effects and music only with the server's ElevenLabs plan). */
  features?: ("speech" | "sound_effects" | "music")[];
}

export interface AvailabilityResponse {
  generators: GeneratorAvailability[];
  /** When the answer was worked out (cached on the server for a few minutes). */
  checkedAt: string;
}

/** Written by the server into `<folder>/.openman/generator.json` when the task starts. */
export interface GeneratorMarker {
  version: 1;
  kind: GeneratorKind;
  variant?: GeneratorVariant;
  theme?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ slides */

export interface SlideEntry {
  /** File name inside `slides/`, e.g. "01.html". */
  file: string;
  title: string;
  /** Speaker notes, plain text or simple Markdown. */
  notes?: string;
  layout?: string;
}

/** `slides/deck.json` */
export interface SlideDeck {
  version: 1;
  title: string;
  subtitle?: string;
  theme: string;
  /** Pixel size every slide is designed at. Always 1280 x 720. */
  width?: number;
  height?: number;
  slides: SlideEntry[];
  sources?: { title: string; url: string }[];
}

/** What `GET /api/generators/[taskId]/deck` answers: the deck plus each slide as one self-contained HTML document. */
export interface DeckBundle {
  deck: SlideDeck;
  /** Same order as `deck.slides`. Stylesheets and images are inlined, so each renders in a sandboxed frame. */
  html: string[];
  /** Exports already made, by format, as paths relative to the task folder. */
  exports: Partial<Record<ExportFormat, string>>;
  updatedAt: number;
}

export type ExportFormat = "pdf" | "pptx" | "html";

/* -------------------------------------------------------------------- data */

export interface ChartEntry {
  title: string;
  /** Rendered image, relative to `analysis/`. */
  image: string;
  /** The plotted data as JSON, relative to `analysis/` (`ChartData`). */
  data?: string;
  caption?: string;
}

/** A chart's data file: what was plotted, so it can be read as a table or redrawn. */
export interface ChartData {
  type?: "bar" | "line" | "area" | "scatter" | "pie" | string;
  x?: string;
  y?: string | string[];
  columns: string[];
  rows: (string | number | null)[][];
}

export interface TableEntry {
  title: string;
  /** CSV, TSV or XLSX, relative to `analysis/`. */
  file: string;
  description?: string;
}

/** `analysis/analysis.json` */
export interface DataAnalysis {
  version: 1;
  title: string;
  summary?: string;
  charts: ChartEntry[];
  tables: TableEntry[];
  /** Markdown report, relative to `analysis/`. */
  report?: string;
}

/* ---------------------------------------------------------------- research */

export interface ResearchItem {
  id: string;
  name: string;
}

/** `research/plan.json`, written by the agent before any sub-agent starts. */
export interface ResearchPlan {
  version: 1;
  /** "wide": many similar items, run as parallel sub-agents after the user confirms. "single": one ordinary research run. */
  mode: "wide" | "single";
  title: string;
  /** What each sub-agent finds for its item (the columns of the merged table). */
  fields: string[];
  items: ResearchItem[];
  deliverable: "table" | "report" | "dataset";
  /** Sub-agents run per batch. */
  batchSize?: number;
}

/** `research/research.json`, the merged deliverable. */
export interface ResearchResult {
  version: 1;
  title: string;
  /** Relative to `research/`. */
  table?: string;
  report?: string;
  dataset?: string;
  summary?: string;
}

export interface CostEstimate {
  subtasks: number;
  model: string;
  /** US dollars, Orgo's model price plus its 10% margin. */
  lowUsd: number;
  highUsd: number;
  /** How the range was worked out, for a tooltip. */
  basis: string;
}

export type ResearchPhase = "planning" | "awaiting-confirmation" | "running" | "merging" | "done" | "single";

export interface ResearchState {
  phase: ResearchPhase;
  plan: ResearchPlan | null;
  /** Item ids whose sub-agent has written its result. */
  done: string[];
  /** Item ids in the batch now running. */
  running: string[];
  failed: string[];
  estimate: CostEstimate | null;
  result: ResearchResult | null;
}

/* ------------------------------------------------------------------- audio */

export interface AudioTrack {
  title: string;
  /** Relative to `audio/`. */
  file: string;
  voice?: string;
  text?: string;
  durationSec?: number;
}

/** `audio/audio.json` */
export interface AudioSet {
  version: 1;
  title: string;
  tracks: AudioTrack[];
}

/* ------------------------------------------------------------------- state */

/** `GET /api/generators/[taskId]`: what a generator task has produced so far. `kind` null for an ordinary task. */
export interface GeneratorState {
  kind: GeneratorKind | null;
  variant?: GeneratorVariant;
  /** Absolute path of the task folder on the computer. */
  folder?: string;
  slides?: { deck: SlideDeck | null; updatedAt: number; exports: Partial<Record<ExportFormat, string>> };
  data?: DataAnalysis | null;
  research?: ResearchState;
  audio?: AudioSet | null;
  error?: string;
}
