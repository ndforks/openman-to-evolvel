/** Route plumbing shared by `/api/mail`, `/api/phone` and the two vendor webhooks. */
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readBody, withSession } from "@/lib/agent/server/http";
import type { Session } from "@/lib/session";
import { PhoneError } from "@/lib/phone/service";
import { MailError } from "./service";
import { VendorError, clearOverride, overridesAllowed, setOverride, vendorReady, type Vendor } from "./vendor";

export { jsonError, readBody };

/** `requireSession()` first, then the handler; feature errors keep their status and message. */
export function route(req: NextRequest, handler: (session: Session) => Promise<NextResponse>): Promise<NextResponse> {
  return withSession(req, async (session) => {
    try {
      return await handler(session);
    } catch (err) {
      if (err instanceof MailError || err instanceof PhoneError) return jsonError(err.message, err.status);
      if (err instanceof VendorError) return jsonError(err.message, err.code === "not_configured" ? 503 : 502);
      throw err;
    }
  });
}

export const NOT_SET_UP: Record<Vendor, string> = {
  agentmail: "Email isn't set up on this server yet.",
  agentphone: "Phone isn't set up on this server yet.",
};

/** 503 with the one-line "not set up" message when the vendor key is absent. */
export function requireVendor(vendor: Vendor): NextResponse | null {
  return vendorReady(vendor) ? null : NextResponse.json({ error: NOT_SET_UP[vendor], code: "not_configured" }, { status: 503 });
}

function isLocal(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Test-only override of a vendor's key, webhook secret and base URL (see `vendor.ts`). Refused in
 * production, off localhost, and for anyone but the local dev user.
 */
export function testConfigRoute(vendor: Vendor) {
  const handler = (req: NextRequest) =>
    route(req, async (session) => {
      if (!overridesAllowed() || !isLocal(req) || !session.dev) return jsonError("Not found.", 404);
      if (req.method === "DELETE") {
        clearOverride(vendor);
        return NextResponse.json({ ok: true });
      }
      const body = (await req.json().catch(() => null)) as { apiKey?: unknown; webhookSecret?: unknown; baseUrl?: unknown; ttlMs?: unknown; podId?: unknown; domain?: unknown; subAccountId?: unknown } | null;
      const base = typeof body?.baseUrl === "string" ? body.baseUrl : "";
      if (!body || typeof body.apiKey !== "string" || typeof body.webhookSecret !== "string" || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
        return jsonError("Send apiKey, webhookSecret and a local baseUrl.", 400);
      }
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
      setOverride(vendor, {
        apiKey: body.apiKey,
        webhookSecret: body.webhookSecret,
        baseUrl: base,
        ttlMs: typeof body.ttlMs === "number" ? body.ttlMs : undefined,
        podId: str(body.podId),
        domain: str(body.domain),
        subAccountId: str(body.subAccountId),
      });
      return NextResponse.json({ ok: true });
    });
  return { POST: handler, DELETE: handler };
}
