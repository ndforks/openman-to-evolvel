import { NextResponse, type NextRequest } from "next/server";
import { withStore } from "@/lib/agent/server/http";
import { computerFor } from "@/lib/agent/server/connection";
import { orgoFor } from "@/lib/session";

const ORGO_SECRETS_URL = "https://www.orgo.ai/settings/secrets";

/**
 * GET /api/tasks/model-key: whether the user's agent calls Claude with their own Anthropic key from Orgo Secrets
 * (billed by Anthropic, no Orgo credits for model usage) or through Orgo's models on credits. Read from Orgo's own
 * report for the home computer (`GET /computers/{id}/agent` -> `models: "own" | "orgo"`).
 */
export function GET(req: NextRequest) {
  return withStore(req, async (store, session) => {
    const computerId = computerFor(store.ownerId)?.computerId ?? null;
    let ownKey = false;
    let model: string | null = null;
    if (computerId) {
      try {
        const state = await (await orgoFor(session)).agentState(computerId);
        ownKey = state.models === "own";
        model = state.model ?? null;
      } catch {
        ownKey = false;
      }
    }
    return NextResponse.json({ ownKey, model, manageUrl: ORGO_SECRETS_URL }, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}
