"use client";

/** Browser side of "Reach <brand> from anywhere": one shared status store over `GET /api/channels`, plus the link calls. */
import { useEffect } from "react";
import { create } from "zustand";
import type { ChannelId, ChannelsStatus, TelegramPairingAnswer } from "./types";

interface State {
  data: ChannelsStatus | null;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;
let loadedAt = 0;

export const useChannelStore = create<State>((set, get) => ({
  data: null,
  loading: false,
  load: async (force = false) => {
    if (!force && get().data && Date.now() - loadedAt < 20_000) return;
    if (inflight) return inflight;
    set({ loading: true });
    inflight = (async () => {
      try {
        const res = await fetch("/api/channels", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as ChannelsStatus | null;
        if (res.ok && body) {
          loadedAt = Date.now();
          set({ data: body });
        }
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();
    return inflight;
  },
}));

export function useChannels(): { data: ChannelsStatus | null; loading: boolean; reload: () => Promise<void> } {
  const { data, loading, load } = useChannelStore();
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, reload: () => load(true) };
}

export type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string; status: number };

async function call<T>(method: string, url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: json.error || "Something went wrong.", status: res.status };
    return { ok: true, ...json };
  } catch {
    return { ok: false, error: "Couldn't reach the server.", status: 0 };
  }
}

export const startTelegram = (replace = false) => call<TelegramPairingAnswer>("POST", `/api/channels/telegram${replace ? "?replace=1" : ""}`);
export const pollTelegram = (handle: string) => call<TelegramPairingAnswer>("GET", `/api/channels/telegram?handle=${encodeURIComponent(handle)}`);
export const slackManifest = () => call<{ manifest: Record<string, unknown>; createUrl: string }>("GET", "/api/channels/slack/manifest");
export const linkSlack = (botToken: string, appToken: string, force = false) => call<{ name: string; state: string; error: string | null }>("POST", `/api/channels/slack${force ? "?force=1" : ""}`, { botToken, appToken });
export const approveSlack = (requestId: string, deny = false) => call<{ name: string }>("POST", "/api/channels/slack/approve", { requestId, deny });
export const unlinkChannel = (channel: ChannelId, force = false) => call("DELETE", `/api/channels/${channel}${force ? "?force=1" : ""}`);
