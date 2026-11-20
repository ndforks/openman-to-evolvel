// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Operator alerts, checked on every scheduler tick (`/api/cron/tick`) and on every deep health check (which is how
 * a dead tick is noticed: point an uptime monitor at `/api/health/deep`). An alert becomes an in-app notification
 * for each operator (link `/app/admin`) and, when `OPS_ALERT_WEBHOOK_URL` is set, a JSON POST with a Slack-style
 * `text` field. Each kind is sent at most once an hour (`ops_alerts`). Server only.
 */
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/db/notifications";
import { devUserEnabled, DEV_USER_ID } from "@/lib/session";
import { inviteGateOn } from "@/lib/session/invites";
import { GLOBAL_PER_HOUR } from "@/lib/session/signin-limit";
import { signInStartsThisHour } from "./health";
import { TICK_LATE_MS, type Heartbeat } from "./heartbeat";
import { logEvent } from "./log";
import { redactString } from "./redact";

export type AlertKind = "tick_late" | "error_rate" | "provisioning_failures" | "signin_budget";

export interface Alert {
  kind: AlertKind;
  title: string;
  body: string;
}

const COOLDOWN_MS = 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function countEvents(filter: { level?: string; event?: string }, sinceMs: number, untilMs = 0): Promise<number> {
  let q = db().from("ops_events").select("id", { count: "exact", head: true }).gte("at", ago(sinceMs));
  if (untilMs) q = q.lt("at", ago(untilMs));
  if (filter.level) q = q.eq("level", filter.level);
  if (filter.event) q = q.eq("event", filter.event);
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

/** Operator user ids: the invite list's owner, `OPERATOR_USER_IDS`, and the dev user locally. */
export async function operatorUserIds(): Promise<string[]> {
  const ids = new Set<string>((process.env.OPERATOR_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  if (inviteGateOn()) {
    const { data } = await db().from("invites").select("orgo_user_id").eq("role", "owner").limit(5);
    for (const r of (data ?? []) as { orgo_user_id: string | null }[]) if (r.orgo_user_id) ids.add(r.orgo_user_id);
  }
  if (devUserEnabled()) ids.add(DEV_USER_ID);
  return [...ids];
}

/** True when this kind may be sent now (and marks it sent). */
async function claim(kind: AlertKind, detail: string): Promise<boolean> {
  const { data } = await db().from("ops_alerts").select("last_sent_at,count").eq("key", kind).maybeSingle();
  const row = data as { last_sent_at: string; count: number } | null;
  if (row && Date.now() - Date.parse(row.last_sent_at) < COOLDOWN_MS) return false;
  const { error } = await db().from("ops_alerts").upsert({ key: kind, last_sent_at: new Date().toISOString(), last_detail: detail.slice(0, 500), count: (row?.count ?? 0) + 1 });
  return !error;
}

async function postWebhook(alert: Alert): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url || !/^https:\/\//i.test(url)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[OpenMan ops] ${alert.title}: ${alert.body}`, alert: alert.kind, title: alert.title, body: alert.body, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    await logEvent("warn", "ops.alert_webhook_failed", { data: { kind: alert.kind } });
  }
}

/** Sends an alert unless the same kind went out within the hour. Returns whether it was sent. */
export async function raise(alert: Alert): Promise<boolean> {
  const safe = { ...alert, title: redactString(alert.title, 120), body: redactString(alert.body, 500) };
  if (!(await claim(safe.kind, safe.body).catch(() => false))) return false;
  await logEvent("warn", "ops.alert", { message: `${safe.title}: ${safe.body}`, data: { kind: safe.kind } });
  const ids = await operatorUserIds().catch(() => []);
  await Promise.all(ids.map((id) => createNotification(id, { kind: "ops", title: safe.title, body: safe.body, link: "/app/admin" }).catch(() => undefined)));
  await postWebhook(safe);
  return true;
}

/** Late tick seen from outside the tick (deep health): the heartbeat is older than the threshold. */
export async function checkStaleTick(last: Heartbeat | null): Promise<Alert | null> {
  if (!last) return null;
  const age = Date.now() - Date.parse(last.at);
  if (age <= TICK_LATE_MS) return null;
  const alert: Alert = { kind: "tick_late", title: "Scheduler tick is late", body: `No tick for ${Math.round(age / 60_000)} minutes (expected every minute). Automations, webhooks and alerts are not running. See docs/OPERATIONS.md, "Drain a stuck queue".` };
  return (await raise(alert)) ? alert : null;
}

/**
 * The checks run inside every tick. `previous` is the heartbeat before this one: a gap means the tick was late
 * (and has just recovered).
 */
export async function runAlertChecks(previous: Heartbeat | null): Promise<AlertKind[]> {
  const sent: AlertKind[] = [];
  const fire = async (a: Alert) => {
    if (await raise(a)) sent.push(a.kind);
  };

  if (previous) {
    const gap = Date.now() - Date.parse(previous.at);
    if (gap > TICK_LATE_MS) await fire({ kind: "tick_late", title: "Scheduler tick was late", body: `${Math.round(gap / 60_000)} minutes passed between ticks (expected one). It is running again; check the worker log for why it stopped.` });
  }

  // Error rate: last 15 minutes against the average 15 minutes of the two hours before.
  const recent = await countEvents({ level: "error" }, 15 * 60_000);
  if (recent >= 10) {
    const before = await countEvents({ level: "error" }, 135 * 60_000, 15 * 60_000);
    const baseline = before / 8;
    if (recent >= Math.max(10, baseline * 3)) await fire({ kind: "error_rate", title: "Error rate jumped", body: `${recent} errors in the last 15 minutes (usual: about ${baseline.toFixed(1)}). Recent errors are listed on /app/admin.` });
  }

  const provFailed = await countEvents({ event: "provision.failed" }, 60 * 60_000);
  if (provFailed >= 3) await fire({ kind: "provisioning_failures", title: "Provisioning keeps failing", body: `${provFailed} home-computer setups failed in the last hour. Check Orgo status and the provisioning errors on /app/admin.` });

  const starts = await signInStartsThisHour();
  if (starts !== null && starts >= GLOBAL_PER_HOUR) await fire({ kind: "signin_budget", title: "Sign-in budget used up", body: `${starts} sign-in starts this hour (budget ${GLOBAL_PER_HOUR}, Orgo allows 20). New people see "Sign-in is busy" until the hour turns. Repeated: see docs/ORGO-ASKS.md #2.` });

  return sent;
}
