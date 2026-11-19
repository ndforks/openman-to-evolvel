import type { NextRequest } from "next/server";
import { z } from "zod";
import { getProjectConnectors, setProjectConnectors } from "@/lib/db/connectors";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const schema = z.object({ connectors: z.array(z.string().max(200)).max(100) });

/** GET /api/connectors/projects/{projectId}: the connectors switched on for every task in a project. */
export function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  return withUser(req, async ({ session }) => {
    const { projectId } = await params;
    if (!ID.test(projectId)) throw new BadRequest("Which project?");
    return json({ connectors: await getProjectConnectors(session.userId, projectId) });
  });
}

/** PUT /api/connectors/projects/{projectId} `{ connectors }`: replaces the project's selection. */
export function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  return withUser(req, async ({ session }) => {
    const { projectId } = await params;
    if (!ID.test(projectId)) throw new BadRequest("Which project?");
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Send { connectors: string[] }.");
    return json({ connectors: await setProjectConnectors(session.userId, projectId, [...new Set(parsed.data.connectors)]) });
  });
}
