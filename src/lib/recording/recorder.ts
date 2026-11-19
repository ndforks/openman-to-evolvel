"use client";

/**
 * The recorder: watches what the user does in our noVNC viewer while they control their computer, and turns it into
 * steps (clicks, drags, scrolls, typed text grouped into strings, key chords, pastes) with timestamps and positions
 * normalised to the remote screen. It grabs a screenshot from the viewer's canvas before and after each meaningful
 * action (throttled) and asks the server for the active window's title after clicks and Enter.
 *
 * Not recorded: anything while capture is paused; text typed after a command that asks for a password (sudo, su,
 * passwd, ssh...) until Enter; text typed while the focused window's title looks like a password or sign-in prompt;
 * keys typed into a password field of this page; mouse movement without a click.
 */
import { recordingsApi } from "./client";
import type { RecordedStep } from "./types";

export interface RecorderSnapshot {
  steps: number;
  paused: boolean;
  /** Uploads still in flight. */
  pending: number;
  /** Uploads that failed even after retries. */
  failed: number;
  last: RecordedStep | null;
  /** The text being typed right now is not being kept. */
  hiding: boolean;
}

export interface RecorderOptions {
  recordingId: string;
  /** Element containing the noVNC canvas; listeners are attached to it in the capture phase. */
  host: HTMLElement;
  canvas: () => HTMLCanvasElement | null;
  onChange?: (snap: RecorderSnapshot) => void;
}

const SNAP_THROTTLE_MS = 600;
const AFTER_DELAY_MS = 1000;
const TYPE_IDLE_MS = 1500;
const MERGE_MS = 900;
const DOUBLE_CLICK_MS = 450;
const WINDOW_THROTTLE_MS = 1500;
const FLUSH_MS = 2500;
const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.72;
/** How long after a command like `sudo` the next typed line is treated as a password. */
const SECRET_ARM_MS = 20_000;

/** A command whose next line is a secret. */
const SECRET_COMMAND = /(^|[\s;&|])(sudo|su|passwd|ssh|scp|sftp|mysql\b.*\s-p|psql|docker\s+login|gh\s+auth|npm\s+login|vault\s+login|kinit|gpg)\b/i;
/** A focused window that is most likely asking for a secret. */
const SECRET_WINDOW = /(password|passphrase|passcode|authenticat|unlock|keyring|credential|sign[\s-]?in|log[\s-]?in|2fa|one[\s-]?time|otp|verification code)/i;

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "CapsLock", "AltGraph", "Fn", "Hyper", "Super"]);
const KEY_NAMES: Record<string, string> = { " ": "Space", Escape: "Esc", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };

interface Meta {
  afterTimer?: ReturnType<typeof setTimeout>;
  afterDone: boolean;
  windowDone: boolean;
  dirty: boolean;
}

export class Recorder {
  readonly #o: RecorderOptions;
  readonly #start = Date.now();
  #steps: RecordedStep[] = [];
  #meta = new Map<string, Meta>();
  #seq = 0;
  #partSeq = 0;
  #imageSeq = 0;
  #paused = false;
  #stopped = false;
  #uploads = new Set<Promise<unknown>>();
  #failed = 0;
  #lastSnap: { at: number; key: string } | null = null;
  #down: { x: number; y: number; at: number; button: number; before: string | null } | null = null;
  #typing: RecordedStep | null = null;
  #typingTimer?: ReturnType<typeof setTimeout>;
  #lastAt = 0;
  /** When a command that asks for a secret was entered; the next line typed within a short while is hidden. */
  #armSecret = 0;
  #window: string | null = null;
  #windowAt = 0;
  #windowInflight: Promise<void> | null = null;
  #flushTimer?: ReturnType<typeof setInterval>;
  #listeners: [string, EventListener][] = [];

  constructor(options: RecorderOptions) {
    this.#o = options;
  }

  start(): void {
    const on = (type: string, fn: (e: Event) => void) => {
      const l = fn as EventListener;
      this.#o.host.addEventListener(type, l, { capture: true, passive: true });
      this.#listeners.push([type, l]);
    };
    // Mouse events, not pointer events: noVNC captures the mouse on press and re-dispatches the release to its
    // canvas as a synthetic mouseup, so a pointerup would land outside the viewer.
    on("mousedown", (e) => this.#pointerDown(e as MouseEvent));
    on("mouseup", (e) => this.#pointerUp(e as MouseEvent));
    on("wheel", (e) => this.#wheel(e as WheelEvent));
    on("keydown", (e) => this.#keyDown(e as KeyboardEvent));
    this.#flushTimer = setInterval(() => this.#flush(false), FLUSH_MS);
    this.#refreshWindow(null, 0);
    this.#emit();
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** Size of the remote screen, from the viewer's framebuffer. */
  screenSize(): { width: number; height: number } | null {
    const c = this.#o.canvas();
    return c && c.width > 0 ? { width: c.width, height: c.height } : null;
  }

  pause(): void {
    if (this.#paused || this.#stopped) return;
    this.#endTyping();
    this.#settleAll();
    this.#paused = true;
    this.#push({ kind: "pause" }, { noSnap: true });
    this.#emit();
  }

  resume(): void {
    if (!this.#paused || this.#stopped) return;
    this.#paused = false;
    this.#lastSnap = null;
    this.#emit();
  }

  /** Text the user sent to the computer's clipboard through the viewer's paste control. */
  recordPaste(text: string): void {
    if (!this.#active()) return;
    this.#endTyping();
    const hide = this.#hiding();
    const step = this.#push({ kind: "paste", ...(hide ? { redacted: true, text: "" } : { text: text.slice(0, 4000) }) });
    this.#scheduleAfter(step);
  }

  /** Stops listening, takes the last screenshot, uploads everything and resolves when all uploads have settled. */
  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#endTyping();
    this.#settleAll();
    this.#stopped = true;
    for (const [type, l] of this.#listeners) this.#o.host.removeEventListener(type, l, { capture: true });
    this.#listeners = [];
    if (this.#flushTimer) clearInterval(this.#flushTimer);
    if (this.#windowInflight) await Promise.race([this.#windowInflight, new Promise((r) => setTimeout(r, 2500))]);
    for (const m of this.#meta.values()) m.windowDone = true;
    this.#flush(true);
    while (this.#uploads.size) await Promise.allSettled([...this.#uploads]);
    this.#emit();
  }

  /** Stops without uploading what is still pending (used when the recording is discarded). */
  abandon(): void {
    this.#stopped = true;
    for (const [type, l] of this.#listeners) this.#o.host.removeEventListener(type, l, { capture: true });
    this.#listeners = [];
    if (this.#flushTimer) clearInterval(this.#flushTimer);
    if (this.#typingTimer) clearTimeout(this.#typingTimer);
    for (const m of this.#meta.values()) if (m.afterTimer) clearTimeout(m.afterTimer);
  }

  /* ---------------------------------------------------------------- input */

  #active(): boolean {
    return !this.#stopped && !this.#paused;
  }

  #norm(e: MouseEvent): { x: number; y: number } | null {
    const c = this.#o.canvas();
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
  }

  #pointerDown(e: MouseEvent): void {
    if (!this.#active()) return;
    const p = this.#norm(e);
    if (!p) return;
    this.#endTyping();
    this.#settleAll();
    this.#armSecret = 0;
    this.#down = { ...p, at: Date.now(), button: e.button, before: this.#snap() };
  }

  #pointerUp(e: MouseEvent): void {
    const d = this.#down;
    this.#down = null;
    if (!d || !this.#active()) return;
    const p = this.#norm(e) ?? d;
    const size = this.screenSize() ?? { width: 1280, height: 720 };
    const moved = Math.hypot((p.x - d.x) * size.width, (p.y - d.y) * size.height);
    let step: RecordedStep;
    const last = this.#steps[this.#steps.length - 1];
    if (moved > 12) {
      step = this.#push({ kind: "drag", x: d.x, y: d.y, x2: p.x, y2: p.y }, { before: d.before });
    } else if (d.button === 2) {
      step = this.#push({ kind: "right_click", x: d.x, y: d.y }, { before: d.before });
    } else if (last && last.kind === "click" && d.at - this.#lastAt < DOUBLE_CLICK_MS && Math.abs((last.x ?? 0) - d.x) < 0.01 && Math.abs((last.y ?? 0) - d.y) < 0.01) {
      last.kind = "double_click";
      step = last;
      this.#touch(last);
    } else {
      step = this.#push({ kind: "click", x: d.x, y: d.y }, { before: d.before });
    }
    this.#lastAt = Date.now();
    this.#scheduleAfter(step);
    this.#refreshWindow(step);
  }

  #wheel(e: WheelEvent): void {
    if (!this.#active()) return;
    const p = this.#norm(e);
    if (!p) return;
    this.#endTyping();
    const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 0.1 : 100;
    const notch = (v: number) => (v === 0 ? 0 : Math.sign(v) * Math.max(1, Math.round(Math.abs(v) / unit)));
    const last = this.#steps[this.#steps.length - 1];
    let step: RecordedStep;
    if (last && last.kind === "scroll" && Date.now() - this.#lastAt < MERGE_MS) {
      step = last;
      step.dx = (step.dx ?? 0) + notch(e.deltaX);
      step.dy = (step.dy ?? 0) + notch(e.deltaY);
      this.#touch(step);
    } else {
      this.#settleAll();
      step = this.#push({ kind: "scroll", x: p.x, y: p.y, dx: notch(e.deltaX), dy: notch(e.deltaY) });
    }
    this.#lastAt = Date.now();
    this.#scheduleAfter(step);
  }

  #keyDown(e: KeyboardEvent): void {
    if (!this.#active()) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input[type="password"]')) return;
    const key = e.key;
    if (!key || MODIFIERS.has(key) || key === "Unidentified" || key === "Dead") return;
    const printable = key.length === 1;
    if (printable && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this.#typeChar(key);
      return;
    }
    if (key === "Backspace" && this.#typing && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const t = this.#typing;
      if (t.redacted) {
        this.#bumpTyping();
        return;
      }
      if (t.text) {
        t.text = t.text.slice(0, -1);
        this.#touch(t);
        this.#bumpTyping();
        return;
      }
    }
    const ended = this.#endTyping();
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.metaKey && "Super"].filter(Boolean) as string[];
    if (e.shiftKey && (mods.length > 0 || !printable)) mods.push("Shift");
    const name = printable ? key.toUpperCase() : (KEY_NAMES[key] ?? key);
    const combo = [...mods, name].join("+");
    if (combo === "Enter") {
      if (ended?.redacted) this.#armSecret = 0;
      else if (ended?.text && SECRET_COMMAND.test(ended.text)) this.#armSecret = Date.now();
    }
    const last = this.#steps[this.#steps.length - 1];
    let step: RecordedStep;
    if (last && last.kind === "key" && last.keys === combo && Date.now() - this.#lastAt < MERGE_MS) {
      step = last;
      step.count = (step.count ?? 1) + 1;
      this.#touch(step);
    } else {
      this.#settleAll();
      step = this.#push({ kind: "key", keys: combo });
    }
    this.#lastAt = Date.now();
    this.#scheduleAfter(step);
    if (combo === "Enter" || mods.length) this.#refreshWindow(step);
  }

  #hiding(): boolean {
    return (this.#armSecret > 0 && Date.now() - this.#armSecret < SECRET_ARM_MS) || (!!this.#window && SECRET_WINDOW.test(this.#window));
  }

  #typeChar(ch: string): void {
    if (!this.#typing) {
      this.#settleAll();
      const hide = this.#hiding();
      this.#typing = this.#push({ kind: "type", text: "", ...(hide ? { redacted: true } : {}) });
      this.#meta.get(this.#typing.id)!.afterDone = false;
      this.#emit();
    }
    const t = this.#typing;
    if (!t.redacted) {
      t.text = ((t.text ?? "") + ch).slice(0, 4000);
      this.#touch(t);
    }
    this.#bumpTyping();
  }

  #bumpTyping(): void {
    if (this.#typingTimer) clearTimeout(this.#typingTimer);
    this.#typingTimer = setTimeout(() => this.#endTyping(), TYPE_IDLE_MS);
    this.#lastAt = Date.now();
  }

  /** Closes the current group of typed text. Returns it, or null when nothing was being typed. */
  #endTyping(): RecordedStep | null {
    const t = this.#typing;
    if (!t) return null;
    this.#typing = null;
    if (this.#typingTimer) clearTimeout(this.#typingTimer);
    if (!t.redacted && !t.text) {
      // Everything typed was deleted again: nothing happened.
      this.#steps = this.#steps.filter((s) => s !== t);
      this.#meta.delete(t.id);
      this.#emit();
      return null;
    }
    this.#scheduleAfter(t, 400);
    return t;
  }

  /* ---------------------------------------------------------------- steps */

  #push(fields: Omit<RecordedStep, "id" | "t">, opts: { before?: string | null; noSnap?: boolean } = {}): RecordedStep {
    const step: RecordedStep = {
      id: `s${(++this.#seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      t: Date.now() - this.#start,
      ...fields,
      window: this.#window,
      before: opts.noSnap ? null : opts.before !== undefined ? opts.before : this.#snap(),
    };
    this.#steps.push(step);
    this.#meta.set(step.id, { afterDone: !!opts.noSnap, windowDone: true, dirty: true });
    this.#emit();
    return step;
  }

  #touch(step: RecordedStep): void {
    const m = this.#meta.get(step.id);
    if (m) m.dirty = true;
  }

  #scheduleAfter(step: RecordedStep, delay = AFTER_DELAY_MS): void {
    const m = this.#meta.get(step.id);
    if (!m) return;
    if (m.afterTimer) clearTimeout(m.afterTimer);
    m.afterDone = false;
    m.afterTimer = setTimeout(() => this.#takeAfter(step), delay);
  }

  #takeAfter(step: RecordedStep): void {
    const m = this.#meta.get(step.id);
    if (!m) return;
    if (m.afterTimer) clearTimeout(m.afterTimer);
    m.afterTimer = undefined;
    if (!m.afterDone) {
      const key = this.#paused ? null : this.#snap();
      if (key && key !== step.before) step.after = key;
      m.afterDone = true;
      m.dirty = true;
    }
  }

  /** Takes every pending "after" screenshot now: a new action is about to change the screen. */
  #settleAll(): void {
    for (const s of this.#steps) {
      const m = this.#meta.get(s.id);
      if (m && !m.afterDone && s !== this.#typing) this.#takeAfter(s);
    }
  }

  /* ---------------------------------------------------------------- screenshots */

  /** A JPEG of the viewer's canvas, uploaded in the background. Returns its key, or the previous one if very recent. */
  #snap(): string | null {
    if (this.#paused || this.#stopped) return null;
    const now = Date.now();
    if (this.#lastSnap && now - this.#lastSnap.at < SNAP_THROTTLE_MS) return this.#lastSnap.key;
    const c = this.#o.canvas();
    if (!c || c.width === 0 || c.height === 0) return null;
    const scale = Math.min(1, MAX_IMAGE_WIDTH / c.width);
    const out = document.createElement("canvas");
    out.width = Math.round(c.width * scale);
    out.height = Math.round(c.height * scale);
    let data: string;
    try {
      const g = out.getContext("2d");
      if (!g) return null;
      g.drawImage(c, 0, 0, out.width, out.height);
      data = out.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1] ?? "";
    } catch {
      return null;
    }
    if (!data) return null;
    const key = `img${(++this.#imageSeq).toString().padStart(3, "0")}`;
    this.#lastSnap = { at: now, key };
    this.#track(() => recordingsApi.image(this.#o.recordingId, { key, mime: "image/jpeg", width: out.width, height: out.height, data }));
    return key;
  }

  /* ---------------------------------------------------------------- window title */

  #refreshWindow(step: RecordedStep | null, delay = 700): void {
    if (this.#windowInflight || Date.now() - this.#windowAt < WINDOW_THROTTLE_MS) return;
    this.#windowAt = Date.now();
    const m = step ? this.#meta.get(step.id) : undefined;
    if (m) m.windowDone = false;
    this.#windowInflight = new Promise<void>((resolve) => setTimeout(resolve, delay))
      .then(() => recordingsApi.window(this.#o.recordingId))
      .then(({ title }) => {
        this.#window = title;
        if (step) {
          step.window = title;
          this.#touch(step);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (m) m.windowDone = true;
        this.#windowInflight = null;
      });
  }

  /* ---------------------------------------------------------------- upload */

  /** Uploads steps that are settled (or all of them, at the end) and changed since their last upload. */
  #flush(all: boolean): void {
    const ready = this.#steps.filter((s) => {
      const m = this.#meta.get(s.id);
      return m?.dirty && (all || (m.afterDone && m.windowDone && s !== this.#typing));
    });
    if (!ready.length) return;
    for (const s of ready) this.#meta.get(s.id)!.dirty = false;
    const seq = this.#partSeq++;
    const events = ready.map((s) => ({ ...s }));
    this.#track(() => recordingsApi.events(this.#o.recordingId, seq, events));
  }

  #track(fn: () => Promise<unknown>): void {
    const attempt = async () => {
      for (let i = 0; ; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i >= 2 || (err as { status?: number }).status === 409) throw err;
          await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        }
      }
    };
    const p = attempt()
      .catch(() => {
        this.#failed += 1;
      })
      .finally(() => {
        this.#uploads.delete(p);
        this.#emit();
      });
    this.#uploads.add(p);
    this.#emit();
  }

  #emit(): void {
    this.#o.onChange?.({
      steps: this.#steps.filter((s) => s.kind !== "pause").length,
      paused: this.#paused,
      pending: this.#uploads.size,
      failed: this.#failed,
      last: this.#steps[this.#steps.length - 1] ?? null,
      hiding: !!this.#typing?.redacted || this.#hiding(),
    });
  }
}
