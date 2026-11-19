// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
const snakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** camelCase keys to snake_case, deeply (values untouched). */
export function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [snakeKey(k), snake(v)]));
  }
  return value;
}
