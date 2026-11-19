/** `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`), compared in constant time. Same rule as `/api/cron/tick`. */
import { timingSafeEqual } from "node:crypto";

export function cronAuthorized(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7).trim() : (headers.get("x-cron-secret") ?? "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
