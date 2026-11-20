// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { listTaskFiles } from "@/lib/agent/server/files";
import { fileSourceFor } from "@/lib/agent/server/tasks";
import { baseUrl, list, notFound, storeFor, v1 } from "@/lib/public-api/http";
import { loadTask } from "@/lib/public-api/tasks";
import { EXTRACTION_MARK } from "@/lib/public-api/structured";
import { finalMessage } from "@/lib/public-api/views";

/**
 * GET /api/v1/tasks/{id}/artifacts: what the task produced, as one list.
 * `type: "message"` (the final answer), `type: "json"` (the structured output, when asked for and ready),
 * `type: "file"` (every delivered file, with a download URL).
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return v1(req, async (ctx) => {
    const { id } = await params;
    const store = await storeFor(ctx.session);
    const t = await loadTask(ctx, store, id);
    const source = await fileSourceFor(store, id);
    if (!source) throw notFound("Task");
    const base = baseUrl(req);
    const out: Record<string, unknown>[] = [];
    // With an output schema, the last message is the JSON reply; the answer is the last one before the extraction turn.
    const ask = t.events.find((e) => e.type === "user.message" && e.text.startsWith(EXTRACTION_MARK));
    const answer = finalMessage(ask ? t.events.filter((e) => e.seq < ask.seq) : t.events);
    if (answer) out.push({ id: `art_msg_${answer.seq}`, object: "artifact", type: "message", text: answer.text, created_at: answer.at });
    if (t.api?.outputSchema && t.api.structuredState === "done") out.push({ id: `art_json_${id}`, object: "artifact", type: "json", value: t.api.structuredOutput });
    for (const f of await listTaskFiles(source)) {
      out.push({
        id: `art_${f.fileId}`,
        object: "artifact",
        type: "file",
        file_id: f.fileId,
        name: f.name,
        mime: f.mime ?? null,
        size: f.size ?? null,
        created_at: f.at ?? null,
        download_url: `${base}/api/v1/tasks/${id}/files/${encodeURIComponent(f.fileId)}`,
      });
    }
    return list(ctx, { data: out, hasMore: false, nextCursor: null });
  });
}
