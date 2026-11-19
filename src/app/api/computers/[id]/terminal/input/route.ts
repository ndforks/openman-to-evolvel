import type { NextRequest } from "next/server";
import { z } from "zod";
import { terminalInput } from "@/lib/agent/server/terminal";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

const schema = z.object({ sid: z.string().min(10).max(80), data: z.string().max(16_384).optional(), cols: z.number().int().min(20).max(400).optional(), rows: z.number().int().min(5).max(200).optional() });

/** POST /api/computers/[id]/terminal/input `{ sid, data?, cols?, rows? }`: keystrokes or a resize for a live terminal of this user. */
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new BadRequest("Invalid terminal input.");
    const { id } = await params;
    const ok = terminalInput(ctx.session.userId, id, parsed.data.sid, parsed.data);
    return ok ? json({ ok: true }) : json({ error: "The terminal is closed. Open it again." }, 410);
  });
}
