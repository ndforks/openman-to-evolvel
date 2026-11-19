import type { NextRequest } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/lib/db/projects";
import { idempotent, list, paginate, rawBody, v1, validate } from "@/lib/public-api/http";
import { projectView } from "@/lib/public-api/resources";

/** GET /api/v1/projects: the account's projects in sidebar order. */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const projects = (await listProjects(ctx.session.userId)).map(projectView);
    return list(ctx, paginate(projects, req, (p) => p.id, 50));
  });
}

const projectSchema = z.object({
  name: z.string().trim().min(1, "name is required.").max(200),
  instructions: z.string().max(20_000).optional(),
  connectors: z.array(z.string().max(200)).max(100).optional(),
  skills: z.array(z.string().max(200)).max(100).optional(),
  pinned: z.boolean().optional(),
});

/** POST /api/v1/projects `{ name, instructions?, connectors?, skills?, pinned? }`. Honours `Idempotency-Key`. */
export function POST(req: NextRequest) {
  return v1(req, async (ctx) => {
    const { raw, json } = await rawBody(req);
    const b = validate(json, projectSchema.strict());
    return idempotent(req, ctx, raw, async () => ({ status: 201, data: projectView(await createProject(ctx.session.userId, b)) }));
  });
}
