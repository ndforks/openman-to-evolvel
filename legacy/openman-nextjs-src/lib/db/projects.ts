// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Projects and their reference files. */
import { db, DbError, fail, iso } from "./client";

export interface Project {
  id: string;
  name: string;
  instructions: string;
  connectors: string[];
  skills: string[];
  folder: string;
  computer: "local" | "cloud" | null;
  pinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  mime: string | null;
  size: number;
  createdAt: string;
}

export type ProjectInput = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">> & { id?: string };

interface ProjectRow {
  id: string;
  name: string;
  instructions: string;
  connectors: string[];
  skills: string[];
  folder: string;
  computer: "local" | "cloud" | null;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  instructions: r.instructions,
  connectors: r.connectors ?? [],
  skills: r.skills ?? [],
  folder: r.folder ?? "",
  computer: r.computer,
  pinned: r.pinned,
  order: r.sort_order,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

function toRow(p: ProjectInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.instructions !== undefined) row.instructions = p.instructions;
  if (p.connectors !== undefined) row.connectors = p.connectors;
  if (p.skills !== undefined) row.skills = p.skills;
  if (p.folder !== undefined) row.folder = p.folder;
  if (p.computer !== undefined) row.computer = p.computer;
  if (p.pinned !== undefined) row.pinned = p.pinned;
  if (p.order !== undefined) row.sort_order = p.order;
  return row;
}

export const PROJECT_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** Pinned first, then the user's order, then oldest first. */
export async function listProjects(userId: string): Promise<Project[]> {
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) fail("list projects", error);
  return (data as ProjectRow[]).map(toProject);
}

export async function getProject(userId: string, id: string): Promise<Project | null> {
  const { data, error } = await db().from("projects").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get project", error);
  return data ? toProject(data as ProjectRow) : null;
}

export async function createProject(userId: string, input: ProjectInput & { name: string }): Promise<Project> {
  const row: Record<string, unknown> = { ...toRow(input), user_id: userId };
  if (input.id) {
    if (!PROJECT_ID.test(input.id)) throw new DbError("Invalid project id.", "invalid");
    row.id = input.id;
  }
  if (input.order === undefined) {
    const { data } = await db().from("projects").select("sort_order").eq("user_id", userId).order("sort_order", { ascending: false }).limit(1);
    row.sort_order = ((data?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;
  }
  const { data, error } = await db().from("projects").insert(row).select("*").single();
  if (error) fail("create project", error);
  return toProject(data as ProjectRow);
}

export async function updateProject(userId: string, id: string, patch: ProjectInput): Promise<Project | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getProject(userId, id);
  const { data, error } = await db().from("projects").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update project", error);
  return data ? toProject(data as ProjectRow) : null;
}

/** Deletes the project; its tasks stay and lose the link. */
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("projects").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete project", error);
  return (data ?? []).length > 0;
}

/** Sets `order` from the position of each id in `ids`. Ids that are not the user's are ignored. */
export async function reorderProjects(userId: string, ids: string[]): Promise<Project[]> {
  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await db().from("projects").update({ sort_order: index }).eq("user_id", userId).eq("id", id);
      if (error) fail("reorder projects", error);
    }),
  );
  return listProjects(userId);
}

// ------------------------------------------------------------------ files

interface FileRow {
  id: string;
  project_id: string;
  name: string;
  mime: string | null;
  size: number;
  created_at: string;
}
const FILE_COLUMNS = "id,project_id,name,mime,size,created_at";
const toFile = (r: FileRow): ProjectFile => ({ id: r.id, projectId: r.project_id, name: r.name, mime: r.mime, size: r.size, createdAt: iso(r.created_at) });

export const PROJECT_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const PROJECT_FILES_MAX = 50;

export async function listProjectFiles(userId: string, projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await db()
    .from("project_files")
    .select(FILE_COLUMNS)
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) fail("list project files", error);
  return (data as FileRow[]).map(toFile);
}

/** Text is stored as UTF-8, anything else as base64. */
export async function addProjectFile(userId: string, projectId: string, file: { name: string; mime?: string | null; bytes: Uint8Array }): Promise<ProjectFile> {
  if (file.bytes.length > PROJECT_FILE_MAX_BYTES) throw new DbError("The file is larger than 2 MB.", "too_large");
  const { count } = await db().from("project_files").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("project_id", projectId);
  if ((count ?? 0) >= PROJECT_FILES_MAX) throw new DbError(`A project holds at most ${PROJECT_FILES_MAX} files.`, "limit");
  const isText = !!file.mime && /^(text\/|application\/(json|xml|x-ndjson)$)/.test(file.mime);
  const buf = Buffer.from(file.bytes);
  const { data, error } = await db()
    .from("project_files")
    .insert({
      user_id: userId,
      project_id: projectId,
      name: file.name,
      mime: file.mime ?? null,
      size: file.bytes.length,
      encoding: isText ? "utf8" : "base64",
      content: isText ? buf.toString("utf8") : buf.toString("base64"),
    })
    .select(FILE_COLUMNS)
    .single();
  if (error) fail("add project file", error);
  return toFile(data as FileRow);
}

export async function readProjectFile(userId: string, projectId: string, fileId: string): Promise<{ file: ProjectFile; bytes: Buffer } | null> {
  const { data, error } = await db()
    .from("project_files")
    .select(`${FILE_COLUMNS},encoding,content`)
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("id", fileId)
    .maybeSingle();
  if (error) fail("read project file", error);
  if (!data) return null;
  const row = data as FileRow & { encoding: "utf8" | "base64"; content: string };
  return { file: toFile(row), bytes: Buffer.from(row.content, row.encoding === "base64" ? "base64" : "utf8") };
}

export async function deleteProjectFile(userId: string, projectId: string, fileId: string): Promise<boolean> {
  const { data, error } = await db().from("project_files").delete().eq("user_id", userId).eq("project_id", projectId).eq("id", fileId).select("id");
  if (error) fail("delete project file", error);
  return (data ?? []).length > 0;
}
