// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * "Build from a task": turn a finished task into a skill. The agent is asked, as a real follow-up run in that task's
 * own Hermes session, to package what it did with its own `skill_manage` tool under a name we choose, so the new
 * skill can be found on the computer when the run ends.
 */
import { brand } from "@/config/brand";
import { primeConnection } from "@/lib/agent/server/connection";
import { getTask, runtimeFor } from "@/lib/agent/server/tasks";
import { createSkillBuild, finishSkillBuild, getSkillBuild, type SkillBuild } from "@/lib/db/skills";
import type { Session } from "@/lib/session";
import { storeForSession } from "@/lib/store";
import { listSkills, SKILL_NAME, SkillError, slugifySkillName, type SkillInfo } from "./index";

export function buildPrompt(name: string): string {
  return [
    `Package the workflow you just completed in this task as a reusable skill named exactly "${name}".`,
    `Use your skill_manage tool (action "create") so it is saved to your skills folder. Write a SKILL.md with front matter (name: ${name}, a one-sentence description of when to use it) and sections: When to Use, Procedure (the concrete steps that worked, including commands, tools and file formats), Pitfalls, and Verification.`,
    "Generalise it: replace the specifics of this task with inputs the user supplies next time. If a helper script made the work reliable, add it under scripts/ with skill_manage write_file.",
    `When it is saved, reply with one line: "Skill ${name} saved." and a two-sentence summary of what it does.`,
  ].join("\n\n");
}

export async function startBuild(session: Session, taskId: string, requested?: string): Promise<SkillBuild> {
  const store = await storeForSession(session);
  await primeConnection(session);
  const found = await getTask(store, taskId);
  if (!found) throw new SkillError("That task wasn't found.", "not_found", 404);
  if (found.task.status === "running" || found.task.status === "waking") throw new SkillError("Wait for the task to finish, then build a skill from it.", "failed", 409);
  const name = requested?.trim() ? requested.trim().toLowerCase() : slugifySkillName(found.task.title);
  if (!SKILL_NAME.test(name)) throw new SkillError("Skill names use lower-case letters, digits, dots, dashes and underscores.", "bad_name");
  const runtime = await runtimeFor(store, taskId);
  if (!runtime) throw new SkillError("That task wasn't found.", "not_found", 404);
  const build = await createSkillBuild(session.userId, taskId, name);
  await runtime.queueMessage(buildPrompt(name));
  return build;
}

export interface BuildStatus {
  build: SkillBuild;
  skill: SkillInfo | null;
  taskStatus: string | null;
}

/** Where a build stands: the skill once it is on the computer, or the task's state while the agent works. */
export async function buildStatus(session: Session, id: string): Promise<BuildStatus> {
  const build = await getSkillBuild(session.userId, id);
  if (!build) throw new SkillError("That build wasn't found.", "not_found", 404);
  const store = await storeForSession(session);
  const found = await getTask(store, build.taskId).catch(() => null);
  const taskStatus = found?.task.status ?? null;
  if (build.status !== "running") {
    const skill = build.status === "done" ? ((await listSkills(session)).find((s) => s.name === build.skillName) ?? null) : null;
    return { build, skill, taskStatus };
  }
  const young = Date.now() - Date.parse(build.createdAt) < 10_000;
  const settled = !young && taskStatus !== null && taskStatus !== "running" && taskStatus !== "waking";
  // Only look on the computer once the run settled: listing costs a round trip through Orgo.
  if (!settled) return { build, skill: null, taskStatus };
  const skill = (await listSkills(session)).find((s) => s.name === build.skillName) ?? null;
  if (skill) {
    await finishSkillBuild(session.userId, id, "done");
    return { build: { ...build, status: "done" }, skill, taskStatus };
  }
  if (taskStatus === "error" || taskStatus === "stopped" || Date.now() - Date.parse(build.createdAt) > 30 * 60_000) {
    const detail = `${brand.name} finished without saving the skill.`;
    await finishSkillBuild(session.userId, id, "failed", detail);
    return { build: { ...build, status: "failed", detail }, skill: null, taskStatus };
  }
  // The run ended but the task row may lag the agent's last write by a moment; ask again shortly.
  return { build, skill: null, taskStatus };
}
