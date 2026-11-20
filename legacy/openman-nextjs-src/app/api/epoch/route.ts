// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

/** The current "fresh start" marker. `scripts/fresh-start.sh` writes a new one; browsers that hold an older one clear their saved state. */
export async function GET() {
  await connection();
  let epoch = "0";
  try {
    epoch = (await readFile(path.join(process.cwd(), ".data", "epoch"), "utf8")).trim() || "0";
  } catch {
    // No marker yet: nothing has ever been reset.
  }
  return Response.json({ epoch }, { headers: { "cache-control": "no-store" } });
}
