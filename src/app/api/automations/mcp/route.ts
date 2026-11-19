import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/automations/http";
import { handleRpc, hermesConfigBlock, mintToken, revokeTokens, verifyToken } from "@/lib/automations/mcp";
import { publicBase } from "@/lib/automations/service";


/**
 * POST /api/automations/mcp: the automations MCP server for the user's Hermes (Streamable HTTP,
 * stateless, JSON responses). Auth is the per-user bearer token, not the browser session.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const userId = await verifyToken(auth.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!userId) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized." } }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > 256 * 1024) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, { status: 400 });
  }
  const out = await handleRpc(userId, body);
  if (out === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(out);
}

/**
 * GET /api/automations/mcp: for the signed-in user (`requireSession()`), their token and the Hermes
 * `mcp_servers` block. Provisioning calls this (or `mintToken`) and writes the block on the computer.
 * Without a session it answers 401 (it is also what a Streamable HTTP client probes for SSE).
 */
export function GET(req: NextRequest) {
  return route(req, async (session) => {
    const url = `${publicBase(process.env.APP_PUBLIC_URL)}/api/automations/mcp`;
    const token = mintToken(session.userId);
    return NextResponse.json({ url, token, hermesConfig: hermesConfigBlock(url, token) }, { headers: { "Cache-Control": "no-store" } });
  });
}

/**
 * DELETE /api/automations/mcp: revokes every automations token the signed-in user holds (the agent loses the
 * automations tool until the next setup on their computer writes a new one).
 */
export function DELETE(req: NextRequest) {
  return route(req, async (session) => {
    await revokeTokens(session.userId);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
