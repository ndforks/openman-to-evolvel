import type { NextRequest } from "next/server";
import { openTerminalStream, redeemTicket, terminalSocketUrl } from "@/lib/agent/server/terminal";
import { NOT_CONFIGURED, computerScope, json, withUser } from "@/lib/orgo/http";

const clamp = (v: string | null, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
};

/** GET /api/computers/[id]/terminal/stream?ticket=&cols=&rows=: the terminal's output as server-sent events. */
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async (ctx) => {
    const scope = await computerScope(ctx);
    if (!scope) return json({ error: NOT_CONFIGURED }, 409);
    const { id } = await params;
    const ticket = redeemTicket(req.nextUrl.searchParams.get("ticket") ?? "", ctx.session.userId, id);
    if (!ticket) return json({ error: "This terminal link expired. Open the terminal again." }, 403);
    const creds = await scope.client.vncPassword(ticket.computerId);
    const desktopToken = creds.desktop_api_token || creds.password;
    const cols = clamp(req.nextUrl.searchParams.get("cols"), 20, 400, 120);
    const rows = clamp(req.nextUrl.searchParams.get("rows"), 5, 200, 32);
    const url = terminalSocketUrl(scope.client.baseUrl, ticket.computerId, desktopToken, ticket.session, cols, rows);
    return new Response(openTerminalStream(ticket, url, req.signal), {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  });
}
