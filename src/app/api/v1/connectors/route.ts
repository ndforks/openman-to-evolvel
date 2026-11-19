import type { NextRequest } from "next/server";
import { CUSTOM_PREFIX } from "@/lib/connectors/catalog";
import { appStatus, connectorCatalog, homeComputerId } from "@/lib/connectors/server";
import { listCustomConnectors } from "@/lib/db/connectors";
import { list, paginate, v1 } from "@/lib/public-api/http";
import { orgoFor } from "@/lib/session";

/**
 * GET /api/v1/connectors?connected=true: apps (through Orgo) and custom MCP servers / APIs, with live connection status.
 * Pass `slug`s in `connectors` on task create.
 */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const orgo = await orgoFor(ctx.session);
    const computerId = await homeComputerId(ctx.session);
    const [{ apps }, status, custom] = await Promise.all([
      connectorCatalog(orgo),
      computerId ? appStatus(orgo, computerId).catch(() => ({}) as Record<string, boolean>) : Promise.resolve({} as Record<string, boolean>),
      listCustomConnectors(ctx.session.userId).catch(() => []),
    ]);
    const out = apps.map((a) => ({ slug: a.slug, object: "connector" as const, name: a.name, description: a.description, category: a.category, type: "app", connected: status[a.slug] === true }));
    for (const [slug, on] of Object.entries(status)) if (on && !out.some((c) => c.slug === slug)) out.push({ slug, object: "connector", name: slug, description: "Connected app", category: "Other", type: "app", connected: true });
    for (const c of custom) out.push({ slug: `${CUSTOM_PREFIX}${c.serverName}`, object: "connector", name: c.name, description: c.kind === "mcp" ? "Custom MCP server" : "Custom API", category: "Other", type: c.kind, connected: c.status === "ready" });
    const onlyConnected = req.nextUrl.searchParams.get("connected") === "true";
    return list(ctx, paginate(onlyConnected ? out.filter((c) => c.connected) : out, req, (c) => c.slug, 100));
  });
}
