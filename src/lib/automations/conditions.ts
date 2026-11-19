/** "Only if" conditions on a trigger's event, read by dot path (`repository.name`, `items.0.title`). */
import type { Condition } from "./types";

export function readPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const key of path.split(".").filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const asText = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function conditionHolds(c: Condition, data: unknown): boolean {
  const raw = readPath(data, c.field);
  const text = asText(raw).toLowerCase();
  const want = c.value.toLowerCase();
  switch (c.op) {
    case "exists":
      return raw !== undefined && raw !== null && text !== "";
    case "equals":
      return text === want;
    case "not_equals":
      return text !== want;
    case "contains":
      return text.includes(want);
    case "not_contains":
      return !text.includes(want);
    case "starts_with":
      return text.startsWith(want);
    case "greater_than":
      return Number(raw) > Number(c.value);
    case "less_than":
      return Number(raw) < Number(c.value);
  }
}

/** All conditions must hold (an empty list always passes). */
export function allConditionsHold(conditions: Condition[] | undefined, data: unknown): boolean {
  return (conditions ?? []).every((c) => conditionHolds(c, data));
}
