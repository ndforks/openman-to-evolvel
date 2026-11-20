// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Live screen of a computer through noVNC, scaled to fit. View-only unless `interactive` is set (take over).
 * The RFB client is loaded on demand: it touches `window` at import time and is only needed while the panel is open.
 *
 * Reconnects by itself when a working stream drops (with back-off, and at once when the browser comes back online
 * or the tab becomes visible). The stream URL carries the computer's password: it is never logged.
 */
import { useEffect, useRef, useState } from "react";
import type RFB from "@novnc/novnc";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/task/parts";

export type VncState = "connecting" | "connected" | "reconnecting" | "failed";

/** What a parent can do with a connected viewer (the skill recorder uses it). */
export interface VncHandle {
  /** The element that holds noVNC's canvas; pointer and key events pass through it. */
  host: HTMLDivElement;
  /** The canvas noVNC draws the remote framebuffer on (its width and height are the remote screen's). */
  canvas(): HTMLCanvasElement | null;
  /** Puts text on the remote clipboard. */
  paste(text: string): void;
  /** Sends a key chord: keysyms pressed in order and released in reverse. */
  sendKeys(keysyms: number[]): void;
  focus(): void;
}

export interface VncViewerProps {
  /** WebSocket URL of the VNC stream. An http(s) URL is rewritten to ws(s). A `token` or `password` query value doubles as the VNC password. */
  url: string;
  /** Forward mouse and keyboard to the computer. */
  interactive: boolean;
  /** Called on every change of connection state; `reason` says why a connection failed. */
  onStateChange?: (state: VncState, reason: string | null) => void;
  /** Called with a handle once connected, and with null when the connection goes away. */
  onReady?: (handle: VncHandle | null) => void;
  /** Draw only the screen: no "Connecting..." or failure text. For thumbnails, which have their own placeholder. */
  quiet?: boolean;
  /** Show a small badge saying whether the screen is view-only or under the user's control. */
  showMode?: boolean;
  className?: string;
}

/** A stream that was up and dropped gets a patient reconnect; one that never answered is given up on sooner. */
const MAX_RETRIES = 12;
const MAX_FIRST_RETRIES = 2;
const backoff = (n: number) => Math.min(10_000, 1500 * 2 ** Math.max(0, n - 1));

function parseTarget(raw: string): { wsUrl: string; password?: string } {
  let wsUrl = raw.trim().replace(/^http(s?):\/\//i, "ws$1://");
  if (wsUrl.startsWith("/")) wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${wsUrl}`;
  try {
    const parsed = new URL(wsUrl);
    const password = parsed.searchParams.get("password") ?? parsed.searchParams.get("token") ?? (parsed.password ? decodeURIComponent(parsed.password) : undefined);
    return { wsUrl, password: password || undefined };
  } catch {
    return { wsUrl };
  }
}

export function VncViewer({ url, interactive, onStateChange, onReady, quiet = false, showMode = false, className }: VncViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const interactiveRef = useRef(interactive);
  const notify = useRef(onStateChange);
  const ready = useRef(onReady);
  const [state, setState] = useState<VncState>("connecting");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    notify.current = onStateChange;
    ready.current = onReady;
  }, [onStateChange, onReady]);

  useEffect(() => {
    interactiveRef.current = interactive;
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.viewOnly = !interactive;
    if (interactive) rfb.focus();
    else rfb.blur();
  }, [interactive]);

  useEffect(() => {
    let disposed = false;
    let retries = 0;
    let everConnected = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let current: RFB | null = null;
    let waiting = false;

    const update = (next: VncState, why: string | null = null) => {
      if (disposed) return;
      setState(next);
      setReason(why);
      notify.current?.(next, why);
    };

    const connect = async () => {
      waiting = false;
      let RFBClient: typeof RFB;
      try {
        RFBClient = (await import("@novnc/novnc")).default;
      } catch {
        update("failed", "The viewer could not be loaded.");
        return;
      }
      const host = hostRef.current;
      if (disposed || !host) return;
      host.replaceChildren();
      const { wsUrl, password } = parseTarget(url);

      let rfb: RFB;
      try {
        rfb = new RFBClient(host, wsUrl, { shared: true, credentials: password ? { password } : undefined });
      } catch {
        update("failed", "The stream address is not valid.");
        return;
      }
      current = rfb;
      rfbRef.current = rfb;
      rfb.viewOnly = !interactiveRef.current;
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.focusOnClick = true;
      rfb.background = "transparent";

      rfb.addEventListener("connect", () => {
        retries = 0;
        everConnected = true;
        update("connected");
        if (interactiveRef.current) rfb.focus();
        ready.current?.({
          host,
          canvas: () => host.querySelector("canvas"),
          paste: (text) => rfb.clipboardPasteFrom(text),
          sendKeys: (keysyms) => {
            for (const k of keysyms) rfb.sendKey(k, null, true);
            for (const k of [...keysyms].reverse()) rfb.sendKey(k, null, false);
          },
          focus: () => rfb.focus(),
        });
      });
      rfb.addEventListener("credentialsrequired", () => {
        if (password) rfb.sendCredentials({ password });
        else {
          update("failed", "This computer asks for a password.");
          rfb.disconnect();
        }
      });
      rfb.addEventListener("securityfailure", (event) => {
        retries = MAX_RETRIES;
        update("failed", event.detail.reason || "The computer refused the connection.");
      });
      rfb.addEventListener("disconnect", (event) => {
        if (disposed || current !== rfb) return;
        rfbRef.current = null;
        current = null;
        ready.current?.(null);
        if (retries >= (everConnected ? MAX_RETRIES : MAX_FIRST_RETRIES)) {
          // `clean` is false when the socket never opened or dropped: the stream address is unreachable or was refused.
          update("failed", event.detail.clean ? "The computer closed the live view." : "The screen stream could not be reached.");
          return;
        }
        retries += 1;
        update("reconnecting");
        waiting = true;
        retryTimer = setTimeout(() => void connect(), backoff(retries));
      });
    };

    // Back online, or back to this tab: don't wait out the back-off.
    const hurry = () => {
      if (!waiting || disposed || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      if (retryTimer) clearTimeout(retryTimer);
      void connect();
    };
    window.addEventListener("online", hurry);
    document.addEventListener("visibilitychange", hurry);

    void connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", hurry);
      document.removeEventListener("visibilitychange", hurry);
      if (retryTimer) clearTimeout(retryTimer);
      const rfb = current;
      current = null;
      rfbRef.current = null;
      ready.current?.(null);
      try {
        rfb?.disconnect();
      } catch {
        // Already closed.
      }
    };
  }, [url]);

  return (
    <div className={cn("relative size-full min-h-0 overflow-hidden", className)} data-vnc-state={state} data-vnc-mode={interactive ? "control" : "view"}>
      <div ref={hostRef} className={cn("tv-vnc absolute inset-0", !interactive && "pointer-events-none")} />
      {showMode && state === "connected" ? (
        <span
          className={cn(
            "pointer-events-none absolute left-2 top-2 z-[1] flex h-6 items-center gap-[6px] rounded-full px-[9px] text-[11px] font-medium leading-4 shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
            interactive ? "bg-[var(--om-icon-accent)] text-white" : "bg-[var(--om-surface)] text-[var(--om-text-2)]",
          )}
        >
          <span className={cn("size-[6px] rounded-full", interactive ? "bg-white" : "bg-[var(--om-icon-3)]")} aria-hidden="true" />
          {interactive ? "Your controls" : "Watching"}
        </span>
      ) : null}
      {state !== "connected" && !quiet ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--om-bg)] px-6 text-center" role="status">
          {state === "failed" ? null : <Spinner size={18} />}
          <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{state === "failed" ? (reason ?? "The screen stream is down.") : state === "reconnecting" ? "Reconnecting to the desktop..." : "Connecting to the desktop..."}</span>
        </div>
      ) : null}
    </div>
  );
}
