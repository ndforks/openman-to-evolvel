// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Route plumbing for `/api/generators/*`: the caller's store, and generator errors as JSON. Server only. */
import type { NextRequest, NextResponse } from "next/server";
import type { Session } from "@/lib/session";
import type { Store } from "@/lib/store/types";
import { jsonError, withStore } from "@/lib/agent/server/http";
import { GeneratorError } from "./server";

export const noStore = { "Cache-Control": "no-store" };

export function generatorRoute(req: NextRequest, handler: (store: Store, session: Session) => Promise<NextResponse | Response>): Promise<NextResponse> {
  return withStore(req, async (store, session) => {
    try {
      return (await handler(store, session)) as NextResponse;
    } catch (err) {
      if (err instanceof GeneratorError) return jsonError(err.message, err.status);
      throw err;
    }
  });
}
