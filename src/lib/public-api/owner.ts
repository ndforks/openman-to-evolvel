// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Background access to a user's tasks (no request from them): their store with the agent connection primed. */
import { primeConnection } from "@/lib/agent/server/connection";
import { refreshOwner } from "@/lib/agent/server/relay";
import { DEV_USER_ID, type Session } from "@/lib/session";
import { getAccount } from "@/lib/db/accounts";
import { DbStore } from "@/lib/store/db-store";

export async function ownerSession(userId: string): Promise<Session> {
  if (userId === DEV_USER_ID) return { userId, email: "dev@localhost", name: "Developer", plan: "Free", workspaceId: process.env.ORGO_WORKSPACE_ID?.trim() || null, dev: true };
  const account = await getAccount(userId).catch(() => null);
  return { userId, email: account?.email ?? "", name: account?.name ?? "", plan: "", workspaceId: account?.workspaceId ?? null };
}

export async function ownerStore(userId: string): Promise<DbStore> {
  const store = new DbStore(userId);
  await primeConnection(await ownerSession(userId));
  refreshOwner(store);
  return store;
}
