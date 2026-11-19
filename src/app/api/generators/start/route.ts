import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { attachmentSchema } from "@/lib/agent/attachments";
import { jsonError, readBody } from "@/lib/agent/server/http";
import { isModeId } from "@/lib/agent/server/tasks";
import { generatorRoute } from "@/lib/generators/http";
import { availability, startGenerator } from "@/lib/generators/server";

const schema = z.object({
  kind: z.enum(["slides", "data", "research", "audio", "image", "video"]),
  variant: z.enum(["spreadsheet", "visualization", "topic", "speech"]).optional().catch(undefined),
  theme: z.string().max(40).optional(),
  prompt: z.string().trim().min(1, "Write a prompt first.").max(200_000),
  mode: z.unknown().transform((v) => (isModeId(v) ? v : "standard")),
  effort: z.enum(["medium", "high", "extra", "ultra"]).optional().catch(undefined),
  speed: z.enum(["normal", "fast"]).optional().catch(undefined),
  target: z.union([z.object({ kind: z.literal("cloud-temporary") }), z.object({ kind: z.literal("local") })]).optional().catch(undefined),
  projectId: z.string().max(200).nullish(),
  connectors: z.array(z.string().max(200)).max(100).optional(),
  attachments: z.array(z.union([attachmentSchema, z.object({ name: z.string().max(500), url: z.string().max(40_000_000) })])).max(20).optional(),
});

/**
 * POST /api/generators/start: start a generator task (slides, data, research, audio, and image or video when
 * available). Same body as POST /api/tasks plus `kind`, `variant` and `theme`. Answers `{ task }` (201).
 */
export function POST(req: NextRequest) {
  return generatorRoute(req, async (store) => {
    const body = await readBody(req, schema, 45 * 1024 * 1024);
    if ("error" in body) return body.error;
    const { kind, variant, theme, ...input } = body.data;
    const offered = (await availability(store)).find((g) => g.kind === kind);
    if (!offered?.available) return jsonError(offered?.needs ?? "This generator is not available.", 409);
    const task = await startGenerator(store, { kind, variant, theme, input: { ...input, projectId: input.projectId ?? null } });
    return NextResponse.json({ task }, { status: 201 });
  });
}
