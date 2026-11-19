// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// A second signed-in person for QA (a collaborator or project member): a throwaway user id and email, its sealed
// session cookie (same format the app writes, see scripts/qa-session.mjs), and a cleanup that removes every row the
// throwaway user left in the database. Prints nothing secret.
//
//   import { mintSecondSession } from "./second-session.mjs";
//   const s = await mintSecondSession({ email: "qa-x@example.com" });   // { userId, email, name, cookie, cookieValue, cleanup }
//   ... fetch(url, { headers: { cookie: s.cookie } }) or setCookieIn(p, s) for a browser ...
//   await s.cleanup();
//
// A real-user cookie always wins over the dev identity (`getSession` only falls back to the dev user when no valid
// cookie is present), so this works while the dev server runs with OPENMAN_DEV_BYPASS=1. The throwaway user
// has no Orgo account or computer: fine for a collaborator, whose runs use the owner's computer.
import path from "node:path";
import { loadEnv } from "./env.mjs";
import { sessionCookie } from "./qa-session.mjs";

loadEnv();

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** PostgREST call as the server (publishable key + x-om-secret). */
async function rest(method, pathAndQuery, body) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.APP_DB_SECRET;
  if (!url || !key || !secret) throw new Error("Supabase env is not set in .env.local.");
  const r = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "x-om-secret": secret, "content-type": "application/json", Prefer: "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.status;
}

/** Every table that carries a `user_id`, read from the app's own deletion list (so new tables are covered too). */
async function userTables() {
  try {
    const { createJiti } = await import("jiti");
    const root = path.resolve(import.meta.dirname, "..");
    const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
    const ad = await jiti.import(path.join(root, "src/lib/personalization/account-data.ts"));
    return [...ad.USER_TABLES, ...ad.KEPT_TABLES];
  } catch {
    return ["settings", "notifications", "usage_counters", "revocations", "tasks", "projects", "knowledge"];
  }
}

/**
 * Mints a throwaway signed-in user. `email` defaults to a unique `qa-second-...@example.com`.
 * `cleanup()` deletes rows with that user id (every user table, plus invitations claimed or addressed to it).
 */
export async function mintSecondSession({ email, name = "QA Second User", userId } = {}) {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const id = userId ?? `qa-second-${tag}`;
  const mail = (email ?? `qa-second-${tag}@example.com`).toLowerCase();
  const cookie = sessionCookie({ userId: id, email: mail, name });
  const cookieValue = cookie.slice("om_session=".length);
  async function cleanup() {
    const q = encodeURIComponent(id);
    const tables = await userTables();
    for (const t of tables) await rest("DELETE", `${t}?user_id=eq.${q}`).catch(() => 0);
    // Invitations addressed to or claimed by the throwaway user (task and, when it exists, project sharing).
    for (const t of ["task_members", "project_members"]) {
      await rest("DELETE", `${t}?email=eq.${encodeURIComponent(mail)}`).catch(() => 0);
      await rest("DELETE", `${t}?user_id=eq.${q}`).catch(() => 0);
      await rest("DELETE", `${t}?member_id=eq.${q}`).catch(() => 0);
    }
  }
  return { userId: id, email: mail, name, cookie, cookieValue, cleanup, base: BASE };
}

/** Puts the session cookie into a CDP page (scripts/cdp.mjs `launch()`), for the dev server's host. */
export async function setCookieIn(p, session, base = BASE) {
  const u = new URL(base);
  await p.send("Network.enable").catch(() => {});
  await p.send("Network.setCookie", { name: "om_session", value: session.cookieValue, domain: u.hostname, path: "/", httpOnly: true, sameSite: "Lax" });
}
