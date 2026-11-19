import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { attachmentsSchema } from "@/lib/agent/attachments";
import { jsonError, readBody } from "@/lib/agent/server/http";
import { isActiveStatus, liveRuntime } from "@/lib/agent/server/relay";
import { isModeId } from "@/lib/agent/server/tasks";
import { getWebsiteRowForTask, listWebsiteRows, toWebsite } from "@/lib/db/websites";
import { noStore, storeRoute } from "@/lib/websites/http";
import { createWebsite, syncWebsite } from "@/lib/websites/server";

const createSchema = z.object({
  prompt: z.string().trim().min(1, "Describe the website first.").max(200_000),
  name: z.string().trim().max(80).optional(),
  mode: z.unknown().transform((v) => (isModeId(v) ? v : "standard")),
  effort: z.enum(["medium", "high", "extra", "ultra"]).optional().catch(undefined),
  speed: z.enum(["normal", "fast"]).optional().catch(undefined),
  connectors: z.array(z.string().max(200)).max(100).optional(),
  attachments: attachmentsSchema.optional(),
});

/**
 * GET /api/websites: the caller's sites, newest first.
 * GET /api/websites?taskId=X: `{ site, preview }` for the site that task builds (site null when it builds none).
 * The task form also syncs the site (reads the agent's marker, opens the preview URL once the dev server answers).
 */
export function GET(req: NextRequest) {
  return storeRoute(req, async (store, session) => {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ sites: (await listWebsiteRows(session.userId)).map(toWebsite) }, { headers: noStore });
    const row = await getWebsiteRowForTask(session.userId, taskId);
    if (!row) return NextResponse.json({ site: null, preview: null }, { headers: noStore });
    const status = liveRuntime(store, taskId)?.task.status ?? (await store.getTask(taskId))?.status;
    const result = await syncWebsite(session, row, { taskIdle: !!status && !isActiveStatus(status) });
    return NextResponse.json(result, { headers: noStore });
  });
}

/** POST /api/websites: "Build a website". Creates the site folder and starts the agent task with the site contract. */
export function POST(req: NextRequest) {
  return storeRoute(req, async (store, session) => {
    const body = await readBody(req, createSchema);
    if ("error" in body) return body.error;
    if (store.kind !== "supabase") return jsonError("Websites need the database.", 503);
    const { site, task } = await createWebsite(store, session, body.data);
    return NextResponse.json({ site, task }, { status: 201 });
  });
}
