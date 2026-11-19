import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import { deleteProject, listProjectFiles, updateProject } from "@/lib/db/projects";
import { canEditProject, listProjectMembers, projectAccess } from "@/lib/db/project-members";
import { listTaskRows } from "@/lib/db/tasks";
import { toSummary } from "@/lib/store/types";
import { projectFields } from "../schema";

type Params = { params: Promise<{ id: string }> };
const notFound = () => jsonError("Project not found.", 404);

/**
 * GET /api/projects/[id]: the project, its files, the caller's role and the caller's own tasks in it (most recent
 * first). Everyone sees only the tasks they created: tasks are private and shared one by one. The owner also gets
 * the member list.
 */
export function GET(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    const [files, tasks, members] = await Promise.all([
      listProjectFiles(access.ownerId, id),
      listTaskRows(session.userId, { projectId: id, archived: "all" }),
      access.role === "owner" ? listProjectMembers(session.userId, id) : Promise.resolve(null),
    ]);
    const project = access.role === "owner" ? access.project : { ...access.project, pinned: false };
    return NextResponse.json(
      { project: { ...project, role: access.role, ...(access.role !== "owner" ? { shared: true } : { memberCount: members?.length ?? 0 }) }, role: access.role, files, tasks: tasks.map(toSummary), ...(members ? { members } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

const patchSchema = z
  .object({
    name: projectFields.name.optional(),
    instructions: projectFields.instructions.optional(),
    connectors: projectFields.connectors.optional(),
    skills: projectFields.skills.optional(),
    folder: projectFields.folder.optional(),
    computer: projectFields.computer.optional(),
    pinned: projectFields.pinned.optional(),
    order: projectFields.order.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

/** Fields an editor may change for everyone. The rest (name, pin, order, defaults) stay with the owner. */
const EDITOR_FIELDS = new Set(["instructions"]);

/** PATCH /api/projects/[id]: rename, edit instructions, default connectors and skills, pin. Editors: instructions only. */
export function PATCH(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const body = await readBody(req, patchSchema);
    if ("error" in body) return body.error;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    if (access.role !== "owner") {
      if (!canEditProject(access.role)) return jsonError("Only the project's owner and editors can change it.", 403);
      const fields = Object.entries(body.data).filter(([, v]) => v !== undefined).map(([k]) => k);
      if (fields.some((f) => !EDITOR_FIELDS.has(f))) return jsonError("Editors can change the instructions and files; the rest stays with the owner.", 403);
    }
    const project = await updateProject(access.ownerId, id, body.data);
    if (!project) return notFound();
    return NextResponse.json({ project: { ...project, role: access.role, ...(access.role !== "owner" ? { shared: true, pinned: false } : {}) } });
  });
}

/** DELETE /api/projects/[id]: delete the project and its files. Its tasks stay, outside any project. Owner only. */
export function DELETE(req: NextRequest, { params }: Params) {
  return withSession(req, async (session) => {
    const { id } = await params;
    const access = await projectAccess(session, id);
    if (!access) return notFound();
    if (access.role !== "owner") return jsonError("Only the project's owner can delete it. Leave it instead.", 403);
    return (await deleteProject(session.userId, id)) ? NextResponse.json({ ok: true }) : notFound();
  });
}
