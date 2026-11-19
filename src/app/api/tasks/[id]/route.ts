import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, notFound, readBody, withTask } from "@/lib/agent/server/http";
import { changeTask, deleteTask, getTask } from "@/lib/agent/server/tasks";

type Params = { params: Promise<{ id: string }> };

/** GET /api/tasks/[id]: the task and every event recorded so far. */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return withTask(req, id, async ({ store, role }) => {
    const result = await getTask(store, id, role);
    return result ? NextResponse.json(result) : notFound();
  });
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "A title cannot be empty.").max(300).optional(),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
    projectId: z.string().max(200).nullable().optional(),
    pinned: z.boolean().optional(),
    unread: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");

/**
 * PATCH /api/tasks/[id]: rename (`title`), favourite (`favorite`), archive (`archived`) or move
 * to a project (`projectId`, null to remove), pin in the sidebar (`pinned`) or mark read/unread (`unread`). Answers `{ task }` with the confirmed fields.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => {
    const body = await readBody(req, patchSchema);
    if ("error" in body) return body.error;
    const task = await changeTask(store, id, body.data);
    if (task === "no-project") return jsonError("Project not found.", 404);
    return task ? NextResponse.json({ task }) : notFound();
  }, { ownerOnly: true });
}

/** DELETE /api/tasks/[id]: stop it if running, then delete it with its events, files and share link. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return withTask(req, id, async ({ store }) => ((await deleteTask(store, id)) ? NextResponse.json({ ok: true }) : notFound()), { ownerOnly: true });
}
