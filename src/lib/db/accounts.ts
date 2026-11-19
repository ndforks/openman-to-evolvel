// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Accounts: one row per Orgo user, keyed by the Orgo user id. Keys are stored sealed (see `@/lib/crypto`). */
import { db, fail, iso } from "./client";

export interface Account { userId: string; email: string; name: string; orgoKeyEnc: string | null; workspaceId: string | null; homeComputerId: string | null; hermesBaseUrl: string | null; hermesKeyEnc: string | null;
  /** Provisioning recipe version last completed on the home computer (0 = never). */
  setupVersion: number;
  /** Per-step versions completed (resume point for an interrupted or upgraded setup). */
  setupSteps: Record<string, number>;
  setupAt: string | null;
  createdAt: string; updatedAt: string }

interface AccountRow {
  user_id: string;
  email: string;
  name: string;
  orgo_key_enc: string | null;
  workspace_id: string | null;
  home_computer_id: string | null;
  hermes_base_url: string | null;
  hermes_key_enc: string | null;
  setup_version?: number | null;
  setup_steps?: Record<string, number> | null;
  setup_at?: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(r: AccountRow): Account {
  return {
    userId: r.user_id,
    email: r.email,
    name: r.name,
    orgoKeyEnc: r.orgo_key_enc,
    workspaceId: r.workspace_id,
    homeComputerId: r.home_computer_id,
    hermesBaseUrl: r.hermes_base_url,
    hermesKeyEnc: r.hermes_key_enc,
    setupVersion: r.setup_version ?? 0,
    setupSteps: r.setup_steps && typeof r.setup_steps === "object" ? r.setup_steps : {},
    setupAt: r.setup_at ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const COLUMNS: Record<Exclude<keyof Account, "userId" | "createdAt" | "updatedAt">, keyof AccountRow> = {
  email: "email",
  name: "name",
  orgoKeyEnc: "orgo_key_enc",
  workspaceId: "workspace_id",
  homeComputerId: "home_computer_id",
  hermesBaseUrl: "hermes_base_url",
  hermesKeyEnc: "hermes_key_enc",
  setupVersion: "setup_version",
  setupSteps: "setup_steps",
  setupAt: "setup_at",
};

export async function getAccount(userId: string): Promise<Account | null> {
  const { data, error } = await db().from("accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) fail("get account", error);
  return data ? fromRow(data as AccountRow) : null;
}

/** Creates the account or updates only the fields given. */
export async function upsertAccount(patch: Partial<Account> & { userId: string }): Promise<Account> {
  const row: Partial<AccountRow> = { user_id: patch.userId };
  for (const [field, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, keyof AccountRow][]) {
    if (patch[field] !== undefined) (row as Record<string, unknown>)[column] = patch[field];
  }
  const { data, error } = await db().from("accounts").upsert(row, { onConflict: "user_id" }).select("*").single();
  if (error) fail("save account", error);
  return fromRow(data as AccountRow);
}

/** Removes the account row (sign-out-everywhere or account deletion). */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await db().from("accounts").delete().eq("user_id", userId);
  if (error) fail("delete account", error);
}
