// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { SLUG, homeComputerId, startAppConnect } from "@/lib/connectors/server";
import { BadRequest, json, readJson, withUser } from "@/lib/orgo/http";

const bodySchema = z.object({ fields: z.record(z.string(), z.string().max(4000)).optional() }).nullish();

/**
 * POST /api/connectors/{slug}/connect: begins an app sign-in on the user's home computer.
 * Answers `{ url }` to open in a popup (then poll GET /api/connectors), `{ needs, asks }` for a key app,
 * or `{ url: null, alreadyConnected }` when `fields` connected it at once.
 */
export function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withUser(req, async ({ session, orgo }) => {
    const { slug } = await params;
    if (!SLUG.test(slug)) throw new BadRequest("Which app?");
    const computerId = await homeComputerId(session);
    if (!computerId) return json({ error: "Your agent's computer isn't set up yet. Start a task first, then connect apps." }, 409);
    const raw = req.headers.get("content-length") === "0" ? null : await readJson(req).catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    const fields = parsed.success ? parsed.data?.fields : undefined;
    return json(await startAppConnect(orgo, computerId, slug, fields));
  });
}
