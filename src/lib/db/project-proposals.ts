/** Self-updating projects: changes an agent proposed from a project task, applied only after approval. */
import { db, fail } from "./client";

export interface ProposalChanges {
  /** The instructions before (when proposed) and the proposed text. */
  instructions?: { before: string; after: string };
  /** Text files to add to the project's knowledge. */
  addFiles?: { name: string; content: string }[];
  /** Knowledge files to remove (by id, with the name for the card). */
  removeFiles?: { id: string; name: string }[];
  /** The project's attached skills before and after. */
  skills?: { before: string[]; after: string[] };
}

export interface ProjectProposal {
  id: string;
  projectId: string;
  ownerId: string;
  taskId: string;
  proposedBy: string;
  status: "open" | "applied" | "dismissed";
  summary: string;
  changes: ProposalChanges;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  owner_id: string;
  task_id: string;
  proposed_by: string;
  status: ProjectProposal["status"];
  summary: string;
  changes: ProposalChanges;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

const fromRow = (r: Row): ProjectProposal => ({
  id: r.id,
  projectId: r.project_id,
  ownerId: r.owner_id,
  taskId: r.task_id,
  proposedBy: r.proposed_by,
  status: r.status,
  summary: r.summary,
  changes: r.changes ?? {},
  decidedBy: r.decided_by,
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function createProposal(input: { projectId: string; ownerId: string; taskId: string; proposedBy: string; summary: string; changes: ProposalChanges }): Promise<ProjectProposal> {
  const { data, error } = await db()
    .from("project_proposals")
    .insert({ project_id: input.projectId, owner_id: input.ownerId, task_id: input.taskId, proposed_by: input.proposedBy, summary: input.summary.slice(0, 2000), changes: input.changes })
    .select("*")
    .single();
  if (error) fail("create proposal", error);
  return fromRow(data as Row);
}

/** One proposal of a project (scoped by the project's owner). */
export async function getProposal(ownerId: string, projectId: string, id: string): Promise<ProjectProposal | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  const { data, error } = await db().from("project_proposals").select("*").eq("owner_id", ownerId).eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) fail("get proposal", error);
  return data ? fromRow(data as Row) : null;
}

/** Any proposal by id, for the approval handler (the caller then checks who may decide). */
export async function getProposalById(id: string): Promise<ProjectProposal | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  const { data, error } = await db().from("project_proposals").select("*").eq("id", id).maybeSingle();
  if (error) fail("get proposal", error);
  return data ? fromRow(data as Row) : null;
}

/** Marks an open proposal decided. False when it was no longer open (decided elsewhere first). */
export async function decideProposal(id: string, status: "applied" | "dismissed", decidedBy: string): Promise<boolean> {
  const { data, error } = await db().from("project_proposals").update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("id");
  if (error) fail("decide proposal", error);
  return (data ?? []).length > 0;
}

export async function reopenProposal(id: string): Promise<void> {
  await db().from("project_proposals").update({ status: "open", decided_by: null, decided_at: null }).eq("id", id);
}
