/**
 * What the routes and the agent tool call: validate input, store it with its derived fields
 * (next run, poll time, webhook token, sealed header values) and shape it for the browser.
 */
import { agentmailDomain } from "@/lib/mail/vendor";
import { randomBytes } from "node:crypto";
import { seal } from "@/lib/crypto";
import {
  countEnabledAutomations,
  deleteAutomation,
  getAutomation,
  insertAutomation,
  latestRuns,
  listAutomations,
  updateAutomation,
  type AutomationPatch,
  type AutomationRecord,
  type RunRecord,
} from "@/lib/db/automations";
import { getProject } from "@/lib/db/projects";
import type { Session } from "@/lib/session";
import { computeNext, fireAutomation, hasPolling, timeRules } from "./engine";
import { limitsFor } from "./limits";
import { isValidTimeZone, minGapMinutes } from "./schedule";
import { describeRule, type AutomationInput, type AutomationView, type AutomationsMeta, type RunView, type StoredTrigger, type TriggerView } from "./types";

export class AutomationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const token = (bytes: number) => randomBytes(bytes).toString("base64url");

export function emailTriggersEnabled(): boolean {
  return process.env.AUTOMATION_EMAIL_INBOUND === "1";
}

/** Where inbound webhooks reach this app: the request's own origin, else APP_PUBLIC_URL. */
export function publicBase(origin?: string | null): string {
  return (origin || process.env.APP_PUBLIC_URL || "http://localhost:3001").replace(/\/+$/, "");
}

export function hookUrl(base: string, hookToken: string): string {
  return `${base}/api/hooks/${hookToken}`;
}

// ------------------------------------------------------------------ views

export function toRunView(r: RunRecord, name?: string): RunView {
  return {
    id: r.id,
    automationId: r.automationId,
    ...(name !== undefined ? { automationName: name } : {}),
    taskId: r.taskId,
    status: r.status,
    trigger: r.trigger,
    summary: r.summary,
    error: r.error,
    attempt: r.attempt,
    scheduledFor: r.scheduledFor,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

function triggerView(t: StoredTrigger, a: AutomationRecord, base: string): TriggerView {
  if (t.type === "webhook") return { id: t.id, type: "webhook", url: a.hookToken ? hookUrl(base, a.hookToken) : "", authHeaderName: t.authHeaderName, hasAuthValue: !!t.authHeaderValueEnc, conditions: t.conditions };
  return t;
}

export function describeAutomation(a: Pick<AutomationRecord, "repeat" | "triggers" | "endsAt" | "nextRunAt">): string {
  const parts: string[] = [];
  for (const rule of timeRules(a)) parts.push(describeRule(rule));
  for (const t of a.triggers) {
    if (t.type === "webhook") parts.push("When the webhook is called");
    if (t.type === "rss") parts.push(`When ${safeHost(t.url)} posts`);
    if (t.type === "email") parts.push(`When an email arrives at ${t.address}`);
  }
  return parts.join(" · ") || "No trigger";
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the feed";
  }
}

export function toView(a: AutomationRecord, base: string, last?: RunRecord | null): AutomationView {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    prompt: a.prompt,
    repeat: a.repeat,
    timezone: a.timezone,
    endsAt: a.endsAt,
    triggers: a.triggers.map((t) => triggerView(t, a, base)),
    mode: a.mode,
    runIn: a.runIn,
    projectId: a.projectId,
    connectors: a.connectors,
    enabled: a.enabled,
    pausedReason: a.pausedReason,
    failureCount: a.failureCount,
    taskId: a.taskId,
    sourceTaskId: a.sourceTaskId,
    lastRunAt: a.lastRunAt,
    nextRunAt: a.enabled ? a.nextRunAt : null,
    describe: describeAutomation(a),
    lastRun: last ? toRunView(last) : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export async function listViews(session: Session, base: string): Promise<AutomationView[]> {
  const all = await listAutomations(session.userId);
  const last = await latestRuns(
    session.userId,
    all.map((a) => a.id),
  );
  return all.map((a) => toView(a, base, last.get(a.id)));
}

export async function meta(session: Session): Promise<AutomationsMeta> {
  const limits = limitsFor(session.plan);
  return { plan: session.plan, limit: limits.maxEnabled, used: await countEnabledAutomations(session.userId), minIntervalMinutes: limits.minIntervalMinutes, emailTriggers: emailTriggersEnabled(), appTriggers: false };
}

// ------------------------------------------------------------------ writes

function nameFrom(prompt: string): string {
  const line = prompt.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "Automation";
  const clean = line.replace(/^[#>*\-\s]+/, "").replace(/\s+/g, " ");
  const cut = clean.length > 60 ? `${clean.slice(0, 57).replace(/\s+\S*$/, "")}…` : clean;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Validates input and builds the stored fields. `existing` keeps secrets and tokens on edit. */
async function build(session: Session, input: AutomationInput, existing?: AutomationRecord): Promise<AutomationPatch & { name: string; prompt: string }> {
  const limits = limitsFor(session.plan);
  if (!isValidTimeZone(input.timezone)) throw new AutomationError(`Unknown time zone "${input.timezone}".`);
  if (input.kind === "schedule" && !input.repeat) throw new AutomationError("Choose when the schedule runs.");
  if (input.kind !== "schedule" && !input.repeat && input.triggers.length === 0) throw new AutomationError("Add at least one trigger.");
  if (input.triggers.length > 10) throw new AutomationError("An automation can have at most 10 triggers.");
  if (input.triggers.filter((t) => t.type === "webhook").length > 1) throw new AutomationError("An automation can have one webhook trigger.");
  if (input.triggers.some((t) => t.type === "email") && !emailTriggersEnabled()) throw new AutomationError("Email triggers are not available yet.");

  const rules = [input.repeat, ...input.triggers.map((t) => (t.type === "timer" ? t.rule : null))].filter((r): r is NonNullable<typeof r> => !!r);
  for (const rule of rules) {
    if (minGapMinutes(rule) < limits.minIntervalMinutes)
      throw new AutomationError(`Each automation can run as often as every ${limits.minIntervalMinutes} minutes on your plan.`);
  }

  let projectId: string | null = null;
  if (input.projectId) {
    const project = await getProject(session.userId, input.projectId).catch(() => null);
    if (!project) throw new AutomationError("That project was not found.");
    projectId = project.id;
  }

  const oldTriggers = new Map((existing?.triggers ?? []).map((t) => [t.id, t]));
  const triggers: StoredTrigger[] = input.triggers.map((t) => {
    const id = t.id && oldTriggers.has(t.id) ? t.id : token(6);
    const old = oldTriggers.get(id);
    switch (t.type) {
      case "webhook": {
        const name = t.authHeaderName?.trim() || undefined;
        let valueEnc = old?.type === "webhook" ? old.authHeaderValueEnc : undefined;
        if (t.authHeaderValue !== undefined) valueEnc = t.authHeaderValue ? seal(t.authHeaderValue) : undefined;
        if (!name) valueEnc = undefined;
        if (name && !valueEnc) throw new AutomationError("Enter the auth header value, or clear the header name.");
        return { id, type: "webhook", ...(name ? { authHeaderName: name } : {}), ...(valueEnc ? { authHeaderValueEnc: valueEnc } : {}), conditions: t.conditions };
      }
      case "rss":
        return { id, type: "rss", url: t.url, conditions: t.conditions };
      case "email":
        return { id, type: "email", address: old?.type === "email" ? old.address : `auto-${token(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}@${agentmailDomain() ?? "agentmail.to"}`, senders: t.senders.map((s) => s.toLowerCase()), conditions: t.conditions };
      case "timer":
        return { id, type: "timer", rule: t.rule };
    }
  });

  const hookToken = triggers.some((t) => t.type === "webhook") ? (existing?.hookToken ?? token(18)) : null;
  const draft = {
    repeat: input.repeat ?? null,
    triggers,
    timezone: input.timezone,
    endsAt: input.endsAt ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const next = computeNext(draft, Date.now());
  return {
    name: input.name?.trim() || existing?.name || nameFrom(input.prompt),
    kind: input.kind,
    prompt: input.prompt,
    repeat: draft.repeat,
    timezone: draft.timezone,
    endsAt: draft.endsAt,
    triggers,
    mode: input.mode,
    runIn: input.runIn,
    projectId,
    connectors: input.connectors,
    hookToken,
    nextRunAt: next === null ? null : new Date(next).toISOString(),
    pollAt: hasPolling({ triggers }) ? (existing?.pollAt ?? new Date().toISOString()) : null,
    ...(input.sourceTaskId !== undefined ? { sourceTaskId: input.sourceTaskId } : {}),
  };
}

async function assertCapacity(session: Session, excludingId?: string): Promise<void> {
  const limits = limitsFor(session.plan);
  const all = await listAutomations(session.userId);
  const enabled = all.filter((a) => a.enabled && a.id !== excludingId).length;
  if (enabled >= limits.maxEnabled) throw new AutomationError(`This automation can't be enabled. Your ${session.plan || "current"} plan allows ${limits.maxEnabled} active automations: pause another one or upgrade your plan.`, 403);
}

export async function createAutomation(session: Session, input: AutomationInput): Promise<AutomationRecord> {
  if (input.enabled) await assertCapacity(session);
  const fields = await build(session, input);
  return insertAutomation(session.userId, { ...fields, enabled: input.enabled, failureCount: 0, pausedReason: null });
}

export async function editAutomation(session: Session, id: string, input: AutomationInput): Promise<AutomationRecord> {
  const existing = await getAutomation(session.userId, id);
  if (!existing) throw new AutomationError("Automation not found.", 404);
  if (input.enabled && !existing.enabled) await assertCapacity(session, id);
  const fields = await build(session, input, existing);
  const updated = await updateAutomation(session.userId, id, { ...fields, enabled: input.enabled, ...(input.enabled ? { pausedReason: null, failureCount: 0 } : {}) });
  if (!updated) throw new AutomationError("Automation not found.", 404);
  return updated;
}

export async function setEnabled(session: Session, id: string, enabled: boolean): Promise<AutomationRecord> {
  const a = await getAutomation(session.userId, id);
  if (!a) throw new AutomationError("Automation not found.", 404);
  if (enabled && !a.enabled) await assertCapacity(session, id);
  const next = enabled ? computeNext(a, Date.now()) : null;
  const updated = await updateAutomation(session.userId, id, {
    enabled,
    pausedReason: enabled ? null : "Paused by you.",
    ...(enabled ? { failureCount: 0, nextRunAt: next === null ? null : new Date(next).toISOString(), pollAt: hasPolling(a) ? new Date().toISOString() : null } : {}),
  });
  if (!updated) throw new AutomationError("Automation not found.", 404);
  return updated;
}

export async function removeAutomation(session: Session, id: string): Promise<boolean> {
  return deleteAutomation(session.userId, id);
}

/** Runs it now, whether paused or not. Not counted toward auto-pause, never retried. */
export async function testRun(session: Session, id: string): Promise<RunRecord> {
  const a = await getAutomation(session.userId, id);
  if (!a) throw new AutomationError("Automation not found.", 404);
  const sample = a.triggers.some((t) => t.type !== "timer") ? { test: true, note: "This is a test run; no real event happened." } : undefined;
  const run = await fireAutomation(a, { trigger: "test", event: sample });
  if (!run) throw new AutomationError("Could not start the test run.", 500);
  return run;
}
