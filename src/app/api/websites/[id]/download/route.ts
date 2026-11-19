// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { type NextRequest } from "next/server";
import { siteRoute, type IdParams } from "@/lib/websites/http";
import { downloadArchive } from "@/lib/websites/server";

/** GET: the site's source code as a .tar.gz. */
export function GET(req: NextRequest, ctx: IdParams) {
  return siteRoute(req, ctx, async (session, row) => {
    const { name, bytes } = await downloadArchive(session, row);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "Cache-Control": "no-store" },
    }) as never;
  });
}
