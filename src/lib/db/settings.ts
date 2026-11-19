// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Per-user settings: one JSON document. A patch is merged deeply; `null` removes a key. */
import { db, fail } from "./client";

export type SettingsDoc = Record<string, unknown>;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeSettings(base: SettingsDoc, patch: SettingsDoc): SettingsDoc {
  const out: SettingsDoc = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (v === null) delete out[k];
    else if (isPlain(v) && isPlain(out[k])) out[k] = mergeSettings(out[k] as SettingsDoc, v);
    else out[k] = v;
  }
  return out;
}

export async function getSettings(userId: string): Promise<SettingsDoc> {
  const { data, error } = await db().from("settings").select("data").eq("user_id", userId).maybeSingle();
  if (error) fail("get settings", error);
  return ((data as { data?: SettingsDoc } | null)?.data ?? {}) as SettingsDoc;
}

export async function patchSettings(userId: string, patch: SettingsDoc): Promise<SettingsDoc> {
  const next = mergeSettings(await getSettings(userId), patch);
  const { error } = await db().from("settings").upsert({ user_id: userId, data: next }, { onConflict: "user_id" });
  if (error) fail("save settings", error);
  return next;
}

export async function replaceSettings(userId: string, doc: SettingsDoc): Promise<SettingsDoc> {
  const { error } = await db().from("settings").upsert({ user_id: userId, data: doc }, { onConflict: "user_id" });
  if (error) fail("save settings", error);
  return doc;
}
