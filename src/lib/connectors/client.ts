// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Browser side of connectors: one shared store over `GET /api/connectors`, plus connect (popup + poll),
 * disconnect and custom connectors. Every surface (Plugins page, Settings, composer menu, task connect card) reads it.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { ConnectStart, ConnectorView, ConnectorsResponse } from "./catalog";

interface State {
  data: ConnectorsResponse | null;
  loading: boolean;
  error: string | null;
  /** Slug currently being connected (popup open). */
  pending: string | null;
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;
let loadedAt = 0;

export const useConnectorStore = create<State>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  pending: null,
  load: async (force = false) => {
    if (!force && get().data && Date.now() - loadedAt < 30_000) return;
    if (inflight) return inflight;
    set({ loading: true });
    inflight = (async () => {
      try {
        const res = await fetch("/api/connectors", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ConnectorsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error || "Couldn't load connectors.");
        loadedAt = Date.now();
        set({ data: body, error: body.error ?? null });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Couldn't load connectors." });
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();
    return inflight;
  },
}));

/** The connector list, loaded on first use. */
export function useConnectors() {
  const state = useConnectorStore();
  useEffect(() => {
    void useConnectorStore.getState().load();
  }, []);
  return state;
}

function setConnected(slug: string, connected: boolean) {
  const data = useConnectorStore.getState().data;
  if (!data) return;
  useConnectorStore.setState({ data: { ...data, connectors: data.connectors.map((c) => (c.slug === slug ? { ...c, connected } : c)) } });
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

export type ConnectOutcome = { ok: true } | { ok: false; error: string; cancelled?: boolean } | { ok: false; needs: NonNullable<ConnectStart["asks"]>; error: string };

/**
 * Connects an app: opens a popup at once (so the browser allows it), asks the server for the sign-in URL, points the
 * popup at it, then polls until the app reads as connected (or the popup closes / 5 minutes pass). On success it asks
 * Orgo to give the new tools to the agent. `fields` connects a key app without a popup.
 */
export async function connectApp(slug: string, fields?: Record<string, string>): Promise<ConnectOutcome> {
  const popup = fields ? null : window.open("about:blank", `connect-${slug}`, "width=560,height=720,menubar=no,toolbar=no");
  useConnectorStore.setState({ pending: slug });
  try {
    const res = await fetch(`/api/connectors/${encodeURIComponent(slug)}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields ? { fields } : {}) });
    const body = await readJson<ConnectStart>(res);
    if (!res.ok) {
      popup?.close();
      return { ok: false, error: body.error || "Couldn't start the sign-in." };
    }
    if (body.needs) {
      popup?.close();
      return { ok: false, needs: body.asks ?? [], error: "This app signs in with a key." };
    }
    if (!body.url) {
      popup?.close();
      setConnected(slug, true);
      void fetch("/api/connectors/refresh", { method: "POST" }).catch(() => undefined);
      return { ok: true };
    }
    if (popup && !popup.closed) popup.location.href = body.url;
    else window.open(body.url, "_blank", "noopener");

    const started = Date.now();
    let closedAt = 0;
    while (Date.now() - started < 5 * 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(`/api/connectors/${encodeURIComponent(slug)}`, { cache: "no-store" })
        .then((r) => readJson<{ connected?: boolean }>(r))
        .catch(() => ({ connected: false }) as { connected?: boolean });
      if (s.connected) {
        try {
          popup?.close();
        } catch {
          // cross-origin close may be refused
        }
        setConnected(slug, true);
        void fetch("/api/connectors/refresh", { method: "POST" }).catch(() => undefined);
        return { ok: true };
      }
      // After the popup closes, keep checking a few more times (the callback can land late).
      if (popup?.closed) {
        closedAt ||= Date.now();
        if (Date.now() - closedAt > 8000) return { ok: false, error: "Sign-in was closed before it finished.", cancelled: true };
      }
    }
    return { ok: false, error: "Sign-in timed out." };
  } finally {
    useConnectorStore.setState({ pending: null });
  }
}

export async function disconnectApp(slug: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/connectors/${encodeURIComponent(slug)}`, { method: "DELETE" });
  const body = await readJson<{ ok?: boolean }>(res);
  if (!res.ok) return { ok: false, error: body.error || "Couldn't disconnect it." };
  setConnected(slug, false);
  return { ok: true };
}

export interface NewCustom {
  kind: "mcp" | "api";
  name: string;
  transport?: "http" | "command";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  key?: string;
  authHeader?: string;
}

export async function addCustomConnector(input: NewCustom): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const res = await fetch("/api/connectors/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await readJson<{ detail?: string }>(res);
  await useConnectorStore.getState().load(true);
  if (!res.ok) return { ok: false, error: body.error || "Couldn't add it.", detail: body.detail };
  return { ok: true, detail: body.detail };
}

export async function removeCustomConnector(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/connectors/custom/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = await readJson<{ ok?: boolean }>(res);
  await useConnectorStore.getState().load(true);
  return res.ok ? { ok: true } : { ok: false, error: body.error || "Couldn't remove it." };
}

export async function testMcpServer(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; tools?: { name: string; description?: string }[]; error?: string }> {
  const res = await fetch("/api/connectors/custom/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, headers }) });
  const body = await readJson<{ ok?: boolean; tools?: { name: string; description?: string }[] }>(res);
  return res.ok ? { ok: true, tools: body.tools ?? [] } : { ok: false, error: body.error || "The connection test failed." };
}

export const connectedOnly = (list: ConnectorView[] | undefined) => (list ?? []).filter((c) => c.connected);
