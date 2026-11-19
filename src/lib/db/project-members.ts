/**
 * Project sharing. The owner invites signed-in people by email as an `editor` (may change the instructions and files,
 * for everyone) or a `member` (gets the instructions and files and starts tasks in the project, but sees only the
 * tasks they created). Each person's tasks run on their own computer and Orgo account; connector sign-ins,
 * automations and spending stay personal. Rows live in `project_members`; every lookup is by project id plus the
 * owner's id or the caller's own email or id, never by a value the caller can choose freely.
 */
import type { Session } from "@/lib/session";
import { db, fail } from "./client";
import { getProject, type Project } from "./projects";

export type ProjectRole = "owner" | "editor" | "member";
export type MemberRole = Exclude<ProjectRole, "owner">;

export interface ProjectMember {
  email: string;
  memberId: string | null;
  role: MemberRole;
  invitedBy: string;
  createdAt: string;
}

export const MAX_PROJECT_MEMBERS = 49;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => email.length <= 320 && EMAIL.test(email);

interface Row {
  project_id: string;
  owner_id: string;
  email: string;
  member_id: string | null;
  role: MemberRole;
  invited_by: string;
  created_at: string;
}
const fromRow = (r: Row): ProjectMember => ({ email: r.email, memberId: r.member_id, role: r.role, invitedBy: r.invited_by, createdAt: new Date(r.created_at).toISOString() });

/** PostgREST `or` filters matching the caller (their id, and their signed-in email when it is one). */
function selfFilters(session: Session): string {
  const filters = [`member_id.eq.${session.userId.replace(/[^A-Za-z0-9_-]/g, "")}`];
  const email = normalizeEmail(session.email ?? "");
  if (isEmail(email)) filters.push(`email.eq."${email.replace(/"/g, "")}"`);
  return filters.join(",");
}

/** Rows that are the caller's: matched by id, or by email when not yet claimed by another account. */
const mine = (session: Session) => (r: Row) => r.owner_id !== session.userId && (!r.member_id || r.member_id === session.userId);

export async function listProjectMembers(ownerId: string, projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await db().from("project_members").select("*").eq("owner_id", ownerId).eq("project_id", projectId).order("created_at");
  if (error) fail("list project members", error);
  return (data as Row[]).map(fromRow);
}

/** Invites (or changes the role of) one person. Owner only; the caller checks that. */
export async function upsertProjectMember(ownerId: string, projectId: string, email: string, role: MemberRole, invitedBy: string): Promise<ProjectMember> {
  const current = await listProjectMembers(ownerId, projectId);
  const existing = current.find((m) => m.email === email);
  if (existing) {
    if (existing.role === role) return existing;
    const { data, error } = await db().from("project_members").update({ role }).eq("owner_id", ownerId).eq("project_id", projectId).eq("email", email).select("*").single();
    if (error) fail("change project member", error);
    return fromRow(data as Row);
  }
  if (current.length >= MAX_PROJECT_MEMBERS) throw new Error(`A project can have at most ${MAX_PROJECT_MEMBERS} members.`);
  const { data, error } = await db().from("project_members").insert({ project_id: projectId, owner_id: ownerId, email, role, invited_by: invitedBy }).select("*").single();
  if (error) fail("add project member", error);
  return fromRow(data as Row);
}

export async function removeProjectMember(ownerId: string, projectId: string, email: string): Promise<boolean> {
  const { data, error } = await db().from("project_members").delete().eq("owner_id", ownerId).eq("project_id", projectId).eq("email", email).select("email");
  if (error) fail("remove project member", error);
  return (data ?? []).length > 0;
}

/** The caller leaves a project shared with them. */
export async function leaveProject(session: Session, projectId: string): Promise<boolean> {
  const { data, error } = await db().from("project_members").select("*").eq("project_id", projectId).or(selfFilters(session));
  if (error) fail("leave project", error);
  const rows = (data as Row[]).filter(mine(session));
  for (const r of rows) await db().from("project_members").delete().eq("project_id", projectId).eq("email", r.email);
  return rows.length > 0;
}

export interface ProjectAccess {
  project: Project;
  /** Whose project it is: the caller's own id, or the owner's. */
  ownerId: string;
  role: ProjectRole;
}

/**
 * What the caller may do with a project: their own (owner), or one they were invited to (editor or member). Null
 * when neither. The dev user (auth disabled) is never matched as an invitee. Claims the invitation for this account
 * the first time.
 */
export async function projectAccess(session: Session, projectId: string): Promise<ProjectAccess | null> {
  const own = await getProject(session.userId, projectId);
  if (own) return { project: own, ownerId: session.userId, role: "owner" };
  if (session.dev) return null;
  const { data, error } = await db().from("project_members").select("*").eq("project_id", projectId).or(selfFilters(session)).limit(5);
  if (error) fail("check project access", error);
  const row = (data as Row[]).find(mine(session));
  if (!row) return null;
  const project = await getProject(row.owner_id, projectId);
  if (!project) return null;
  if (!row.member_id) await db().from("project_members").update({ member_id: session.userId }).eq("project_id", projectId).eq("email", row.email);
  return { project, ownerId: row.owner_id, role: row.role };
}

/** Same as `projectAccess` for code that only has a user id (task creation): matched by claimed id only. */
export async function projectAccessById(userId: string, projectId: string): Promise<ProjectAccess | null> {
  const own = await getProject(userId, projectId);
  if (own) return { project: own, ownerId: userId, role: "owner" };
  const { data, error } = await db().from("project_members").select("*").eq("project_id", projectId).eq("member_id", userId).limit(1);
  if (error) fail("check project access", error);
  const row = (data as Row[])[0];
  if (!row || row.owner_id === userId) return null;
  const project = await getProject(row.owner_id, projectId);
  return project ? { project, ownerId: row.owner_id, role: row.role } : null;
}

export const canEditProject = (role: ProjectRole) => role === "owner" || role === "editor";

export interface SharedProject extends Project {
  role: MemberRole;
  shared: true;
  /** The owner's email as recorded by whoever invited (the inviter's email). */
  sharedBy: string;
}

/** Projects other people shared with the caller, oldest invitation first. Claims unclaimed invitations. */
export async function listSharedProjects(session: Session): Promise<SharedProject[]> {
  if (session.dev) return [];
  const { data, error } = await db().from("project_members").select("*").or(selfFilters(session)).order("created_at").limit(200);
  if (error) fail("list shared projects", error);
  const rows = (data as Row[]).filter(mine(session));
  if (!rows.length) return [];
  const { data: projects, error: pErr } = await db().from("projects").select("*").in("id", [...new Set(rows.map((r) => r.project_id))]);
  if (pErr) fail("list shared projects", pErr);
  const byKey = new Map((projects as { id: string; user_id: string }[]).map((p) => [`${p.user_id}:${p.id}`, p]));
  const out: SharedProject[] = [];
  for (const r of rows) {
    const raw = byKey.get(`${r.owner_id}:${r.project_id}`);
    if (!raw) continue;
    if (!r.member_id) await db().from("project_members").update({ member_id: session.userId }).eq("project_id", r.project_id).eq("email", r.email);
    const p = await getProject(r.owner_id, r.project_id);
    if (p) out.push({ ...p, pinned: false, role: r.role, shared: true, sharedBy: r.invited_by });
  }
  return out;
}

/** How many people a project is shared with (for the owner's "shared" marker). */
export async function memberCounts(ownerId: string): Promise<Map<string, number>> {
  const { data, error } = await db().from("project_members").select("project_id").eq("owner_id", ownerId);
  if (error) fail("count project members", error);
  const counts = new Map<string, number>();
  for (const r of data as { project_id: string }[]) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  return counts;
}
