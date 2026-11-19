// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Browser-side types and fetch helpers for the Mail, Email and Phone settings tabs (`/api/mail`, `/api/phone`). */
import { useCallback, useEffect, useState } from "react";

export interface Mailbox {
  id: string;
  kind: "personal" | "workflow";
  address: string;
  name: string;
  defaultPrompt: string;
  enabled: boolean;
  addressChangedAt: string | null;
}

export interface MailOverview {
  configured: boolean;
  notice?: string;
  personal: Mailbox | null;
  workflows: Mailbox[];
  senders: string[];
  limits: { senders: number; workflows: number; opsPerDay: number; opsToday: number };
  nextAddressChangeAt: string | null;
  /** Domain for new addresses; null = the provider's default (then read from an existing address). */
  domain?: string | null;
}

/** The part after "@" of an address, or null. */
export function domainOf(address: string | null | undefined): string | null {
  const at = address?.lastIndexOf("@") ?? -1;
  return address && at > 0 ? address.slice(at + 1).toLowerCase() : null;
}

/** The domain a new address will get: the server's configured one, else the domain of an address the user already has. */
export function newAddressDomain(data: MailOverview | null | undefined): string | null {
  if (!data) return null;
  return data.domain ?? domainOf(data.personal?.address) ?? data.workflows.map((w) => domainOf(w.address)).find(Boolean) ?? null;
}

export interface MailRecord {
  id: string;
  direction: "inbound" | "outbound";
  status: "task" | "continued" | "blocked" | "sent" | "failed" | "ignored";
  sender: string;
  subject: string;
  preview: string;
  reason: string | null;
  taskId: string | null;
  createdAt: string;
}

export interface PhoneLine {
  id: string;
  number: string;
  status: "active" | "released";
  outboundSms: string | null;
  approvedSenders: string[];
  createdAt: string;
}

/** AgentPhone's rates in USD (`pricing` on `GET /api/phone` and `/api/phone/available`). */
export interface PhonePricing {
  numberEvery30Days: number;
  smsPerSegment: number;
  voicePerMinute: number;
  smsRegistrationOneTime: number;
}

export interface PhoneOverview {
  configured: boolean;
  notice?: string;
  pricing?: PhonePricing;
  numbers: PhoneLine[];
}

export interface PhoneAvailable {
  numbers: { phoneNumber: string; areaCode: string | null; city: string | null; state: string | null }[];
  widened: boolean;
  pricing: PhonePricing;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
/** "$3.00 every 30 days, plus $0.02 per text segment and $0.13 per call minute." */
export function phonePriceLine(p: PhonePricing): string {
  return `${usd(p.numberEvery30Days)} every 30 days, plus ${usd(p.smsPerSegment)} per text segment and ${usd(p.voicePerMinute)} per call minute.`;
}

export interface SmsRecord {
  id: string;
  direction: "inbound" | "outbound";
  counterpart: string;
  body: string;
  status: "received" | "blocked" | "awaiting_approval" | "approved" | "denied" | "sent" | "failed";
  taskId: string | null;
  error: string | null;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  counterpart: string;
  direction: string;
  status: string;
  taskId: string | null;
  summary: string | null;
  durationSeconds: number | null;
  startedAt: string;
}

/** JSON request; throws an Error with the server's message on failure. */
export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json as T;
}

/** Loads `path` on mount; `reload()` fetches again. */
export function useResource<T>(path: string): { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setData(await call<T>("GET", path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    // Fetch once on mount; state is set when the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
