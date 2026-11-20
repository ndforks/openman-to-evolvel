// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { ok, route } from "@/lib/recording/http";
import { homeView } from "@/lib/recording/server";

/**
 * GET /api/recordings/computer: where to watch and control the caller's home computer while recording.
 * `view.vncUrl` carries the computer's password: the browser uses it for the viewer only; never log it.
 */
export function GET() {
  return route("GET /api/recordings/computer", async (session) => ok(await homeView(session)));
}
