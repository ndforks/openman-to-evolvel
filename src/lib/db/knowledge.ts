/** Knowledge entries: things the agent should know and when to use them. At most 50 per user. */
import { db, DbError, fail, iso } from "./client";

export interface Knowledge {
  id: string;
  name: string;
  whenToUse: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeInput = Partial<Pick<Knowledge, "name" | "whenToUse" | "content" | "enabled">>;

export const KNOWLEDGE_MAX = 50;

interface Row {
  id: string;
  name: string;
  when_to_use: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
const toKnowledge = (r: Row): Knowledge => ({
  id: r.id,
  name: r.name,
  whenToUse: r.when_to_use,
  content: r.content,
  enabled: r.enabled,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
function toRow(k: KnowledgeInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (k.name !== undefined) row.name = k.name;
  if (k.whenToUse !== undefined) row.when_to_use = k.whenToUse;
  if (k.content !== undefined) row.content = k.content;
  if (k.enabled !== undefined) row.enabled = k.enabled;
  return row;
}

export async function listKnowledge(userId: string, opts: { enabledOnly?: boolean } = {}): Promise<Knowledge[]> {
  let q = db().from("knowledge").select("*").eq("user_id", userId);
  if (opts.enabledOnly) q = q.eq("enabled", true);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) fail("list knowledge", error);
  return (data as Row[]).map(toKnowledge);
}

export async function getKnowledge(userId: string, id: string): Promise<Knowledge | null> {
  const { data, error } = await db().from("knowledge").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get knowledge", error);
  return data ? toKnowledge(data as Row) : null;
}

export async function createKnowledge(userId: string, input: KnowledgeInput & { name: string }): Promise<Knowledge> {
  const { count, error: countError } = await db().from("knowledge").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (countError) fail("count knowledge", countError);
  if ((count ?? 0) >= KNOWLEDGE_MAX) throw new DbError(`You can keep at most ${KNOWLEDGE_MAX} knowledge entries.`, "limit");
  const { data, error } = await db().from("knowledge").insert({ ...toRow(input), user_id: userId }).select("*").single();
  if (error) fail("create knowledge", error);
  return toKnowledge(data as Row);
}

export async function updateKnowledge(userId: string, id: string, patch: KnowledgeInput): Promise<Knowledge | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getKnowledge(userId, id);
  const { data, error } = await db().from("knowledge").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
  if (error) fail("update knowledge", error);
  return data ? toKnowledge(data as Row) : null;
}

export async function deleteKnowledge(userId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from("knowledge").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) fail("delete knowledge", error);
  return (data ?? []).length > 0;
}
