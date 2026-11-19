// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The start-up check for sign-in settings, Node runtime only (imported lazily by `src/instrumentation.ts`).
 * A thrown error in the instrumentation hook leaves `next start` running and answering 500 to everything, so an unsafe
 * setting stops the process instead: the reason goes to stderr and the exit code is 1. The rules are in `bypass.ts`.
 */
import { assertSafeStartup, startupProblems, type Env } from "./bypass";

export function enforceSafeStartup(env: Env = process.env, exit: (code: number) => never = (code) => process.exit(code)): void {
  for (const warning of startupProblems(env).warnings) console.warn(`[auth] ${warning}`);
  try {
    assertSafeStartup(env);
  } catch (err) {
    console.error(`[auth] ${err instanceof Error ? err.message : String(err)}`);
    exit(1);
  }
}
