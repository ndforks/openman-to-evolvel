// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireVendor, route } from "@/lib/mail/http";
import { availableNumbers, PHONE_PRICING } from "@/lib/phone/agentphone";

/**
 * GET /api/phone/available?country=US&areaCode=415: numbers AgentPhone would sell right now (live inventory, not
 * reserved) and the price. `widened: true` means the area code was out of stock and these are nearby alternatives;
 * a purchase with that area code may then get a nearby number.
 */
export function GET(req: NextRequest) {
  return route(req, async () => {
    const off = requireVendor("agentphone");
    if (off) return off;
    const country = req.nextUrl.searchParams.get("country") === "CA" ? "CA" : "US";
    const areaCode = (req.nextUrl.searchParams.get("areaCode") ?? "").trim();
    if (areaCode && !/^\d{3}$/.test(areaCode)) return jsonError("An area code is three digits.", 400);
    const found = await availableNumbers({ country, ...(areaCode ? { areaCode } : {}), limit: 5 });
    return NextResponse.json({
      numbers: (found.data ?? []).map((n) => ({ phoneNumber: n.phoneNumber, areaCode: n.areaCode ?? null, city: n.city ?? null, state: n.state ?? null })),
      widened: !!found.widened,
      pricing: PHONE_PRICING,
    });
  });
}
