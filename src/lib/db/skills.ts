/** What this app keeps about skills: skills attached to projects, and "Build from a task" requests. Skills themselves live on the computer. */
import { db, fail, iso } from "./client";

export interface SkillBuild {
  id: string;
  taskId: string;
  skillName: string;
  status: "running" | "done" | "failed";
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BuildRow {
  id: string;
  task_id: string;
  skill_name: string;
  status: SkillBuild["status"];
  detail: string | null;
  created_at: string;
  updated_at: string;
}

const toBuild = (r: BuildRow): SkillBuild => ({ id: r.id, taskId: r.task_id, skillName: r.skill_name, status: r.status, detail: r.detail, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export async function createSkillBuild(userId: string, taskId: string, skillName: string): Promise<SkillBuild> {
  const { data, error } = await db().from("skill_builds").insert({ user_id: userId, task_id: taskId, skill_name: skillName }).select("*").single();
  if (error) fail("create skill build", error);
  return toBuild(data as BuildRow);
}

export async function getSkillBuild(userId: string, id: string): Promise<SkillBuild | null> {
  const { data, error } = await db().from("skill_builds").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get skill build", error);
  return data ? toBuild(data as BuildRow) : null;
}

export async function listSkillBuilds(userId: string, limit = 20): Promise<SkillBuild[]> {
  const { data, error } = await db().from("skill_builds").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail("list skill builds", error);
  return (data as BuildRow[]).map(toBuild);
}

export async function finishSkillBuild(userId: string, id: string, status: "done" | "failed", detail?: string): Promise<void> {
  const { error } = await db().from("skill_builds").update({ status, detail: detail ?? null }).eq("user_id", userId).eq("id", id);
  if (error) fail("finish skill build", error);
}

export async function getProjectSkills(userId: string, projectId: string): Promise<string[]> {
  const { data, error } = await db().from("project_skills").select("skills").eq("user_id", userId).eq("project_id", projectId).maybeSingle();
  if (error) fail("get project skills", error);
  return (data as { skills: string[] } | null)?.skills ?? [];
}

export async function setProjectSkills(userId: string, projectId: string, skills: string[]): Promise<string[]> {
  const unique = [...new Set(skills)].slice(0, 50);
  const { error } = await db().from("project_skills").upsert({ user_id: userId, project_id: projectId, skills: unique }, { onConflict: "user_id,project_id" });
  if (error) fail("set project skills", error);
  return unique;
}

/** Projects a skill is attached to. */
export async function projectsWithSkill(userId: string, skill: string): Promise<string[]> {
  const { data, error } = await db().from("project_skills").select("project_id").eq("user_id", userId).contains("skills", [skill]);
  if (error) fail("projects with skill", error);
  return (data as { project_id: string }[]).map((r) => r.project_id);
}
