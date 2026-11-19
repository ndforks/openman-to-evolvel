/**
 * Task collaboration: the owner invites signed-in people by email to read and prompt one task. Runs keep using the
 * owner's computer and the owner's Orgo account (the owner pays). Rows live in `task_members`; every lookup is by
 * task id plus the owner's id or the caller's own email or id, never by a value the caller can choose freely.
 */
import { db } from "@/lib/db/client";
import type { Session } from "@/lib/session";

export interface TaskMember {
  email: string;
  userId: string | null;
  role: "collaborator";
  invitedBy: string;
  createdAt: string;
}

export const MAX_MEMBERS = 49;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => email.length <= 320 && EMAIL.test(email);

interface Row {
  task_id: string;
  owner_id: string;
  email: string;
  user_id: string | null;
  role: "collaborator";
  invited_by: string;
  created_at: string;
}

const fromRow = (r: Row): TaskMember => ({ email: r.email, userId: r.user_id, role: r.role, invitedBy: r.invited_by, createdAt: r.created_at });

export async function listMembers(ownerId: string, taskId: string): Promise<TaskMember[]> {
  const { data, error } = await db().from("task_members").select("*").eq("owner_id", ownerId).eq("task_id", taskId).order("created_at");
  if (error) throw new Error(`Could not list collaborators: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

export async function addMember(ownerId: string, taskId: string, email: string, invitedBy: string): Promise<TaskMember> {
  const current = await listMembers(ownerId, taskId);
  const existing = current.find((m) => m.email === email);
  if (existing) return existing;
  if (current.length >= MAX_MEMBERS) throw new Error(`A task can have at most ${MAX_MEMBERS} collaborators.`);
  const { data, error } = await db().from("task_members").insert({ task_id: taskId, owner_id: ownerId, email, invited_by: invitedBy }).select("*").single();
  if (error) throw new Error(`Could not add the collaborator: ${error.message}`);
  return fromRow(data as Row);
}

export async function removeMember(ownerId: string, taskId: string, email: string): Promise<boolean> {
  const { data, error } = await db().from("task_members").delete().eq("owner_id", ownerId).eq("task_id", taskId).eq("email", email).select("email");
  if (error) throw new Error(`Could not remove the collaborator: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The owner of a task the caller was invited to, or null. Matches the caller's own signed-in email (or the user id
 * recorded the first time they opened it). The dev user (auth disabled) is never matched as a collaborator.
 */
export async function membershipFor(taskId: string, session: Session): Promise<{ ownerId: string } | null> {
  if (session.dev) return null;
  const email = normalizeEmail(session.email ?? "");
  const filters = [`user_id.eq.${session.userId.replace(/[^A-Za-z0-9_-]/g, "")}`];
  if (isEmail(email)) filters.push(`email.eq."${email.replace(/"/g, "")}"`);
  const { data, error } = await db().from("task_members").select("*").eq("task_id", taskId).or(filters.join(",")).limit(1);
  if (error) throw new Error(`Could not check access: ${error.message}`);
  const row = (data as Row[])[0];
  if (!row || row.owner_id === session.userId) return null;
  // An invitation already claimed by another account stays theirs.
  if (row.user_id && row.user_id !== session.userId) return null;
  if (!row.user_id) await db().from("task_members").update({ user_id: session.userId }).eq("task_id", taskId).eq("email", row.email);
  return { ownerId: row.owner_id };
}

export interface SharedTask {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  /** Who invited the caller (their email as recorded on the invitation). */
  invitedBy: string;
}

/**
 * Tasks other people invited the caller to (by the caller's signed-in email, or the account that claimed the invite),
 * newest first. Rows claimed by another account are left out. The dev user is never a collaborator.
 */
export async function listSharedWithMe(session: Session, limit = 100): Promise<SharedTask[]> {
  if (session.dev) return [];
  const email = normalizeEmail(session.email ?? "");
  const filters = [`user_id.eq.${session.userId.replace(/[^A-Za-z0-9_-]/g, "")}`];
  if (isEmail(email)) filters.push(`email.eq."${email.replace(/"/g, "")}"`);
  const { data, error } = await db().from("task_members").select("*").or(filters.join(",")).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not list shared tasks: ${error.message}`);
  const rows = (data as Row[]).filter((r) => r.owner_id !== session.userId && (!r.user_id || r.user_id === session.userId));
  if (!rows.length) return [];
  const { data: tasks, error: taskError } = await db().from("tasks").select("id,user_id,title,status,updated_at,archived").in("id", [...new Set(rows.map((r) => r.task_id))]);
  if (taskError) throw new Error(`Could not list shared tasks: ${taskError.message}`);
  const byKey = new Map((tasks as { id: string; user_id: string; title: string; status: string; updated_at: string; archived: boolean | null }[]).map((t) => [`${t.user_id}:${t.id}`, t]));
  const out: SharedTask[] = [];
  for (const r of rows) {
    const t = byKey.get(`${r.owner_id}:${r.task_id}`);
    if (!t || t.archived) continue;
    out.push({ id: t.id, title: t.title, status: t.status, updatedAt: new Date(t.updated_at).toISOString(), invitedBy: r.invited_by });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
