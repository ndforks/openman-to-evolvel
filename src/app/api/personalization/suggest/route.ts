import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody, withStore } from "@/lib/agent/server/http";
import { getSettings, patchSettings } from "@/lib/db/settings";
import { KNOWLEDGE_MAX, listKnowledge } from "@/lib/db/knowledge";
import { isValidTaskId } from "@/lib/store";
import { SuggestError, suggestFromTask, type ProposedEntry } from "@/lib/personalization/suggest";

interface Cached {
  at: string;
  entries: ProposedEntry[];
  /** Names the user accepted or dismissed; they are not offered again. */
  done: string[];
}
type Cache = Record<string, Cached>;
const KEEP = 30;

async function readCache(userId: string): Promise<Cache> {
  const raw = (await getSettings(userId)).knowledgeSuggestions;
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Cache) : {};
}

const visible = (c: Cached | undefined) => (c ? c.entries.filter((e) => !c.done.includes(e.name)) : []);

/** GET /api/personalization/suggest?taskId=: `{ suggestions }` already proposed for the task (no model call). */
export function GET(req: NextRequest) {
  return withStore(req, async (_store, session) => {
    const taskId = req.nextUrl.searchParams.get("taskId") ?? "";
    if (!isValidTaskId(taskId)) return jsonError("Task not found.", 404);
    const cache = await readCache(session.userId);
    return NextResponse.json({ suggestions: visible(cache[taskId]), proposed: !!cache[taskId] });
  });
}

const schema = z.object({
  taskId: z.string(),
  /** Mark a proposal as handled (accepted or dismissed) instead of proposing. */
  done: z.string().max(200).optional(),
});

/**
 * POST /api/personalization/suggest `{ taskId }`: once per finished task, one cheap model call through the
 * user's agent proposes zero to two knowledge entries. Later calls return the stored proposal.
 * `{ taskId, done: name }` hides one proposal after the user accepted or dismissed it.
 */
export function POST(req: NextRequest) {
  return withStore(req, async (store, session) => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const { taskId, done } = body.data;
    if (!isValidTaskId(taskId)) return jsonError("Task not found.", 404);
    const task = await store.getTask(taskId);
    if (!task) return jsonError("Task not found.", 404);
    const cache = await readCache(session.userId);

    if (done !== undefined) {
      const entry = cache[taskId];
      if (entry && !entry.done.includes(done)) await patchSettings(session.userId, { knowledgeSuggestions: { [taskId]: { ...entry, done: [...entry.done, done] } } });
      return NextResponse.json({ suggestions: visible(entry ? { ...entry, done: [...entry.done, done] } : undefined) });
    }
    if (cache[taskId]) return NextResponse.json({ suggestions: visible(cache[taskId]), proposed: true });
    if (task.status !== "completed") return jsonError("Suggestions are made after a task completes.", 409);

    const knowledge = await listKnowledge(session.userId);
    if (knowledge.length >= KNOWLEDGE_MAX) return NextResponse.json({ suggestions: [], proposed: false, full: true });

    const events = await store.listEvents(taskId);
    const lines: string[] = [];
    for (const e of events) {
      if (e.type === "user.message") lines.push(`USER: ${e.text}`);
      else if (e.type === "message.completed") lines.push(`AGENT: ${e.text}`);
      else if (e.type === "tool.started") lines.push(`(agent used ${e.tool})`);
    }
    let transcript = lines.join("\n");
    // Keep the start (the request) and the end (the outcome, any corrections).
    if (transcript.length > 24_000) transcript = `${transcript.slice(0, 8_000)}\n…\n${transcript.slice(-16_000)}`;
    if (!transcript.trim()) return NextResponse.json({ suggestions: [], proposed: false });

    let entries: ProposedEntry[];
    try {
      entries = await suggestFromTask(session, transcript, knowledge.map((k) => k.name));
    } catch (err) {
      if (err instanceof SuggestError) return jsonError(err.message, err.status);
      throw err;
    }
    // Store the proposal (also when empty, so the model is asked only once per task) and drop old ones.
    const stale = Object.entries(cache)
      .sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
      .slice(KEEP - 1)
      .map(([id]) => [id, null] as const);
    await patchSettings(session.userId, { knowledgeSuggestions: { ...Object.fromEntries(stale), [taskId]: { at: new Date().toISOString(), entries, done: [] } } });
    return NextResponse.json({ suggestions: entries, proposed: true });
  });
}
