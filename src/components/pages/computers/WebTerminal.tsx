"use client";

/**
 * A terminal on a cloud computer, in the page. The server proxies Orgo's terminal socket (see
 * `lib/agent/server/terminal.ts`): this component gets a 30-second single-use ticket, reads output as
 * server-sent events and posts keystrokes. It never holds the computer's credential.
 *
 * The screen is a small line-based emulator (cursor movement, erase, carriage return, backspace; colours are
 * dropped): enough for a shell and command output, not for full-screen programs such as vim or top.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx";

const MAX_LINES = 2000;

class Screen {
  lines: string[] = [""];
  row = 0;
  col = 0;
  rows = 32;
  private pending = "";

  private top(): number {
    return Math.max(0, this.lines.length - this.rows);
  }

  private ensure(row: number) {
    while (this.lines.length <= row) this.lines.push("");
  }

  private put(ch: string) {
    this.ensure(this.row);
    const line = this.lines[this.row];
    const padded = line.length < this.col ? line + " ".repeat(this.col - line.length) : line;
    this.lines[this.row] = padded.slice(0, this.col) + ch + padded.slice(this.col + 1);
    this.col += 1;
  }

  private csi(params: string, final: string) {
    const nums = params.replace(/^\?/, "").split(";").map((p) => (p === "" ? NaN : Number(p)));
    const a = Number.isFinite(nums[0]) ? nums[0] : undefined;
    this.ensure(this.row);
    switch (final) {
      case "H":
      case "f": {
        const r = (a ?? 1) - 1;
        const c = (Number.isFinite(nums[1]) ? nums[1] : 1) - 1;
        this.row = this.top() + Math.max(0, r);
        this.col = Math.max(0, c);
        this.ensure(this.row);
        break;
      }
      case "J":
        if (a === 2 || a === 3 || (a === undefined && this.row === this.top() && this.col === 0)) {
          // Clear the screen: push the old content up into the scrollback.
          const keep = this.lines.length;
          for (let i = 0; i < this.rows; i++) this.lines.push("");
          this.row = keep;
          this.col = 0;
        } else this.lines.length = this.row + 1;
        break;
      case "K": {
        const line = this.lines[this.row];
        if (a === 2) this.lines[this.row] = "";
        else if (a === 1) this.lines[this.row] = " ".repeat(this.col) + line.slice(this.col);
        else this.lines[this.row] = line.slice(0, this.col);
        break;
      }
      case "A":
        this.row = Math.max(this.top(), this.row - (a ?? 1));
        break;
      case "B":
        this.row += a ?? 1;
        this.ensure(this.row);
        break;
      case "C":
        this.col += a ?? 1;
        break;
      case "D":
        this.col = Math.max(0, this.col - (a ?? 1));
        break;
      case "G":
        this.col = Math.max(0, (a ?? 1) - 1);
        break;
      case "P": {
        const line = this.lines[this.row];
        this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + (a ?? 1));
        break;
      }
      case "@": {
        const line = this.lines[this.row];
        this.lines[this.row] = line.slice(0, this.col) + " ".repeat(a ?? 1) + line.slice(this.col);
        break;
      }
      default:
        break; // colours (m), modes (h, l) and the rest are ignored
    }
  }

  write(chunk: string) {
    const text = this.pending + chunk;
    this.pending = "";
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\x1b") {
        const next = text[i + 1];
        if (next === undefined) {
          this.pending = text.slice(i);
          break;
        }
        if (next === "[") {
          const m = /^\x1b\[([0-9;?>=]*)([@-~])/.exec(text.slice(i));
          if (!m) {
            if (text.length - i < 32) this.pending = text.slice(i);
            break;
          }
          this.csi(m[1], m[2]);
          i += m[0].length;
          continue;
        }
        if (next === "]") {
          const end = text.slice(i).search(/\x07|\x1b\\/);
          if (end < 0) {
            this.pending = text.slice(i);
            break;
          }
          i += end + (text[i + end] === "\x07" ? 1 : 2);
          continue;
        }
        i += 2;
        continue;
      }
      if (ch === "\r") this.col = 0;
      else if (ch === "\n") {
        this.row += 1;
        this.ensure(this.row);
      } else if (ch === "\b") this.col = Math.max(0, this.col - 1);
      else if (ch === "\t") this.col = (Math.floor(this.col / 8) + 1) * 8;
      else if (ch >= " " && ch !== "\x7f") this.put(ch);
      i += 1;
    }
    if (this.lines.length > MAX_LINES) {
      const drop = this.lines.length - MAX_LINES;
      this.lines.splice(0, drop);
      this.row = Math.max(0, this.row - drop);
    }
  }
}

function keyToData(e: React.KeyboardEvent): string | null {
  if (e.metaKey) return null;
  const k = e.key;
  if (e.ctrlKey && k.length === 1) {
    const code = k.toUpperCase().charCodeAt(0);
    if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
    return null;
  }
  const map: Record<string, string> = {
    Enter: "\r",
    Backspace: "\x7f",
    Tab: "\t",
    Escape: "\x1b",
    ArrowUp: "\x1b[A",
    ArrowDown: "\x1b[B",
    ArrowRight: "\x1b[C",
    ArrowLeft: "\x1b[D",
    Home: "\x1b[H",
    End: "\x1b[F",
    Delete: "\x1b[3~",
    PageUp: "\x1b[5~",
    PageDown: "\x1b[6~",
  };
  if (map[k]) return map[k];
  if (k.length === 1) return e.altKey ? `\x1b${k}` : k;
  return null;
}

type State = "idle" | "connecting" | "open" | "closed";

export function WebTerminal({ computerId, className }: { computerId: string; className?: string }) {
  const screen = useRef(new Screen());
  const [view, setView] = useState<{ lines: string[]; row: number; col: number }>({ lines: [""], row: 0, col: 0 });
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const sid = useRef<string | null>(null);
  const source = useRef<EventSource | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const size = useRef({ cols: 120, rows: 30 });

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return size.current;
    const cols = Math.max(40, Math.min(300, Math.floor((el.clientWidth - 24) / 7.8)));
    const rows = Math.max(10, Math.min(120, Math.floor((el.clientHeight - 20) / 18)));
    size.current = { cols, rows };
    screen.current.rows = rows;
    return size.current;
  }, []);

  const post = useCallback(
    (body: { data?: string; cols?: number; rows?: number }) => {
      const id = sid.current;
      if (!id) return;
      queue.current = queue.current.then(() =>
        fetch(`/api/computers/${computerId}/terminal/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: id, ...body }) })
          .then((res) => {
            if (res.status === 410) {
              setState("closed");
              setMessage("The terminal closed.");
            }
          })
          .catch(() => undefined),
      );
    },
    [computerId],
  );

  const connect = useCallback(async () => {
    source.current?.close();
    sid.current = null;
    setState("connecting");
    setMessage(null);
    try {
      const res = await fetch(`/api/computers/${computerId}/terminal`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ticket?: string; error?: string } | null;
      if (!res.ok || !data?.ticket) {
        setState("closed");
        setMessage(data?.error ?? `The terminal could not be opened (the server answered ${res.status}).`);
        return;
      }
      const { cols, rows } = measure();
      const es = new EventSource(`/api/computers/${computerId}/terminal/stream?ticket=${encodeURIComponent(data.ticket)}&cols=${cols}&rows=${rows}`);
      source.current = es;
      es.addEventListener("ready", (ev) => {
        sid.current = (JSON.parse((ev as MessageEvent).data) as { sid: string }).sid;
        setState("open");
        box.current?.focus();
      });
      es.addEventListener("output", (ev) => {
        const scr = screen.current;
        scr.write(JSON.parse((ev as MessageEvent).data) as string);
        setView({ lines: [...scr.lines], row: scr.row, col: scr.col });
      });
      es.addEventListener("closed", (ev) => {
        es.close();
        setState("closed");
        setMessage((JSON.parse((ev as MessageEvent).data) as { reason?: string }).reason ?? "The terminal closed.");
      });
      // The ticket is single use: never let EventSource retry on its own.
      es.onerror = () => {
        es.close();
        setState((s) => (s === "open" || s === "connecting" ? "closed" : s));
        setMessage((m) => m ?? "The terminal disconnected.");
      };
    } catch {
      setState("closed");
      setMessage("The request could not be sent. Check your connection and try again.");
    }
  }, [computerId, measure]);

  useEffect(() => {
    const start = setTimeout(() => void connect(), 0);
    return () => {
      clearTimeout(start);
      source.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { cols, rows } = measure();
        post({ cols, rows });
      }, 250);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [measure, post]);

  // Keep the newest output in view.
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const s = view;
  return (
    <div className={cx("relative flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-[var(--om-border)] bg-[#0d0d0d]", className)}>
      <div
        ref={box}
        tabIndex={0}
        role="textbox"
        aria-label="Terminal"
        aria-multiline="true"
        onKeyDown={(e) => {
          if (state !== "open") return;
          const data = keyToData(e);
          if (data === null) return;
          e.preventDefault();
          post({ data });
        }}
        onPaste={(e) => {
          if (state !== "open") return;
          e.preventDefault();
          post({ data: e.clipboardData.getData("text").replace(/\r?\n/g, "\r") });
        }}
        className="min-h-0 flex-1 cursor-text overflow-auto px-[12px] py-[10px] font-mono text-[13px] leading-[18px] text-[#e6e6e6] outline-none"
      >
        <pre className="m-0 whitespace-pre font-mono">
          {s.lines.map((line, index) =>
            index === s.row && state === "open" ? (
              <div key={index}>
                {line.slice(0, s.col)}
                <span className="bg-[#e6e6e6] text-[#0d0d0d]">{line[s.col] ?? " "}</span>
                {line.slice(s.col + 1)}
              </div>
            ) : (
              <div key={index}>{line || " "}</div>
            ),
          )}
        </pre>
      </div>
      {state !== "open" ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-[12px] border-t border-[var(--om-border)] bg-[#161616] px-[12px] py-[8px] text-[13px] leading-[18px] text-[var(--om-text-2)]">
          <span role="status">{state === "connecting" ? "Connecting..." : (message ?? "Not connected.")}</span>
          {state === "closed" ? (
            <button type="button" onClick={() => void connect()} className="h-[26px] cursor-pointer rounded-[7px] border border-[var(--om-border-strong)] px-[9px] font-medium text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]">
              Reconnect
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
