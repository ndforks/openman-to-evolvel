/** Automation shapes shared by the server and the browser. No server imports here. */
import { z } from "zod";

export const KINDS = ["schedule", "trigger", "advanced"] as const;
export type AutomationKind = (typeof KINDS)[number];

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00.");
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-20.");

export const repeatRuleSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("once"), date: YMD, time: HHMM }),
  z.object({ freq: z.literal("daily"), time: HHMM }),
  z.object({ freq: z.literal("weekdays"), time: HHMM }),
  z.object({ freq: z.literal("weekly"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), time: HHMM }),
  z.object({ freq: z.literal("monthly"), dates: z.array(z.number().int().min(1).max(31)).min(1).max(31), time: HHMM }),
  z.object({ freq: z.literal("interval"), everyMinutes: z.number().int().min(1).max(60 * 24 * 31) }),
]);
export type RepeatRule = z.infer<typeof repeatRuleSchema>;

export const conditionSchema = z.object({
  field: z.string().trim().min(1).max(200),
  op: z.enum(["equals", "not_equals", "contains", "not_contains", "starts_with", "exists", "greater_than", "less_than"]),
  value: z.string().max(1000).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

const conditions = z.array(conditionSchema).max(10).default([]);
const triggerId = z.string().max(64).optional();

/** What the browser sends. The auth header value is write-only: omitted means "keep the stored one". */
export const triggerInputSchema = z.discriminatedUnion("type", [
  z.object({ id: triggerId, type: z.literal("webhook"), authHeaderName: z.string().trim().max(100).optional(), authHeaderValue: z.string().max(2000).optional(), conditions }),
  z.object({ id: triggerId, type: z.literal("rss"), url: z.string().trim().url("Enter the feed URL.").max(2000), conditions }),
  z.object({ id: triggerId, type: z.literal("email"), senders: z.array(z.string().trim().max(320)).max(50).default([]), conditions }),
  z.object({ id: triggerId, type: z.literal("timer"), rule: repeatRuleSchema }),
]);
export type TriggerInput = z.infer<typeof triggerInputSchema>;

/** A trigger as stored (server side). */
export type StoredTrigger =
  | { id: string; type: "webhook"; authHeaderName?: string; authHeaderValueEnc?: string; conditions: Condition[] }
  | { id: string; type: "rss"; url: string; conditions: Condition[] }
  | { id: string; type: "email"; address: string; senders: string[]; conditions: Condition[] }
  | { id: string; type: "timer"; rule: RepeatRule };

/** A trigger as the browser sees it. */
export type TriggerView =
  | { id: string; type: "webhook"; url: string; authHeaderName?: string; hasAuthValue: boolean; conditions: Condition[] }
  | { id: string; type: "rss"; url: string; conditions: Condition[] }
  | { id: string; type: "email"; address: string; senders: string[]; conditions: Condition[] }
  | { id: string; type: "timer"; rule: RepeatRule };

export const automationInputSchema = z.object({
  name: z.string().trim().max(120).optional(),
  kind: z.enum(KINDS).default("schedule"),
  prompt: z.string().trim().min(1, "Describe what the agent should do.").max(20_000),
  repeat: repeatRuleSchema.nullish(),
  timezone: z.string().trim().max(64).default("UTC"),
  endsAt: z.string().datetime({ offset: true }).nullish(),
  triggers: z.array(triggerInputSchema).max(10).default([]),
  mode: z.string().max(20).default("standard"),
  runIn: z.enum(["new", "same"]).default("new"),
  projectId: z.string().max(200).nullish(),
  connectors: z.array(z.string().max(200)).max(100).default([]),
  enabled: z.boolean().default(true),
  sourceTaskId: z.string().max(64).nullish(),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;

export type RunStatus = "queued" | "running" | "completed" | "failed" | "stopped";
export type RunTrigger = "schedule" | "webhook" | "rss" | "email" | "app" | "test" | "retry";

export interface AutomationView {
  id: string;
  name: string;
  kind: AutomationKind;
  prompt: string;
  repeat: RepeatRule | null;
  timezone: string;
  endsAt: string | null;
  triggers: TriggerView[];
  mode: string;
  runIn: "new" | "same";
  projectId: string | null;
  connectors: string[];
  enabled: boolean;
  pausedReason: string | null;
  failureCount: number;
  taskId: string | null;
  sourceTaskId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Plain-language timing, e.g. "Every weekday at 9:00 AM". */
  describe: string;
  lastRun: RunView | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunView {
  id: string;
  automationId: string;
  automationName?: string;
  taskId: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  summary: string | null;
  error: string | null;
  attempt: number;
  scheduledFor: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AutomationsMeta {
  plan: string;
  limit: number;
  used: number;
  minIntervalMinutes: number;
  emailTriggers: boolean;
  appTriggers: boolean;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export function describeRule(rule: RepeatRule): string {
  switch (rule.freq) {
    case "once":
      return `Once on ${rule.date} at ${formatTime(rule.time)}`;
    case "daily":
      return `Every day at ${formatTime(rule.time)}`;
    case "weekdays":
      return `Every weekday at ${formatTime(rule.time)}`;
    case "weekly":
      return `Weekly on ${[...rule.days].sort().map((d) => WEEKDAY_SHORT[d]).join(", ")} at ${formatTime(rule.time)}`;
    case "monthly":
      return `Monthly on the ${[...rule.dates].sort((a, b) => a - b).map(ordinal).join(", ")} at ${formatTime(rule.time)}`;
    case "interval":
      return rule.everyMinutes % 60 === 0 ? `Every ${rule.everyMinutes / 60 === 1 ? "hour" : `${rule.everyMinutes / 60} hours`}` : `Every ${rule.everyMinutes} minutes`;
  }
}

export function triggerLabel(t: Pick<TriggerView, "type">): string {
  return { webhook: "Webhook", rss: "RSS", email: "Email", timer: "Timer" }[t.type];
}
