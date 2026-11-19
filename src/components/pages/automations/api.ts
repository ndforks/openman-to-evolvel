"use client";

/** Browser helpers for /api/automations. */
import type { AutomationInput, AutomationView, AutomationsMeta, RunView } from "@/lib/automations/types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

export const automationsApi = {
  list: () => call<{ automations: AutomationView[]; meta: AutomationsMeta }>("/api/automations"),
  get: (id: string) => call<{ automation: AutomationView }>(`/api/automations/${id}`),
  create: (input: Partial<AutomationInput>) => call<{ automation: AutomationView }>("/api/automations", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<AutomationInput>) => call<{ automation: AutomationView }>(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => call<{ ok: true }>(`/api/automations/${id}`, { method: "DELETE" }),
  pause: (id: string) => call<{ automation: AutomationView }>(`/api/automations/${id}/pause`, { method: "POST" }),
  resume: (id: string) => call<{ automation: AutomationView }>(`/api/automations/${id}/resume`, { method: "POST" }),
  test: (id: string) => call<{ run: RunView }>(`/api/automations/${id}/test`, { method: "POST" }),
  runs: (opts: { from?: string; to?: string; limit?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return call<{ runs: RunView[] }>(`/api/automations/runs?${q}`);
  },
  calendar: (month: string, tz: string) =>
    call<{ month: string; timezone: string; days: { date: string; runs: RunView[]; upcoming: { automationId: string; name: string; at: string }[] }[] }>(`/api/automations/calendar?month=${month}&tz=${encodeURIComponent(tz)}`),
  draft: (text: string, timezone: string) =>
    call<{ draft: { name: string; prompt: string; repeat: AutomationInput["repeat"]; triggers: AutomationInput["triggers"]; understood: string[] } }>("/api/automations/draft", { method: "POST", body: JSON.stringify({ text, timezone }) }),
};

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
