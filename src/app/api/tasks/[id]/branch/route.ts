import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withTask } from "@/lib/agent/server/http";
import { DeriveError, branchTask } from "@/lib/agent/server/derive";
import { viewOf } from "@/lib/agent/server/tasks";

const schema = z.object({ uptoSeq: z.number().int().positive().optional() });

/**
 * POST /api/tasks/[id]/branch: a new task that keeps this task's conversation and files up to the reply that ends
 * at `uptoSeq` (default: all of it), with the same project, connectors and mode. Owner only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withTask(
    req,
    id,
    async ({ store }) => {
      const body = await readBody(req, schema);
      if ("error" in body) return body.error;
      try {
        const task = await branchTask(store, id, body.data.uptoSeq);
        return NextResponse.json({ task: viewOf(task) }, { status: 201 });
      } catch (err) {
        if (err instanceof DeriveError) return jsonError(err.message, err.status);
        throw err;
      }
    },
    { ownerOnly: true },
  );
}
