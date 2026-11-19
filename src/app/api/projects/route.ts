import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { createProject, listProjects } from "@/lib/db/projects";
import { listSharedProjects, memberCounts } from "@/lib/db/project-members";
import { projectFields } from "./schema";

const createSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional(),
  name: projectFields.name,
  instructions: projectFields.instructions.optional(),
  connectors: projectFields.connectors.optional(),
  skills: projectFields.skills.optional(),
  folder: projectFields.folder.optional(),
  computer: projectFields.computer.optional(),
  pinned: projectFields.pinned.optional(),
});

/**
 * GET /api/projects: the caller's projects, pinned first, then in their order (each with `role: "owner"` and
 * `memberCount`), followed by projects others shared with them (`shared: true`, `role: "editor" | "member"`).
 */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    const [own, counts, shared] = await Promise.all([listProjects(session.userId), memberCounts(session.userId).catch(() => new Map<string, number>()), listSharedProjects(session).catch(() => [])]);
    const projects = [...own.map((p) => ({ ...p, role: "owner" as const, memberCount: counts.get(p.id) ?? 0 })), ...shared];
    return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** POST /api/projects: create one. An `id` from the browser is kept so local drafts keep their links. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, createSchema);
    if ("error" in body) return body.error;
    return NextResponse.json({ project: await createProject(session.userId, body.data) }, { status: 201 });
  });
}
