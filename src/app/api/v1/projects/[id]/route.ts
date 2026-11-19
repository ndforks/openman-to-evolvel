import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteProject, getProject, updateProject } from "@/lib/db/projects";
import { body, notFound, ok, v1 } from "@/lib/public-api/http";
import { projectView } from "@/lib/public-api/resources";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/projects/{id} */
export function GET(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const p = await getProject(ctx.session.userId, id);
    if (!p) throw notFound("Project");
    return ok(ctx, projectView(p));
  });
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    instructions: z.string().max(20_000).optional(),
    connectors: z.array(z.string().max(200)).max(100).optional(),
    skills: z.array(z.string().max(200)).max(100).optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/v1/projects/{id}: any of `name`, `instructions`, `connectors`, `skills`, `pinned`. */
export function PATCH(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const b = await body(req, patchSchema);
    const p = await updateProject(ctx.session.userId, id, b);
    if (!p) throw notFound("Project");
    return ok(ctx, projectView(p));
  });
}

/** DELETE /api/v1/projects/{id}: its tasks stay and lose the link. */
export function DELETE(req: NextRequest, { params }: Params) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    if (!(await deleteProject(ctx.session.userId, id))) throw notFound("Project");
    return ok(ctx, { id, object: "project", deleted: true });
  });
}
