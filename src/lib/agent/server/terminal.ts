/**
 * A web terminal for a cloud computer, proxied by this server so the browser never holds a credential.
 *
 * Orgo's terminal socket (`wss://www.orgo.ai/desktops/{id}/ws/terminal`) only accepts the computer's Desktop
 * API token, which is root on that computer and never expires. So:
 *  1. `POST /api/computers/{id}/terminal` checks the user and mints a ticket: random, single use, bound to
 *     that user and computer, valid 30 seconds.
 *  2. `GET .../terminal/stream?ticket=` redeems it: the server fetches the token with the user's Orgo key,
 *     opens Orgo's socket itself and streams the output to the browser as server-sent events. The first event
 *     names a session id, bound to the same user, that lives exactly as long as that stream.
 *  3. `POST .../terminal/input` sends keystrokes and resizes for that session id.
 * Orgo's protocol: client `{type:'input',data}`, `{type:'resize',cols,rows}`, `{type:'ping'}`; server
 * `{type:'output'|'error'|'exit'|'pong', data?}`. `session` names a tmux session, so a reload reattaches.
 */
import { randomBytes } from "node:crypto";

const TICKET_TTL_MS = 30_000;
const MAX_SESSIONS_PER_USER = 6;

interface Ticket {
  userId: string;
  computerId: string;
  /** tmux session name on the computer; stable per user and computer so reloads reattach. */
  session: string;
  expires: number;
}

interface Session {
  userId: string;
  computerId: string;
  socket: WebSocket;
  lastInput: number;
}

const g = globalThis as typeof globalThis & { __omTerm?: { tickets: Map<string, Ticket>; sessions: Map<string, Session> } };
const state = (g.__omTerm ??= { tickets: new Map(), sessions: new Map() });

const token = () => randomBytes(24).toString("base64url");

function sweep(): void {
  const now = Date.now();
  for (const [key, ticket] of state.tickets) if (ticket.expires < now) state.tickets.delete(key);
}

export function mintTicket(userId: string, computerId: string): { ticket: string; expiresIn: number } {
  sweep();
  const ticket = token();
  const session = `om-${userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "user"}`;
  state.tickets.set(ticket, { userId, computerId, session, expires: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresIn: TICKET_TTL_MS / 1000 };
}

/** Takes a ticket out (single use). Null when unknown, expired, or someone else's. */
export function redeemTicket(ticket: string, userId: string, computerId: string): Ticket | null {
  sweep();
  const found = state.tickets.get(ticket);
  if (!found) return null;
  state.tickets.delete(ticket);
  if (found.userId !== userId || found.computerId.toLowerCase() !== computerId.toLowerCase() || found.expires < Date.now()) return null;
  return found;
}

/**
 * Opens Orgo's terminal socket for a redeemed ticket and returns an SSE stream of its output. `socketUrl`
 * is built by the caller with the computer's token and is never sent to the browser.
 */
export function openTerminalStream(ticket: Ticket, socketUrl: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const sid = token();
  let socket: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    state.sessions.delete(sid);
    try {
      socket?.close();
    } catch {
      // already closed
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const end = (reason?: string) => {
        if (closed) return;
        send("closed", { reason: reason ?? "The terminal disconnected." });
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // One user can't pile up sockets: the oldest goes.
      const mine = [...state.sessions.entries()].filter(([, s]) => s.userId === ticket.userId);
      for (const [oldSid, old] of mine.slice(0, Math.max(0, mine.length - MAX_SESSIONS_PER_USER + 1))) {
        try {
          old.socket.close();
        } catch {
          // ignore
        }
        state.sessions.delete(oldSid);
      }

      try {
        socket = new WebSocket(socketUrl);
      } catch {
        end("The terminal could not be opened.");
        return;
      }
      state.sessions.set(sid, { userId: ticket.userId, computerId: ticket.computerId, socket, lastInput: Date.now() });
      socket.onopen = () => {
        send("ready", { sid });
        ping = setInterval(() => {
          try {
            socket?.send(JSON.stringify({ type: "ping" }));
          } catch {
            // ignore
          }
          send("ping", {});
        }, 20_000);
      };
      socket.onmessage = (message) => {
        type Frame = { type?: string; data?: unknown; message?: unknown };
        let parsed: Frame;
        try {
          parsed = JSON.parse(typeof message.data === "string" ? message.data : "") as Frame;
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        if (parsed.type === "output" && typeof parsed.data === "string") send("output", parsed.data);
        else if (parsed.type === "error") send("output", `\r\n${String(parsed.message ?? parsed.data ?? "Terminal error")}\r\n`);
        else if (parsed.type === "exit") end("The shell exited.");
      };
      socket.onerror = () => end("The terminal connection failed.");
      socket.onclose = () => end();
      signal.addEventListener("abort", () => end(), { once: true });
    },
    cancel() {
      cleanup();
    },
  });
}

/** Sends keystrokes or a resize to a live session of this user. False when the session is gone. */
export function terminalInput(userId: string, computerId: string, sid: string, input: { data?: string; cols?: number; rows?: number }): boolean {
  const session = state.sessions.get(sid);
  if (!session || session.userId !== userId || session.computerId.toLowerCase() !== computerId.toLowerCase()) return false;
  if (session.socket.readyState !== WebSocket.OPEN) return false;
  if (typeof input.data === "string" && input.data.length > 0) session.socket.send(JSON.stringify({ type: "input", data: input.data.slice(0, 16_384) }));
  if (input.cols && input.rows) session.socket.send(JSON.stringify({ type: "resize", cols: Math.round(input.cols), rows: Math.round(input.rows) }));
  session.lastInput = Date.now();
  return true;
}

/** `wss://<orgo host>/desktops/{id}/ws/terminal?...`: server side only. */
export function terminalSocketUrl(apiBase: string, computerId: string, desktopToken: string, session: string, cols: number, rows: number): string {
  const host = new URL(apiBase).host;
  const q = new URLSearchParams({ cols: String(cols), rows: String(rows), session, token: desktopToken });
  return `wss://${host}/desktops/${encodeURIComponent(computerId)}/ws/terminal?${q.toString()}`;
}
