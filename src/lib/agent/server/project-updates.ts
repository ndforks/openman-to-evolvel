/**
 * Self-updating projects. On request inside a project task, the agent reviews the conversation and calls the
 * `omtools propose_project_update` tool; that stores a proposal and shows a card in the task with the changes as a
 * diff. Nothing changes until someone who may edit the project (its owner or an editor) approves it, from the card
 * (task owner) or from `POST /api/projects/[id]/proposals/[proposalId]`.
 */
import { canEditProject, projectAccessById } from "@/lib/db/project-members";
import { createProposal, decideProposal, getProposalById, reopenProposal, type ProjectProposal, type ProposalChanges } from "@/lib/db/project-proposals";
import { addProjectFile, deleteProjectFile, listProjectFiles, updateProject } from "@/lib/db/projects";
import { getProjectSkills, setProjectSkills } from "@/lib/db/skills";
import { DbStore } from "@/lib/store/db-store";
import type { ToolContext, ToolResult } from "./agent-tools";
import { raiseApproval, registerApprovalHandler, settleApproval } from "./relay";

export const PROPOSAL_KIND = "project-update";
export const APPLY_CHOICE = "Apply changes";
export const DISMISS_CHOICE = "Dismiss";

const MAX_FILES = 10;
const MAX_FILE_CHARS = 200_000;
const fail = (message: string): ToolResult => ({ text: JSON.stringify({ error: message }), error: true });
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** `propose_project_update` from the agent: validates, stores the proposal and raises the approval card. */
export async function proposeProjectUpdate(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  if (ctx.store.kind !== "supabase") return fail("Projects need the database.");
  const task = await ctx.store.getTask(ctx.taskId);
  if (!task?.projectId) return fail("This task is not in a project, so there is nothing to update. Tell the user.");
  const access = await projectAccessById(ctx.store.ownerId, task.projectId);
  if (!access) return fail("The project is no longer available to this user.");
  if (!canEditProject(access.role)) return fail("This user is a member of the project, not an editor: only the owner and editors can change it. Tell the user to ask the project's owner.");
  const project = access.project;
  const changes: ProposalChanges = {};

  const instructions = str(args.instructions);
  if (instructions !== undefined && instructions.trim() !== project.instructions.trim()) {
    if (instructions.length > 20_000) return fail("instructions: at most 20,000 characters.");
    changes.instructions = { before: project.instructions, after: instructions.trim() };
  }
  if (Array.isArray(args.add_files) && args.add_files.length) {
    if (args.add_files.length > MAX_FILES) return fail(`add_files: at most ${MAX_FILES} files.`);
    const files: { name: string; content: string }[] = [];
    for (const f of args.add_files as Record<string, unknown>[]) {
      const name = str(f?.name)?.trim();
      const content = str(f?.content);
      if (!name || content === undefined) return fail("add_files: each needs name and content (text).");
      if (content.length > MAX_FILE_CHARS) return fail(`add_files: "${name}" is longer than ${MAX_FILE_CHARS} characters.`);
      files.push({ name: name.slice(0, 200), content });
    }
    changes.addFiles = files;
  }
  if (Array.isArray(args.remove_files) && args.remove_files.length) {
    const current = await listProjectFiles(access.ownerId, project.id);
    const wanted = new Set((args.remove_files as unknown[]).map((n) => String(n).trim().toLowerCase()));
    const found = current.filter((f) => wanted.has(f.name.toLowerCase()) || wanted.has(f.id.toLowerCase()));
    if (found.length) changes.removeFiles = found.map((f) => ({ id: f.id, name: f.name }));
  }
  if (Array.isArray(args.skills)) {
    const after = [...new Set((args.skills as unknown[]).map((s) => String(s).trim().toLowerCase()).filter((s) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s)))].slice(0, 100);
    const before = await getProjectSkills(access.ownerId, project.id).catch(() => []);
    if ([...after].sort().join(",") !== [...before].sort().join(",")) changes.skills = { before, after };
  }
  if (!Object.keys(changes).length) return fail("Nothing would change: pass instructions (the full new text), add_files, remove_files and/or skills (the full new list).");
  const summary = (str(args.summary)?.trim() || "Proposed changes to the project").slice(0, 2000);
  const proposal = await createProposal({ projectId: project.id, ownerId: access.ownerId, taskId: ctx.taskId, proposedBy: ctx.store.ownerId, summary, changes });
  await raiseApproval(ctx.store, ctx.taskId, {
    kind: PROPOSAL_KIND,
    ref: proposal.id,
    title: `Update project "${project.name}"?`,
    detail: summary,
    choices: [DISMISS_CHOICE, APPLY_CHOICE],
    brief: "Waiting for approval of the project changes",
  });
  return { text: JSON.stringify({ ok: true, proposal: proposal.id, note: "The user sees the changes as a card and decides. Nothing has changed yet; do not say it has. Finish your reply briefly." }) };
}

export class ProposalError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Applies an open proposal as `deciderId`, who must be the project's owner or an editor. */
export async function applyProposal(p: ProjectProposal, deciderId: string): Promise<void> {
  const access = await projectAccessById(deciderId, p.projectId);
  if (!access || !canEditProject(access.role)) throw new ProposalError("Only the project's owner and editors can apply changes.", 403);
  const owner = access.ownerId;
  const c = p.changes;
  if (c.instructions && access.project.instructions.trim() !== c.instructions.before.trim()) {
    throw new ProposalError("The project's instructions changed since this was proposed. Ask the agent to propose again.", 409);
  }
  if (!(await decideProposal(p.id, "applied", deciderId))) throw new ProposalError("This proposal was already decided.", 409);
  try {
    if (c.instructions) await updateProject(owner, p.projectId, { instructions: c.instructions.after });
    for (const f of c.removeFiles ?? []) await deleteProjectFile(owner, p.projectId, f.id);
    for (const f of c.addFiles ?? []) await addProjectFile(owner, p.projectId, { name: f.name, mime: /\.md$/i.test(f.name) ? "text/markdown" : "text/plain", bytes: new TextEncoder().encode(f.content) });
    if (c.skills) await setProjectSkills(owner, p.projectId, c.skills.after);
  } catch (err) {
    await reopenProposal(p.id);
    throw err;
  }
}

export async function dismissProposal(p: ProjectProposal, deciderId: string): Promise<void> {
  const access = await projectAccessById(deciderId, p.projectId);
  if (!access || !canEditProject(access.role)) throw new ProposalError("Only the project's owner and editors can decide.", 403);
  if (!(await decideProposal(p.id, "dismissed", deciderId))) throw new ProposalError("This proposal was already decided.", 409);
}

const isApply = (choice: string) => /^(apply|approve|allow|yes)/i.test(choice.trim());

/** Decides from the project route, then closes the card in the task it came from. */
export async function decideFromRoute(p: ProjectProposal, deciderId: string, apply: boolean): Promise<void> {
  if (apply) await applyProposal(p, deciderId);
  else await dismissProposal(p, deciderId);
  await settleApproval(new DbStore(p.proposedBy), p.taskId, PROPOSAL_KIND, p.id, apply ? APPLY_CHOICE : DISMISS_CHOICE).catch(() => false);
}

// The card in the task: answered by the task's owner (the respond route refuses collaborators for this kind).
registerApprovalHandler(PROPOSAL_KIND, async ({ userId, ref, choice }) => {
  const p = await getProposalById(ref);
  if (!p || p.proposedBy !== userId) throw new Error("This proposal is gone.");
  if (p.status !== "open") return;
  if (isApply(choice)) await applyProposal(p, userId);
  else await dismissProposal(p, userId);
});
