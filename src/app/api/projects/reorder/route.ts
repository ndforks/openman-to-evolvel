import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody, withSession } from "@/lib/agent/server/http";
import { reorderProjects } from "@/lib/db/projects";

const schema = z.object({ ids: z.array(z.string().max(64)).min(1).max(500) });

/** POST /api/projects/reorder `{ ids }`: the new order, first to last. Answers the reordered list. */
export function POST(req: NextRequest) {
  return withSession(req, async (session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    return NextResponse.json({ projects: await reorderProjects(session.userId, body.data.ids) });
  });
}
