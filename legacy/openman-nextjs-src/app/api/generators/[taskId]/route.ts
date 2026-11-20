// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "@/lib/agent/server/http";
import { generatorRoute, noStore } from "@/lib/generators/http";
import { generatorState } from "@/lib/generators/server";

/**
 * GET /api/generators/[taskId]: what a generator task has produced so far (`GeneratorState`): the deck
 * manifest and exports, the analysis manifest, the batch research plan, progress and estimate, or the audio
 * manifest. `{ kind: null }` for an ordinary task.
 */
export function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  return generatorRoute(req, async (store) => {
    const { taskId } = await params;
    const state = await generatorState(store, taskId);
    return state ? NextResponse.json(state, { headers: noStore }) : notFound();
  });
}
