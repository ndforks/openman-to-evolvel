/** Skill shapes shared by the API routes and the UI. A skill lives on the user's computer, in Hermes' skills folder. */

/** Where an installed skill came from, as Hermes tracks it. */
export type SkillSource = "builtin" | "hub" | "local";

export interface SkillInfo {
  /** Hermes' name for the skill; also its `/name` command. */
  name: string;
  /** Folder under `~/.hermes/skills`, e.g. `finance/stocks`. */
  dir: string;
  description: string;
  category: string;
  /** builtin: shipped with Hermes; hub: installed by `hermes skills install`; local: written by the user or the agent. */
  source: SkillSource;
  /** For hub skills: `official`, `github`, `skills-sh`... */
  hubSource?: string | null;
  identifier?: string | null;
  trust?: string | null;
  enabled: boolean;
  /** False when the skill declares platforms that exclude Linux; Hermes does not load it here. */
  platformOk: boolean;
  license?: string | null;
  author?: string | null;
  version?: string | null;
  tags: string[];
  /** Seconds since the epoch, from the newest file in the folder. */
  updatedAt: number;
}

export interface SkillFile {
  path: string;
  size: number;
  /** Text content, when the file is text and not too large. */
  content?: string;
  binary?: boolean;
}

export interface SkillDetail {
  skill: SkillInfo;
  files: SkillFile[];
}

/** Text written to a skill: a path inside its folder and the content. */
export interface SkillFileInput {
  path: string;
  content?: string;
  /** Base64 bytes, for binary files. */
  b64?: string;
}

export type SkillErrorCode = "not_found" | "exists" | "bad_name" | "no_skill_md" | "bad_archive" | "too_large" | "no_computer" | "install_failed" | "builtin" | "failed";
