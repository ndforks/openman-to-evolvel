"use client";

/**
 * Browser side of `/api/skills`, plus one shared, cached list of the user's installed skills that the Skills page,
 * the Settings tab and the composer's "/" menu all read.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { SkillBuild } from "@/lib/db/skills";
import type { SkillDetail, SkillFileInput, SkillInfo } from "./types";

export type { SkillDetail, SkillInfo } from "./types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || `Request failed (${res.status}).`);
  }
  return data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/* ---------------------------------------------------------------- shared list */

interface State {
  skills: SkillInfo[] | null;
  loading: boolean;
  error: string | null;
}

const SERVER_STATE: State = { skills: null, loading: false, error: null };
let state: State = SERVER_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<SkillInfo[]> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function refreshSkills(): Promise<SkillInfo[]> {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = call<{ skills: SkillInfo[] }>("/api/skills")
    .then(({ skills }) => {
      set({ skills, loading: false, error: null });
      return skills;
    })
    .catch((err: Error) => {
      set({ loading: false, error: err.message });
      return state.skills ?? [];
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The current list, loading it on first use. */
export function getSkillsSnapshot(): SkillInfo[] | null {
  if (state.skills === null && !state.loading && !state.error && typeof window !== "undefined") void refreshSkills();
  return state.skills;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSkills(): State & { refresh: () => Promise<SkillInfo[]> } {
  const snap = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    if (state.skills === null && !state.loading) void refreshSkills();
  }, []);
  return { ...snap, refresh: refreshSkills };
}

/** Optimistic local change (a toggle) before the server confirms. */
export function patchLocal(name: string, patch: Partial<SkillInfo> | null) {
  if (!state.skills) return;
  set({ skills: patch === null ? state.skills.filter((s) => s.name !== name) : state.skills.map((s) => (s.name === name ? { ...s, ...patch } : s)) });
}

function upsertLocal(skill: SkillInfo) {
  const list = state.skills ?? [];
  set({ skills: [...list.filter((s) => s.name !== skill.name), skill].sort((a, b) => a.name.localeCompare(b.name)) });
}

/* ---------------------------------------------------------------- calls */

export const getSkill = (name: string) => call<SkillDetail & { projects: string[] }>(`/api/skills/${encodeURIComponent(name)}`);

export async function setEnabled(name: string, enabled: boolean) {
  patchLocal(name, { enabled });
  try {
    await call(`/api/skills/${encodeURIComponent(name)}`, jsonInit("PATCH", { enabled }));
  } catch (err) {
    patchLocal(name, { enabled: !enabled });
    throw err;
  }
}

export async function saveFiles(name: string, files: SkillFileInput[]) {
  const { skill } = await call<{ skill: SkillInfo }>(`/api/skills/${encodeURIComponent(name)}`, jsonInit("PATCH", { files }));
  upsertLocal(skill);
  return skill;
}

export async function removeSkill(name: string) {
  await call(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
  patchLocal(name, null);
}

export async function createSkill(input: { name: string; description?: string; instructions: string }) {
  const { skill } = await call<{ skill: SkillInfo }>("/api/skills", jsonInit("POST", input));
  upsertLocal(skill);
  return skill;
}

/** One archive (.zip / .skill), a lone SKILL.md, or a folder's files (each with its relative path). */
export async function uploadSkill(files: File[], overwrite = false) {
  const form = new FormData();
  for (const file of files) {
    form.append("file", file);
    form.append("path", (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
  }
  if (overwrite) form.append("overwrite", "1");
  const { skill } = await call<{ skill: SkillInfo }>("/api/skills/upload", { method: "POST", body: form });
  upsertLocal(skill);
  return skill;
}

export async function importFromGithub(url: string) {
  const { skill } = await call<{ skill: SkillInfo }>("/api/skills/github", jsonInit("POST", { url }));
  upsertLocal(skill);
  return skill;
}

export async function installOfficial(name: string) {
  const { skill } = await call<{ skill: SkillInfo }>("/api/skills/official", jsonInit("POST", { name }));
  upsertLocal(skill);
  return skill;
}

export const downloadUrl = (name: string) => `/api/skills/${encodeURIComponent(name)}/download`;

export const startBuild = (taskId: string, name?: string) => call<{ build: SkillBuild }>("/api/skills/build", jsonInit("POST", { taskId, ...(name ? { name } : {}) }));
export const buildStatus = (id: string) => call<{ build: SkillBuild; skill: SkillInfo | null; taskStatus: string | null }>(`/api/skills/build/${encodeURIComponent(id)}`);

export const getProjectSkills = (projectId: string) => call<{ skills: string[] }>(`/api/skills/projects/${encodeURIComponent(projectId)}`);
export const setProjectSkills = (projectId: string, skills: string[]) => call<{ skills: string[] }>(`/api/skills/projects/${encodeURIComponent(projectId)}`, jsonInit("PUT", { skills }));

/** Text the composer puts in front of a prompt to run it with a skill (Hermes' own `/skill-name` syntax). */
export const skillPrefix = (name: string) => `/${name} `;

/** Upsert after a build finished elsewhere. */
export const rememberSkill = upsertLocal;
