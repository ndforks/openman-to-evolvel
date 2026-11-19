/**
 * Skills on the user's computer. Server only.
 *
 * Order of preference, per operation:
 * - Enable / disable: Orgo's `PATCH /api/computers/{id}/agent/skills` (it edits `skills.disabled` through Hermes' own config code).
 * - Create from scratch: Orgo's `POST /agent/skills`; delete of a local skill: Orgo's `DELETE /agent/skills`.
 * - Install (official library, GitHub) and uninstall of hub skills: Hermes' own installer, `hermes skills install|uninstall`,
 *   which runs its security scan and keeps its hub lock.
 * - List with metadata, read files, write files, download, unpack an uploaded archive: no API exists (Hermes'
 *   `GET /v1/skills` lists names only and Orgo's list leaves out built-in skills), so a small program reads and writes
 *   `~/.hermes/skills` through Orgo's `/bash`.
 */
import { createHash, randomBytes } from "node:crypto";
import { getAccount } from "@/lib/db/accounts";
import { OrgoError, type OrgoClient } from "@/lib/orgo/user-client";
import { homeComputerId } from "@/lib/provision";
import { orgoFor, type Session } from "@/lib/session";
import { GUEST_PY } from "./guest-program";
import { officialByName, type OfficialSkill } from "./official";
import type { SkillDetail, SkillErrorCode, SkillFileInput, SkillInfo } from "./types";

export type { SkillDetail, SkillFileInput, SkillInfo } from "./types";

export class SkillError extends Error {
  constructor(
    message: string,
    readonly code: SkillErrorCode,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SkillError";
  }
}

export const SKILL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Largest archive accepted from a browser. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/* ---------------------------------------------------------------- transport */

interface Target {
  orgo: OrgoClient;
  computerId: string;
}

async function target(session: Session): Promise<Target> {
  const account = session.dev ? null : await getAccount(session.userId);
  const computerId = homeComputerId(session, account);
  if (!computerId) throw new SkillError("Your computer isn't set up yet. Open a task once to set it up, then add skills.", "no_computer", 409);
  return { orgo: await orgoFor(session), computerId };
}

const GUEST_B64 = Buffer.from(GUEST_PY, "utf8").toString("base64");
const GUEST_PATH = `/tmp/om-skills-${createHash("sha256").update(GUEST_PY).digest("hex").slice(0, 12)}.py`;
/** One bash argument may not exceed 128 KiB on Linux; stay well under it. */
const ARG_BUDGET = 90_000;
const PREAMBLE = "export HOME=/root HERMES_HOME=${HERMES_HOME:-/root/.hermes}; cd /tmp;";

async function bash(t: Target, command: string, timeout = 90): Promise<{ output: string; exitCode: number | null; error: string | null }> {
  const result = await t.orgo.bash(t.computerId, command, timeout);
  return { output: result.output ?? "", exitCode: result.exit_code, error: result.error };
}

/** Writes `data` (already base64) to a temp file on the computer, in chunks that fit one bash argument. */
async function stage(t: Target, b64: string): Promise<string> {
  const path = `/tmp/om-up-${randomBytes(8).toString("hex")}.b64`;
  await bash(t, `: > ${path}`);
  for (let i = 0; i < b64.length; i += ARG_BUDGET) {
    const { exitCode } = await bash(t, `printf %s '${b64.slice(i, i + ARG_BUDGET)}' >> ${path}`);
    if (exitCode !== 0 && exitCode !== null) throw new SkillError("The upload to your computer stopped part way. Try again.", "failed", 502);
  }
  return path;
}

/** Runs one guest subcommand and returns its JSON answer. Large argument objects travel through a staged file. */
async function guest<T>(t: Target, cmd: string, args: Record<string, unknown> = {}, timeout = 90): Promise<T> {
  const argB64 = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
  const install = `[ -s ${GUEST_PATH} ] || printf %s '${GUEST_B64}' | base64 -d > ${GUEST_PATH};`;
  let command: string;
  if (argB64.length + GUEST_B64.length + 400 < ARG_BUDGET) {
    command = `${PREAMBLE} ${install} python3 ${GUEST_PATH} ${cmd} '${argB64}'`;
  } else {
    const staged = await stage(t, argB64);
    command = `${PREAMBLE} ${install} python3 ${GUEST_PATH} ${cmd} 'e30=' ${staged}`;
  }
  const { output, error } = await bash(t, command, timeout);
  const match = output.match(/@@OM@@([\s\S]*?)@@OM@@/);
  if (!match) throw new SkillError(`Your computer didn't answer the skills request${error ? `: ${error.slice(0, 200)}` : "."}`, "failed", 502);
  const answer = JSON.parse(match[1]) as { ok: boolean; error?: string; code?: SkillErrorCode } & T;
  if (!answer.ok) throw new SkillError(answer.error || "The skills request failed.", answer.code ?? "failed", answer.code === "not_found" ? 404 : answer.code === "exists" ? 409 : 400);
  return answer;
}

/** Runs the `hermes` CLI on the computer and returns its output with ANSI colours removed. */
async function hermesCli(t: Target, args: string, timeout = 180): Promise<{ output: string; ok: boolean }> {
  const { output, exitCode } = await bash(t, `${PREAMBLE} NO_COLOR=1 COLUMNS=200 hermes ${args} 2>&1; echo "@@EXIT=$?@@"`, timeout);
  const code = Number(output.match(/@@EXIT=(\d+)@@/)?.[1] ?? exitCode ?? 1);
  const clean = output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/@@EXIT=\d+@@\s*$/, "");
  const lines = clean.split("\n").filter((l) => !/previous `hermes update`|Gateways may still be serving|Run `hermes update` or `hermes gateway restart`/.test(l));
  return { output: lines.join("\n").trim(), ok: code === 0 };
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function checkName(name: string): string {
  const n = name.trim();
  if (!SKILL_NAME.test(n)) throw new SkillError("Skill names use lower-case letters, digits, dots, dashes and underscores (up to 64).", "bad_name");
  return n;
}

/* ---------------------------------------------------------------- reads */

/** Every skill the agent on this computer can load (built-in, hub-installed and the user's own), newest first within source. */
export async function listSkills(session: Session): Promise<SkillInfo[]> {
  const t = await target(session);
  const { skills } = await guest<{ skills: SkillInfo[] }>(t, "list");
  return skills.filter((s) => s.platformOk).sort((a, b) => a.name.localeCompare(b.name));
}

export async function readSkill(session: Session, name: string): Promise<SkillDetail> {
  const t = await target(session);
  return guest<SkillDetail>(t, "read", { name: checkName(name) });
}

/** The skill folder as a zip, with the folder as its single top-level entry. */
export async function downloadSkill(session: Session, name: string): Promise<{ filename: string; bytes: Buffer }> {
  const t = await target(session);
  const { name: dir, b64 } = await guest<{ name: string; b64: string }>(t, "zip", { name: checkName(name) }, 120);
  return { filename: `${dir}.zip`, bytes: Buffer.from(b64, "base64") };
}

/* ---------------------------------------------------------------- writes */

/**
 * Creates a skill. With only a SKILL.md (or a description and instructions) it goes through Orgo's skills endpoint;
 * with more files it writes the folder directly.
 */
export async function createSkill(session: Session, input: { name: string; description?: string; instructions?: string; files?: SkillFileInput[]; category?: string }): Promise<SkillInfo> {
  const name = checkName(input.name);
  const t = await target(session);
  const files = input.files ?? [];
  const onlyDoc = files.length === 0 || (files.length === 1 && files[0].path === "SKILL.md" && files[0].content !== undefined);
  if (onlyDoc && !input.category) {
    const instructions = files[0]?.content ?? input.instructions ?? "";
    if (!instructions.trim()) throw new SkillError("Write the skill's instructions first.", "no_skill_md");
    try {
      await t.orgo.request("POST", `/computers/${encodeURIComponent(t.computerId)}/agent/skills`, { agent: "hermes", name, description: input.description?.trim() || firstLine(instructions), instructions }, { timeoutMs: 60_000 });
    } catch (err) {
      if (err instanceof OrgoError && err.status === 409) throw new SkillError("A skill with that name is already installed.", "exists", 409);
      if (!(err instanceof OrgoError) || err.status < 500) throw err;
      // Orgo's write failed on its side: fall back to writing the file ourselves.
      return (await guest<{ skill: SkillInfo }>(t, "write", { name, create: true, files: [{ path: "SKILL.md", content: withFrontMatter(name, input.description, instructions) }] })).skill;
    }
    return (await readSkillWith(t, name)).skill;
  }
  if (!files.some((f) => f.path === "SKILL.md")) throw new SkillError("A skill needs a SKILL.md file.", "no_skill_md");
  return (await guest<{ skill: SkillInfo }>(t, "write", { name, create: true, files, category: input.category })).skill;
}

/** Writes files into an existing skill (the editor saves SKILL.md this way). */
export async function updateSkill(session: Session, name: string, files: SkillFileInput[]): Promise<SkillInfo> {
  const t = await target(session);
  if (!files.length) throw new SkillError("Nothing to save.", "failed");
  return (await guest<{ skill: SkillInfo }>(t, "write", { name: checkName(name), files })).skill;
}

export async function setSkillEnabled(session: Session, name: string, enabled: boolean): Promise<void> {
  const t = await target(session);
  await t.orgo.request("PATCH", `/computers/${encodeURIComponent(t.computerId)}/agent/skills`, { agent: "hermes", name: checkName(name), enabled }, { timeoutMs: 60_000 });
}

/** Removes a skill. Built-in skills can only be disabled; hub skills go through Hermes' uninstaller. */
export async function deleteSkill(session: Session, name: string): Promise<void> {
  const n = checkName(name);
  const t = await target(session);
  const { skills } = await guest<{ skills: SkillInfo[] }>(t, "list");
  const skill = skills.find((s) => s.name === n);
  if (!skill) return;
  if (skill.source === "builtin") throw new SkillError("Built-in skills can't be deleted. Turn it off instead.", "builtin", 409);
  if (skill.source === "hub") {
    const { ok, output } = await hermesCli(t, `skills uninstall ${quote(n)} --yes`);
    if (ok) return;
    console.warn(`[skills] hermes uninstall ${n} failed, removing the folder: ${output.slice(-200)}`);
  } else {
    try {
      await t.orgo.request("DELETE", `/computers/${encodeURIComponent(t.computerId)}/agent/skills?agent=hermes&name=${encodeURIComponent(n)}`, undefined, { timeoutMs: 60_000 });
      return;
    } catch (err) {
      if (!(err instanceof OrgoError)) throw err;
      // Orgo refuses a skill inside a category folder; remove it ourselves.
    }
  }
  await guest(t, "delete", { name: n });
}

/** Installs a .zip / .skill archive (base64) the user uploaded. */
export async function installArchive(session: Session, b64: string, opts: { overwrite?: boolean; name?: string } = {}): Promise<SkillInfo> {
  if (Buffer.byteLength(b64, "base64") > MAX_UPLOAD_BYTES) throw new SkillError("That archive is larger than 8 MB.", "too_large", 413);
  const t = await target(session);
  const path = await stage(t, b64);
  return (await guest<{ skill: SkillInfo }>(t, "unpack", { path, overwrite: !!opts.overwrite, ...(opts.name ? { name: checkName(opts.name) } : {}) }, 120)).skill;
}

/**
 * `https://github.com/owner/repo` (SKILL.md at the root), `.../tree/<ref>/<path>` or `owner/repo[/path]`
 * as the identifier Hermes' GitHub source takes: `owner/repo/<path>`, with an empty path for the root.
 */
export function githubIdentifier(raw: string): string {
  const text = raw.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/(?:tree|blob)\/[^/\s]+(?:\/(.*))?)?/i) ?? text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.*))?$/);
  if (!m) throw new SkillError("Paste a public GitHub repository link, like https://github.com/owner/repo.", "bad_name");
  const [, owner, repo, rest] = m;
  const path = (rest ?? "").replace(/\/?SKILL\.md$/i, "").replace(/^\/+|\/+$/g, "");
  // Every part must start with a letter or digit: an identifier like `-h/x/` would otherwise reach the installer as an option.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(owner) || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo) || /[^A-Za-z0-9_./-]/.test(path) || path.split("/").some((p) => p === ".." || p.startsWith("-"))) {
    throw new SkillError("That GitHub link has characters a repository path can't have.", "bad_name");
  }
  return `${owner}/${repo}/${path}`;
}

/** Installs through `hermes skills install`, then returns the skill that appeared. */
async function hubInstall(session: Session, identifier: string, expectName?: string): Promise<{ skill: SkillInfo | null; output: string }> {
  const t = await target(session);
  const before = await guest<{ skills: SkillInfo[] }>(t, "list");
  const known = new Map(before.skills.map((s) => [s.name, s.updatedAt]));
  const { ok, output } = await hermesCli(t, `skills install --yes -- ${quote(identifier)}`, 240);
  const after = await guest<{ skills: SkillInfo[] }>(t, "list");
  const fresh =
    (expectName ? after.skills.find((s) => s.name === expectName) : undefined) ??
    after.skills.find((s) => !known.has(s.name)) ??
    after.skills.find((s) => s.identifier === identifier) ??
    null;
  if (!fresh) {
    const already = /already installed/i.test(output);
    const tail = output.split("\n").filter(Boolean).slice(-4).join(" ").slice(0, 400);
    throw new SkillError(already ? "That skill is already installed." : `Hermes couldn't install it: ${tail || (ok ? "no skill was found there." : "the installer failed.")}`, already ? "exists" : "install_failed", already ? 409 : 422);
  }
  return { skill: fresh, output };
}

export async function installFromGithub(session: Session, url: string): Promise<SkillInfo> {
  const { skill } = await hubInstall(session, githubIdentifier(url));
  return skill!;
}

export async function installOfficial(session: Session, name: string): Promise<{ skill: SkillInfo; official: OfficialSkill }> {
  const official = officialByName(name);
  if (!official) throw new SkillError("That skill isn't in the official library.", "not_found", 404);
  const { skill } = await hubInstall(session, official.identifier, official.name);
  return { skill: skill!, official };
}

/* ---------------------------------------------------------------- helpers */

async function readSkillWith(t: Target, name: string): Promise<SkillDetail> {
  return guest<SkillDetail>(t, "read", { name });
}

function firstLine(text: string): string {
  const body = text.replace(/^---[\s\S]*?\n---\s*\n/, "");
  const line = body.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.slice(0, 200);
}

function withFrontMatter(name: string, description: string | undefined, instructions: string): string {
  if (/^---\s*\n/.test(instructions)) return instructions;
  const desc = (description?.trim() || firstLine(instructions)).replace(/"/g, "'");
  return `---\nname: ${name}\ndescription: "${desc}"\n---\n\n${instructions.trim()}\n`;
}

/** A skill name from free text: "Build a coffee site!" -> "build-a-coffee-site". */
export function slugifySkillName(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "my-skill"
  );
}
