import type { NextRequest } from "next/server";
import { CUSTOM_PREFIX, type ConnectorView, type ConnectorsResponse } from "@/lib/connectors/catalog";
import { appStatus, connectorCatalog, homeComputerId } from "@/lib/connectors/server";
import { listCustomConnectors } from "@/lib/db/connectors";
import { json, withUser } from "@/lib/orgo/http";

/**
 * GET /api/connectors: every connector the user can use, with live connection status.
 * Apps come from Orgo (Composio per computer, read live); custom MCP servers and APIs from our table.
 */
export function GET(req: NextRequest) {
  return withUser(req, async ({ session, orgo }) => {
    const computerId = await homeComputerId(session);
    const [{ apps, full }, status, custom] = await Promise.all([
      connectorCatalog(orgo),
      computerId ? appStatus(orgo, computerId).catch((err: unknown) => (err instanceof Error ? err : new Error("Apps aren't answering."))) : Promise.resolve({} as Record<string, boolean>),
      listCustomConnectors(session.userId).catch(() => []),
    ]);
    const statusMap = status instanceof Error ? {} : status;
    const connectors: ConnectorView[] = apps.map((app) => ({ ...app, type: "app" as const, connected: statusMap[app.slug] === true }));
    // A connected app that is not in the catalog we loaded (full catalog unavailable) still shows.
    for (const [slug, on] of Object.entries(statusMap)) {
      if (on && !connectors.some((c) => c.slug === slug)) connectors.push({ slug, name: slug, description: "Connected app", category: "Other", logo: `https://logos.composio.dev/api/${slug}`, type: "app", connected: true });
    }
    for (const c of custom) {
      connectors.push({
        slug: `${CUSTOM_PREFIX}${c.serverName}`,
        id: c.id,
        name: c.name,
        description: c.kind === "mcp" ? `Custom MCP · ${c.tools.length} tool${c.tools.length === 1 ? "" : "s"}` : "Custom API",
        category: "Other",
        logo: "",
        type: c.kind,
        connected: c.status === "ready",
        status: c.status,
        detail: c.kind === "mcp" ? (c.transport === "command" ? [c.command, ...c.args].join(" ") : (c.url ?? "")) : (c.url ?? ""),
        tools: c.tools,
      });
    }
    const body: ConnectorsResponse = {
      connectors,
      configured: !!computerId,
      computerId,
      fullCatalog: full,
      ...(status instanceof Error ? { error: status.message } : {}),
    };
    return json(body);
  });
}
