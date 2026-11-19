/**
 * Custom connectors (MCP servers, APIs) and per-project connector selection. Server only.
 * App sign-ins themselves live in Orgo (Composio, per computer) and are never stored here.
 */
import { db, fail, iso } from "./client";

export type CustomKind = "mcp" | "api";
export type McpTransport = "http" | "command";

export interface CustomConnectorRecord {
  id: string;
  kind: CustomKind;
  name: string;
  transport: McpTransport | null;
  url: string | null;
  command: string | null;
  args: string[];
  /** Sealed JSON (headers for MCP, the key for an API). Never send to a browser. */
  secretEnc: string | null;
  authHeader: string | null;
  serverName: string;
  tools: { name: string; description?: string }[];
  status: string;
  statusDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: CustomKind;
  name: string;
  transport: McpTransport | null;
  url: string | null;
  command: string | null;
  args: string[] | null;
  secret_enc: string | null;
  auth_header: string | null;
  server_name: string;
  tools: { name: string; description?: string }[] | null;
  status: string;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
}

const COLS = "id,kind,name,transport,url,command,args,secret_enc,auth_header,server_name,tools,status,status_detail,created_at,updated_at";

const fromRow = (r: Row): CustomConnectorRecord => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  transport: r.transport,
  url: r.url,
  command: r.command,
  args: r.args ?? [],
  secretEnc: r.secret_enc,
  authHeader: r.auth_header,
  serverName: r.server_name,
  tools: r.tools ?? [],
  status: r.status,
  statusDetail: r.status_detail,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listCustomConnectors(userId: string): Promise<CustomConnectorRecord[]> {
  const { data, error } = await db().from("custom_connectors").select(COLS).eq("user_id", userId).order("created_at");
  if (error) fail("list custom connectors", error);
  return (data as Row[]).map(fromRow);
}

export async function getCustomConnector(userId: string, id: string): Promise<CustomConnectorRecord | null> {
  const { data, error } = await db().from("custom_connectors").select(COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) fail("get custom connector", error);
  return data ? fromRow(data as Row) : null;
}

export interface NewCustomConnector {
  kind: CustomKind;
  name: string;
  transport?: McpTransport | null;
  url?: string | null;
  command?: string | null;
  args?: string[];
  secretEnc?: string | null;
  authHeader?: string | null;
  serverName: string;
  tools?: { name: string; description?: string }[];
  status?: string;
  statusDetail?: string | null;
}

export async function insertCustomConnector(userId: string, c: NewCustomConnector): Promise<CustomConnectorRecord> {
  const { data, error } = await db()
    .from("custom_connectors")
    .insert({
      user_id: userId,
      kind: c.kind,
      name: c.name,
      transport: c.transport ?? null,
      url: c.url ?? null,
      command: c.command ?? null,
      args: c.args ?? [],
      secret_enc: c.secretEnc ?? null,
      auth_header: c.authHeader ?? null,
      server_name: c.serverName,
      tools: c.tools ?? [],
      status: c.status ?? "pending",
      status_detail: c.statusDetail ?? null,
    })
    .select(COLS)
    .single();
  if (error) fail("add custom connector", error);
  return fromRow(data as Row);
}

export async function updateCustomConnector(userId: string, id: string, patch: { status?: string; statusDetail?: string | null; tools?: { name: string; description?: string }[] }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.statusDetail !== undefined) row.status_detail = patch.statusDetail;
  if (patch.tools !== undefined) row.tools = patch.tools;
  const { error } = await db().from("custom_connectors").update(row).eq("user_id", userId).eq("id", id);
  if (error) fail("update custom connector", error);
}

export async function deleteCustomConnector(userId: string, id: string): Promise<void> {
  const { error } = await db().from("custom_connectors").delete().eq("user_id", userId).eq("id", id);
  if (error) fail("remove custom connector", error);
}

export async function getProjectConnectors(userId: string, projectId: string): Promise<string[]> {
  const { data, error } = await db().from("project_connectors").select("connectors").eq("user_id", userId).eq("project_id", projectId).maybeSingle();
  if (error) fail("get project connectors", error);
  return ((data as { connectors?: string[] } | null)?.connectors ?? []) as string[];
}

export async function setProjectConnectors(userId: string, projectId: string, connectors: string[]): Promise<string[]> {
  const { error } = await db().from("project_connectors").upsert({ user_id: userId, project_id: projectId, connectors }, { onConflict: "user_id,project_id" });
  if (error) fail("save project connectors", error);
  return connectors;
}
