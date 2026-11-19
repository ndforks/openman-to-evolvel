import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withSession } from "@/lib/agent/server/http";
import { getSettings, patchSettings, replaceSettings, type SettingsDoc } from "@/lib/db/settings";

const MAX_BYTES = 256 * 1024;

async function readDoc(req: NextRequest): Promise<SettingsDoc | NextResponse> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return jsonError("Settings are limited to 256 KB.", 413);
  const text = await req.text();
  if (text.length > MAX_BYTES) return jsonError("Settings are limited to 256 KB.", 413);
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return jsonError("Send a JSON object.", 400);
    // `security` is server-owned (older builds kept the revocation time there); clients cannot write it.
    const { security: _security, ...rest } = value as SettingsDoc;
    void _security;
    return rest as SettingsDoc;
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }
}

/** GET /api/settings: `{ settings }`, the caller's whole document (`{}` before the first save). */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => NextResponse.json({ settings: await getSettings(session.userId) }));
}

/** PATCH /api/settings: deep-merge the body into the document; a `null` value removes that key. */
export function PATCH(req: NextRequest) {
  return withSession(req, async (session) => {
    const doc = await readDoc(req);
    if (doc instanceof NextResponse) return doc;
    return NextResponse.json({ settings: await patchSettings(session.userId, doc) });
  });
}

/** PUT /api/settings: replace the whole document. */
export function PUT(req: NextRequest) {
  return withSession(req, async (session) => {
    const doc = await readDoc(req);
    if (doc instanceof NextResponse) return doc;
    const current = await getSettings(session.userId);
    return NextResponse.json({ settings: await replaceSettings(session.userId, current.security !== undefined ? { ...doc, security: current.security } : doc) });
  });
}
