// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Shapes for the non-task resources of `/api/v1`. */
import type { Project } from "@/lib/db/projects";
import type { Endpoint, Delivery } from "@/lib/db/public-api";
import { snake } from "./casing";

export function projectView(p: Project) {
  return {
    id: p.id,
    object: "project" as const,
    name: p.name,
    instructions: p.instructions,
    connectors: p.connectors,
    skills: p.skills,
    pinned: p.pinned,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function endpointView(e: Endpoint) {
  return { id: e.id, object: "webhook_endpoint" as const, url: e.url, events: e.events, enabled: e.enabled, created_at: e.createdAt, updated_at: e.updatedAt };
}

export function deliveryView(d: Delivery) {
  return {
    id: d.id,
    object: "webhook_delivery" as const,
    webhook_id: d.webhookId,
    event_id: d.eventId,
    event_type: d.eventType,
    status: d.status,
    attempts: d.attempts,
    next_attempt_at: d.status === "pending" ? d.nextAttemptAt : null,
    last_status_code: d.lastStatus,
    last_error: d.lastError,
    delivered_at: d.deliveredAt,
    created_at: d.createdAt,
    payload: d.payload,
  };
}

/** snake_case keys into camelCase, deeply, for bodies handed to internal camelCase schemas. */
export function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), camel(v)]));
  }
  return value;
}

export { snake };
