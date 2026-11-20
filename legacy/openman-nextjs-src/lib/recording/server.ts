// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * "Record a skill", server side. Server only.
 *
 * The browser records what the user does on their home computer through our viewer (Orgo has no input stream or
 * screen recorder of its own) and uploads the timeline and screenshots in parts. After review, `generateSkill`
 * copies the key screenshots onto the computer and starts an ordinary task as the user that asks the agent to write
 * the skill with its own skill tool. `recordingStatus` then watches the task and the skills folder.
 */
import { randomBytes } from "node:crypto";
import { brand } from "@/config/brand";
import type { ComputerView } from "@/lib/agent/types";
import { createTask, getTask } from "@/lib/agent/server/tasks";
import { primeConnection } from "@/lib/agent/server/connection";
import { getAccount } from "@/lib/db/accounts";
import { createRecording, getRecording, getRecordingImage, listRecordings, recordingTimeline, updateRecording } from "@/lib/db/recordings";
import type { OrgoClient } from "@/lib/orgo/user-client";
import { homeComputerId } from "@/lib/provision";
import { orgoFor, type Session } from "@/lib/session";
import { listSkills, SKILL_NAME, slugifySkillName } from "@/lib/skills";
import { storeForSession } from "@/lib/store";
import { clock, describeStep, LIMITS, OPEN_STATUSES, type RecordedStep, type Recording, type RecordingWithSkill } from "./types";

export class RecordingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "failed",
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecordingError";
  }
}

/* ---------------------------------------------------------------- computer */

interface Home {
  orgo: OrgoClient;
  computerId: string;
}

async function home(session: Session): Promise<Home> {
  const account = session.dev ? null : await getAccount(session.userId);
  const computerId = homeComputerId(session, account);
  if (!computerId) throw new RecordingError("Your computer isn't set up yet. Open a task once to set it up, then record a skill.", 409, "no_computer");
  return { orgo: await orgoFor(session), computerId };
}

function screenSize(resolution: unknown): { width: number; height: number } {
  const m = typeof resolution === "string" ? /^(\d{3,4})x(\d{3,4})/.exec(resolution) : null;
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1280, height: 720 };
}

/**
 * Where to watch (and control) the user's home computer. The URL carries the computer's VNC password:
 * it goes to the owner's browser only and is never logged or stored.
 */
export async function homeView(session: Session): Promise<{ computerId: string; view: ComputerView; status: string }> {
  const { orgo, computerId } = await home(session);
  const computer = await orgo.getComputer(computerId);
  const password = typeof computer.vnc_password === "string" ? computer.vnc_password : "";
  const vncUrl = computer.status === "running" && password ? orgo.vncSocketUrl(computer.id, password) : null;
  return { computerId, status: String(computer.status ?? "unknown"), view: { vncUrl, viewOnly: false, ...screenSize(computer.instance_details?.resolution) } };
}

/** Title of the focused window on the computer (X11, through `xdotool`). Null when it can't be read. */
export async function activeWindowTitle(session: Session): Promise<string | null> {
  const { orgo, computerId } = await home(session);
  const { output } = await orgo.bash(computerId, 'export DISPLAY=${DISPLAY:-:99}; xdotool getactivewindow getwindowname 2>/dev/null | head -n1', 10);
  const title = (output ?? "").trim().slice(0, 200);
  return title || null;
}

/* ---------------------------------------------------------------- lifecycle */

export async function startRecording(session: Session, input: { name: string; screenW?: number; screenH?: number }): Promise<Recording> {
  const name = input.name.trim().slice(0, LIMITS.name);
  if (!name) throw new RecordingError("Name the recording first.");
  const open = await listRecordings(session.userId, { statuses: OPEN_STATUSES, limit: 1 });
  if (open[0]) {
    throw new RecordingError(`Finish delivering or discard "${open[0].name}" before starting another recording.`, 409, "open_recording", { recording: open[0] });
  }
  const { computerId } = await home(session);
  return createRecording(session.userId, { name, computerId, screenW: input.screenW ?? null, screenH: input.screenH ?? null });
}

export async function requireRecording(session: Session, id: string): Promise<Recording> {
  const rec = await getRecording(session.userId, id);
  if (!rec) throw new RecordingError("That recording wasn't found.", 404, "not_found");
  return rec;
}

/** Stops capture: the raw timeline becomes the editable list of steps. Calling it twice is harmless. */
export async function finishRecording(session: Session, id: string, opts: { screenW?: number; screenH?: number } = {}): Promise<Recording> {
  const rec = await requireRecording(session, id);
  if (rec.status !== "recording") return rec;
  const steps = (await recordingTimeline(session.userId, id)).slice(0, LIMITS.steps);
  // A part may be re-sent; keep the last copy of each step id, in time order.
  const byId = new Map<string, RecordedStep>();
  for (const s of steps) byId.set(s.id, s);
  const ordered = [...byId.values()].sort((a, b) => a.t - b.t);
  return (await updateRecording(session.userId, id, {
    status: "review",
    steps: ordered,
    endedAt: new Date().toISOString(),
    ...(opts.screenW ? { screenW: opts.screenW } : {}),
    ...(opts.screenH ? { screenH: opts.screenH } : {}),
  }))!;
}

/**
 * Review edits. `steps` lists the ids to keep, in order, with an optional note each: steps can be removed and
 * annotated, never invented, so the recording stays a faithful record of what was done.
 */
export async function reviewRecording(session: Session, id: string, patch: { name?: string; description?: string; steps?: { id: string; note?: string }[] }): Promise<Recording> {
  const rec = await requireRecording(session, id);
  if (rec.status === "recording" || rec.status === "processing") throw new RecordingError("This recording can't be edited right now.", 409, "busy");
  let steps: RecordedStep[] | undefined;
  if (patch.steps) {
    const source = rec.steps ?? [];
    const known = new Map(source.map((s) => [s.id, s]));
    steps = patch.steps
      .map((k) => {
        const s = known.get(k.id);
        if (!s) return null;
        const note = (k.note ?? "").trim().slice(0, LIMITS.note);
        const { note: _old, ...rest } = s;
        void _old;
        return note ? { ...rest, note } : rest;
      })
      .filter((s): s is RecordedStep => s !== null);
  }
  return (await updateRecording(session.userId, id, {
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, LIMITS.name) || rec.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description.slice(0, LIMITS.description) } : {}),
    ...(steps ? { steps } : {}),
  }))!;
}

/** Puts back every step of the raw timeline (undoes deletions in review). */
export async function restoreSteps(session: Session, id: string): Promise<Recording> {
  const rec = await requireRecording(session, id);
  if (rec.status === "recording" || rec.status === "processing") throw new RecordingError("This recording can't be edited right now.", 409, "busy");
  const notes = new Map((rec.steps ?? []).map((s) => [s.id, s.note]));
  const raw = (await recordingTimeline(session.userId, id)).slice(0, LIMITS.steps);
  const byId = new Map<string, RecordedStep>();
  for (const s of raw) byId.set(s.id, notes.get(s.id) ? { ...s, note: notes.get(s.id) } : s);
  return (await updateRecording(session.userId, id, { steps: [...byId.values()].sort((a, b) => a.t - b.t) }))!;
}

/* ---------------------------------------------------------------- generate */

const MAX_SCREENSHOTS = 24;
const ARG_BUDGET = 90_000;

/** Which screenshots go to the agent: each step's "after", plus the first "before", capped and deduplicated. */
function keyImages(steps: RecordedStep[]): string[] {
  const keys: string[] = [];
  const add = (k: string | null | undefined) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(steps[0]?.before);
  for (const s of steps) {
    add(s.after ?? s.before);
    if (s.note) add(s.before);
  }
  if (keys.length <= MAX_SCREENSHOTS) return keys;
  // Keep an even spread, always with the first and last.
  const out: string[] = [];
  for (let i = 0; i < MAX_SCREENSHOTS; i++) out.push(keys[Math.round((i * (keys.length - 1)) / (MAX_SCREENSHOTS - 1))]);
  return [...new Set(out)];
}

const fileFor = (key: string) => `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;

/** Copies screenshots into `dir` on the computer, a few at a time, each in chunks that fit one shell argument. */
async function stageImages(session: Session, h: Home, recordingId: string, keys: string[], dir: string): Promise<string[]> {
  await h.orgo.bash(h.computerId, `mkdir -p ${dir} && rm -f ${dir}/*.b64`, 20);
  const staged: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const img = await getRecordingImage(session.userId, recordingId, key);
      if (!img) continue;
      const file = fileFor(key);
      const tmp = `${dir}/${file}.b64`;
      for (let i = 0; i < img.data.length; i += ARG_BUDGET) {
        const res = await h.orgo.bash(h.computerId, `printf %s '${img.data.slice(i, i + ARG_BUDGET).replace(/[^A-Za-z0-9+/=]/g, "")}' >> ${tmp}`, 30);
        if (res.exit_code !== 0 && res.exit_code !== null) throw new RecordingError("Copying the screenshots to your computer stopped part way. Try again.", 502);
      }
      await h.orgo.bash(h.computerId, `base64 -d ${tmp} > ${dir}/${file} && rm -f ${tmp}`, 30);
      staged.push(key);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return keys.filter((k) => staged.includes(k));
}

export function skillPrompt(rec: Recording, steps: RecordedStep[], skillName: string, dir: string, staged: Set<string>): string {
  const w = rec.screenW ?? 1280;
  const h = rec.screenH ?? 720;
  const lines = steps.map((s, i) => {
    const shots = [s.before && staged.has(s.before) ? `before: ${fileFor(s.before)}` : null, s.after && staged.has(s.after) ? `after: ${fileFor(s.after)}` : null].filter(Boolean).join(", ");
    const px = s.x !== undefined && s.y !== undefined ? ` (≈${Math.round(s.x * w)},${Math.round(s.y * h)} px)` : "";
    return [
      `${i + 1}. [${clock(s.t)}] ${describeStep(s)}${px}${s.window ? ` — active window: "${s.window}"` : ""}${shots ? ` — screenshots ${shots}` : ""}`,
      s.note ? `   User's note: ${s.note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    `Turn my recording "${rec.name}" into a reusable skill named exactly "${skillName}". I demonstrated it on this computer (the desktop you control).`,
    `Recording: "${rec.name}"${rec.description.trim() ? `\nWhat it is for, in my words: ${rec.description.trim()}` : ""}`,
    `Screen: ${w}x${h}. Positions are given only to help you find things in the screenshots; the skill must not depend on them. Screenshots are on this computer in ${dir}/.`,
    `Steps I performed, in order:\n${lines.join("\n")}`,
    [
      "Please:",
      `1. Look at the screenshots with your vision tool to understand what each step did: which application, which button or menu (by its visible label), what was typed and what appeared.`,
      `2. Save the skill with your skill_manage tool (action "create", name "${skillName}"; if it already exists, rewrite its SKILL.md completely). SKILL.md needs front matter (name: ${skillName}, and a description that says when to use it) and these sections: When to Use; Prerequisites; Steps (numbered; name each target by its visible label, menu path, keyboard shortcut or command, never by pixel position; prefer a keyboard shortcut or command when it does the same thing); Check after each step (what should be visible before moving on); Pitfalls; Verification.`,
      "3. Generalise: values I typed that will differ next time (search terms, file names, URLs, recipients) become inputs the user supplies; keep the ones that are part of the procedure.",
      `4. Add a references/ folder to the skill: copy 3 to 6 of the most informative screenshots into it (find the skill's folder under ~/.hermes/skills) and write references/screenshots.md saying what each one shows and which step it belongs to.`,
      "5. Do not replay the demonstration and do not change anything else on the computer.",
      `6. When it is saved, reply with one line "Skill ${skillName} saved." and a two-sentence summary of what it does.`,
    ].join("\n"),
  ].join("\n\n");
}

async function uniqueSkillName(session: Session, wanted: string, regenerateOf: string | null): Promise<string> {
  const base = slugifySkillName(wanted);
  if (regenerateOf && regenerateOf === base) return base;
  const taken = new Set((await listSkills(session).catch(() => [])).map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i++) {
    const n = `${base.slice(0, 44)}-${i}`;
    if (!taken.has(n)) return n;
  }
  return `${base.slice(0, 40)}-${randomBytes(3).toString("hex")}`;
}

/** Starts (or restarts) turning a reviewed recording into a skill. Returns once the task is running. */
export async function generateSkill(session: Session, id: string, requestedName?: string): Promise<Recording> {
  const rec = await requireRecording(session, id);
  if (rec.status === "recording") throw new RecordingError("Stop the recording first.", 409, "busy");
  if (rec.status === "processing") return rec;
  const steps = (rec.steps ?? []).filter((s) => s.kind !== "pause" || steps_hasNeighbours(rec.steps ?? [], s));
  if (!steps.some((s) => s.kind !== "pause")) throw new RecordingError("This recording has no steps left. Record again, or restore the deleted steps.", 400, "empty");
  let skillName = requestedName?.trim().toLowerCase() || rec.skillName || rec.name;
  if (requestedName?.trim() && !SKILL_NAME.test(skillName)) throw new RecordingError("Skill names use lower-case letters, digits, dots, dashes and underscores (up to 64).", 400, "bad_name");
  skillName = await uniqueSkillName(session, skillName, rec.skillName);

  const h = await home(session);
  const dir = `/root/om-recordings/${rec.id}`;
  const staged = new Set(await stageImages(session, h, rec.id, keyImages(steps), dir));

  const store = await storeForSession(session);
  await primeConnection(session);
  const task = await createTask(store, { prompt: skillPrompt(rec, steps, skillName, dir, staged), mode: "standard" });
  return (await updateRecording(session.userId, id, { status: "processing", taskId: task.id, skillName, detail: null }))!;
}

/** A pause marker is only worth keeping between two real steps. */
function steps_hasNeighbours(all: RecordedStep[], s: RecordedStep): boolean {
  const i = all.indexOf(s);
  return all.slice(0, i).some((x) => x.kind !== "pause") && all.slice(i + 1).some((x) => x.kind !== "pause");
}

const SETTLED = new Set(["completed", "error", "stopped", "waiting"]);

/** The recording, and while processing: the task's state, and the skill once it is on the computer. */
export async function recordingStatus(session: Session, id: string): Promise<RecordingWithSkill> {
  const rec = await requireRecording(session, id);
  if (rec.status === "done" && rec.skillName) {
    const s = (await listSkills(session).catch(() => [])).find((x) => x.name === rec.skillName);
    return { recording: rec, skill: s ? { name: s.name, description: s.description, dir: s.dir } : { name: rec.skillName, description: "", dir: "" }, taskStatus: null };
  }
  if (rec.status !== "processing" || !rec.taskId) return { recording: rec, skill: null, taskStatus: null };
  const store = await storeForSession(session);
  const found = await getTask(store, rec.taskId).catch(() => null);
  const taskStatus = found?.task.status ?? null;
  const since = Date.parse(rec.updatedAt);
  const young = Date.now() - since < 10_000;
  if (young || !taskStatus || !SETTLED.has(taskStatus)) return { recording: rec, skill: null, taskStatus };
  const s = (await listSkills(session)).find((x) => x.name === rec.skillName);
  // On a regeneration the skill exists already: it counts once it was written after this run started.
  if (s && s.updatedAt * 1000 >= since - 5_000) {
    const done = (await updateRecording(session.userId, id, { status: "done", detail: null }))!;
    return { recording: done, skill: { name: s.name, description: s.description, dir: s.dir }, taskStatus };
  }
  if (taskStatus === "waiting") return { recording: rec, skill: null, taskStatus };
  const failed = (await updateRecording(session.userId, id, { status: "failed", detail: `${brand.agentNoun} finished without saving the skill. Open the task to see why, then try again.` }))!;
  return { recording: failed, skill: null, taskStatus };
}
