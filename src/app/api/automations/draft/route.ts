// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/agent/server/http";
import { route } from "@/lib/automations/http";
import { parseDescription } from "@/lib/automations/parse";
import { isValidTimeZone } from "@/lib/automations/schedule";
import { emailTriggersEnabled } from "@/lib/automations/service";

const schema = z.object({ text: z.string().trim().min(3, "Describe the automation.").max(5000), timezone: z.string().max(64).default("UTC") });

/** POST /api/automations/draft: an Advanced automation draft from plain language, for review before creating. */
export function POST(req: NextRequest) {
  return route(req, async () => {
    const body = await readBody(req, schema);
    if ("error" in body) return body.error;
    const tz = isValidTimeZone(body.data.timezone) ? body.data.timezone : "UTC";
    return NextResponse.json({ draft: parseDescription(body.data.text, tz, { emailTriggers: emailTriggersEnabled() }) });
  });
}
