import { connection } from "next/server";

const startedAt = Date.now();

/**
 * GET /api/health: liveness. The process answers; nothing else is touched (no database, no Orgo, no secrets).
 * For readiness use `GET /api/health/deep` with the cron secret.
 */
export async function GET() {
  await connection();
  return Response.json(
    { ok: true, service: "openman", at: new Date().toISOString(), uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
