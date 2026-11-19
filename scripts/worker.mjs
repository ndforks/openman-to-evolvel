#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// The automations clock for a server deployment: calls POST /api/cron/tick once a minute.
//   node scripts/worker.mjs                 (APP_URL from the environment or .env.local; default http://localhost:3000)
//   APP_URL=https://app.example.com node scripts/worker.mjs
//   node scripts/worker.mjs --once          (one tick, prints the result, exits)
// Reads CRON_SECRET from the environment or .env.local; never prints it. The tick is safe to call
// concurrently, so running two workers (or a worker plus an external cron) is harmless.
import { loadEnv } from "./env.mjs";

loadEnv();
const APP_URL = (process.env.APP_URL || process.env.WORKER_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET?.trim();
const EVERY_MS = Number(process.env.WORKER_EVERY_MS || 60_000);
const once = process.argv.includes("--once");

if (!SECRET) {
  console.error("[worker] CRON_SECRET is not set.");
  process.exit(1);
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => ((stopping = true), process.exit(0)));

async function tickOnce() {
  const started = Date.now();
  try {
    const res = await fetch(`${APP_URL}/api/cron/tick`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(55_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[worker] tick ${res.status}: ${body.error ?? "failed"}`);
      return body;
    }
    const line = `fired=${body.fired?.length ?? 0} polled=${body.polled ?? 0} retried=${body.retried ?? 0} checked=${body.checked ?? 0} finished=${body.finished ?? 0} errors=${body.errors?.length ?? 0}`;
    console.log(`[worker] ${new Date().toISOString()} ${line} (${Date.now() - started} ms)`);
    for (const e of body.errors ?? []) console.warn(`[worker]   ${e}`);
    return body;
  } catch (err) {
    console.error(`[worker] tick failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

if (once) {
  const body = await tickOnce();
  console.log(JSON.stringify(body, null, 2));
  process.exit(body ? 0 : 1);
}

console.log(`[worker] ticking ${APP_URL} every ${EVERY_MS / 1000}s`);
while (!stopping) {
  const t = Date.now();
  await tickOnce();
  // Align to the next interval boundary so minute schedules fire close to :00.
  const wait = EVERY_MS - ((Date.now() - t) % EVERY_MS) - (Date.now() % 1000);
  await new Promise((r) => setTimeout(r, Math.max(1_000, wait)));
}
