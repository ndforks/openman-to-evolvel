"use client";

/**
 * "Continue with Orgo": the sign-in flow shared by the sign-in modal and the `/signin` page.
 *
 * 1. Continue with Orgo (primary). The server starts Orgo's approval flow (`POST /api/auth/orgo/start`); a tab opens at
 *    orgo.ai where the person signs in (or creates a free Orgo account) and approves this app after checking the code
 *    shown here. This panel polls `POST /api/auth/orgo/poll` and continues by itself the moment Orgo says yes.
 *    Expired, denied, busy and network states each say what happened and offer a retry.
 * 2. Use an API key instead: paste an Orgo key; the server checks it with Orgo and signs in (`POST /api/auth/orgo/key`).
 * 3. Sign in with this computer's Orgo key: only shown by a server on this machine with local sign-in turned on
 *    (`POST /api/auth/local`).
 * Every path lands on `next` (a same-site path, checked again on the server).
 */
import { useCallback, useEffect, useRef, useState, type ElementType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, KeyRound, Laptop, Loader2 } from "lucide-react";
import { brand } from "@/config/brand";
import { refreshSession, useSession } from "@/lib/supabase/client";

const ORGO_API_KEYS_URL = "https://www.orgo.ai/api-keys";

type Step = "start" | "waiting" | "ended" | "key" | "done";

interface Pending {
  userCode: string;
  verificationUrl: string;
  handle: string;
  interval: number;
  expiresAt: number;
}

interface Ended {
  kind: "expired" | "denied" | "busy" | "error";
  message: string;
}

const primaryButton =
  "flex h-[40px] w-full shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] bg-[var(--om-btn-primary)] text-[15px] font-medium leading-[20px] text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "flex h-[38px] w-full shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] bg-white text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] shadow-[0px_0px_0px_1px_#0000001A,0px_1px_2px_#0000000A] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60";
const linkButton = "cursor-pointer text-[14px] font-medium leading-[20px] text-[var(--om-text-2)] underline decoration-[#0000002E] underline-offset-[3px] hover:text-[var(--om-text-1)]";

/** Opens a tab synchronously (inside the click, so it is not blocked), to be pointed at Orgo once the server answers. */
function openBlankTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

function pointTab(tab: Window | null, url: string): boolean {
  if (!tab || tab.closed) return false;
  try {
    tab.location.href = url;
    tab.opener = null;
    return true;
  } catch {
    return false;
  }
}

function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "info" }) {
  if (!children) return null;
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`text-left text-[13px] leading-[18px] ${tone === "danger" ? "text-[var(--om-danger)]" : "text-[var(--om-text-2)]"}`}>
      {children}
    </p>
  );
}

function minutesLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));
}

export interface OrgoSignInProps {
  next: string;
  source?: string;
  initialError?: string;
  /** Heading element (the modal passes Radix's Dialog.Title so the dialog is labelled). */
  Title?: ElementType;
  Description?: ElementType;
}

export function OrgoSignIn({ next, source, initialError, Title = "h1", Description = "p" }: OrgoSignInProps) {
  const { localSignIn } = useSession();
  const [step, setStep] = useState<Step>("start");
  const [busy, setBusy] = useState<"orgo" | "key" | "local" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [tabOpened, setTabOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [done, setDone] = useState<{ name?: string; note?: string; redirect: string } | null>(null);
  const [, setTick] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const pollRef = useRef<(current: Pending) => Promise<void>>(async () => undefined);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  // Refresh the "expires in" line once a minute while waiting.
  useEffect(() => {
    if (step !== "waiting") return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [step]);

  const finish = useCallback(async (redirect: string, info?: { name?: string; note?: string }) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    await refreshSession();
    setDone({ redirect, ...info });
    setStep("done");
    // A workspace-key note is worth a moment to read; otherwise go at once. A full navigation so the gate sees the cookie.
    window.setTimeout(() => window.location.assign(redirect), info?.note ? 4500 : 300);
  }, []);

  const end = useCallback((kind: Ended["kind"], message: string) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pendingRef.current = null;
    setPending(null);
    setEnded({ kind, message });
    setStep("ended");
  }, []);

  const poll = useCallback(
    async (current: Pending) => {
      if (!alive.current || pendingRef.current?.handle !== current.handle) return;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      let delay = current.interval;
      try {
        const res = await fetch("/api/auth/orgo/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: current.handle, next }) });
        const body = (await res.json().catch(() => ({}))) as { status?: string; interval?: number; redirect?: string; error?: string; user?: { name?: string } };
        if (!alive.current || pendingRef.current?.handle !== current.handle) return;
        if (body.status === "approved" || body.status === "waitlist") return void finish(body.redirect || next, { name: body.user?.name });
        if (body.status === "denied") return end("denied", "The request was cancelled on Orgo. Start again when you're ready.");
        if (body.status === "expired") return end("expired", "The code expired before it was approved. Codes last 30 minutes; start again for a new one.");
        if (!res.ok) {
          setChecking(body.error ?? "Couldn't check with Orgo. Retrying…");
          delay = Math.max(delay, 5);
        } else {
          setChecking(null);
          if (typeof body.interval === "number") delay = body.interval;
        }
      } catch {
        if (!alive.current) return;
        setChecking("Lost the connection. Retrying…");
        delay = Math.max(delay, 5);
      }
      if (Date.now() > current.expiresAt) return end("expired", "The code expired before it was approved. Start again for a new one.");
      pollTimer.current = setTimeout(() => void pollRef.current(current), Math.max(2, delay) * 1000);
    },
    [next, finish, end],
  );
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  // Coming back from the Orgo tab: check at once instead of waiting for the next tick.
  useEffect(() => {
    if (step !== "waiting") return;
    const onFocus = () => {
      if (document.visibilityState === "visible" && pendingRef.current) void pollRef.current(pendingRef.current);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [step]);

  async function continueWithOrgo() {
    if (busy) return;
    setError(null);
    setBusy("orgo");
    const tab = openBlankTab();
    try {
      const res = await fetch("/api/auth/orgo/start", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Partial<Pending> & { error?: string; code?: string; expiresIn?: number };
      if (!res.ok || !body.userCode || !body.verificationUrl || !body.handle) {
        tab?.close();
        if (res.status === 429 || body.code === "signin_busy") return end("busy", body.error ?? "Sign-in with Orgo is busy right now. Try again in a few minutes, or use an API key.");
        return end("error", body.error ?? "Couldn't start sign-in with Orgo. Try again.");
      }
      const started: Pending = {
        userCode: body.userCode,
        verificationUrl: body.verificationUrl,
        handle: body.handle,
        interval: body.interval ?? 2,
        expiresAt: Date.now() + (body.expiresIn ?? 1800) * 1000,
      };
      setTabOpened(pointTab(tab, started.verificationUrl));
      pendingRef.current = started;
      setPending(started);
      setChecking(null);
      setStep("waiting");
      pollTimer.current = setTimeout(() => void pollRef.current(started), started.interval * 1000);
    } catch {
      tab?.close();
      end("error", "Couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    if (busy || !apiKey.trim()) return;
    setBusy("key");
    setError(null);
    try {
      const res = await fetch("/api/auth/orgo/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey.trim(), next }) });
      const body = (await res.json().catch(() => ({}))) as { status?: string; redirect?: string; error?: string; note?: string; user?: { name?: string } };
      if (res.ok && (body.status === "approved" || body.status === "waitlist")) {
        setApiKey("");
        return void finish(body.redirect || next, { name: body.user?.name, note: body.note });
      }
      setError(body.error ?? "Couldn't sign in with that key. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function localSignInNow() {
    if (busy) return;
    setBusy("local");
    setError(null);
    try {
      const res = await fetch("/api/auth/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ next }) });
      const body = (await res.json().catch(() => ({}))) as { status?: string; redirect?: string; error?: string; note?: string };
      if (res.ok && body.status) return void finish(body.redirect || next, { note: body.note });
      setError(body.error ?? "Local sign-in isn't available on this server.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  function copyCode() {
    if (!pending) return;
    void navigator.clipboard?.writeText(pending.userCode).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }

  function cancelWaiting() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pendingRef.current = null;
    setPending(null);
    setStep("start");
  }

  const heading = "text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-[var(--om-text-1)]";
  const sub = "text-[14px] leading-[20px] text-[var(--om-text-3)]";

  if (step === "done") {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center gap-[12px] pt-[18px] text-center">
        <span className="flex size-[40px] items-center justify-center rounded-full bg-[var(--om-fill-accent,#E8F1FE)] text-[var(--om-icon-accent,#0081F2)]">
          <Check size={20} strokeWidth={2.2} aria-hidden />
        </span>
        <Title className={heading}>{done?.name ? `Signed in as ${done.name}` : "You're signed in"}</Title>
        {done?.note ? (
          <Description className="rounded-[10px] border border-[#0000001A] bg-white p-[12px] text-left text-[13px] leading-[18px] text-[var(--om-text-2)]">{done.note}</Description>
        ) : (
          <Description className={sub}>Taking you back…</Description>
        )}
        {done?.note ? (
          <button type="button" className={primaryButton} onClick={() => window.location.assign(done.redirect)}>
            Continue
          </button>
        ) : null}
      </div>
    );
  }

  if (step === "waiting" && pending) {
    const mins = minutesLeft(pending.expiresAt);
    return (
      <div className="flex w-full max-w-[340px] flex-col gap-[18px] pt-[18px]">
        <div className="flex flex-col items-center gap-[8px] text-center">
          <Title className={heading}>Approve {brand.name} in Orgo</Title>
          <Description className={sub}>
            {tabOpened ? "A tab opened at orgo.ai." : "Open orgo.ai to continue."} Sign in there, or create a free Orgo account, then check the code matches and approve.
          </Description>
        </div>

        <div className="flex flex-col items-center gap-[10px] rounded-[14px] border border-[#0000001A] bg-white px-[16px] py-[18px]">
          <span className="text-[12px] font-medium uppercase leading-[16px] tracking-[0.06em] text-[var(--om-text-3)]">Your code</span>
          <span aria-label={`Code ${pending.userCode.split("").join(" ")}`} className="select-all font-mono text-[32px] font-semibold leading-[40px] tracking-[0.12em] text-[var(--om-text-1)]">
            {pending.userCode}
          </span>
          <button type="button" onClick={copyCode} className="inline-flex h-[28px] cursor-pointer items-center gap-[6px] rounded-[8px] px-[10px] text-[13px] font-medium text-[var(--om-text-2)] hover:bg-[var(--om-fill-subtle,#F5F5F5)]">
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <div className="flex items-center gap-[8px] text-[13px] leading-[18px] text-[var(--om-text-2)]" role="status" aria-live="polite">
          <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />
          <span>{checking ?? "Waiting for your approval. This page continues by itself."}</span>
        </div>

        <button type="button" onClick={() => setTabOpened(pointTab(openBlankTab(), pending.verificationUrl))} className={tabOpened ? secondaryButton : primaryButton}>
          <ExternalLink size={15} aria-hidden />
          {tabOpened ? "Open the Orgo tab again" : "Open Orgo"}
        </button>

        <div className="flex items-center justify-between text-[13px] leading-[18px]">
          <button type="button" onClick={cancelWaiting} className="cursor-pointer text-[var(--om-text-3)] hover:text-[var(--om-text-1)]">
            Cancel
          </button>
          <span className="text-[var(--om-text-3)]">{mins > 0 ? `Code expires in ${mins} min` : "Code expiring"}</span>
        </div>
      </div>
    );
  }

  if (step === "key") {
    return (
      <form onSubmit={submitKey} noValidate className="flex w-full max-w-[340px] flex-col gap-[14px] pt-[18px]">
        <div className="flex flex-col items-center gap-[8px] text-center">
          <Title className={heading}>Sign in with an API key</Title>
          <Description className={sub}>For people who already have an Orgo API key. {brand.name} checks it with Orgo and keeps it encrypted.</Description>
        </div>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium leading-[18px] text-[var(--om-text-2)]">Orgo API key</span>
          <input
            type="password"
            name="orgo-api-key"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="sk_live_…"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (error) setError(null);
            }}
            className="h-[40px] w-full rounded-[10px] border border-[#0000001F] bg-white px-[12px] font-mono text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:font-sans placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]"
          />
        </label>
        <Alert>{error}</Alert>
        <button type="submit" disabled={!apiKey.trim() || busy !== null} className={primaryButton}>
          {busy === "key" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <KeyRound size={16} aria-hidden />}
          {busy === "key" ? "Checking with Orgo…" : "Sign in with key"}
        </button>
        <div className="flex flex-col gap-[6px] rounded-[10px] bg-[var(--om-fill-subtle,#F5F5F4)] p-[12px] text-[13px] leading-[18px] text-[var(--om-text-2)]">
          <span className="font-medium text-[var(--om-text-1)]">Get a key</span>
          <span>
            On orgo.ai:{" "}
            <a href={ORGO_API_KEYS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-[3px]">
              API keys
            </a>
            , then create one. Or in a terminal:
          </span>
          <code className="block whitespace-pre-wrap rounded-[6px] bg-white px-[8px] py-[6px] font-mono text-[12px] leading-[17px] text-[var(--om-text-1)]">orgo login{"\n"}orgo keys create --name {brand.name}</code>
          <span>
            Use an account key (no <code className="font-mono text-[12px]">--workspace</code>). A workspace key also works if you are the only person in that workspace, but {brand.name} can&apos;t show your credits or switch workspaces with it.
          </span>
        </div>
        <button type="button" onClick={() => setStep("start")} className="inline-flex cursor-pointer items-center justify-center gap-[6px] text-[14px] text-[var(--om-text-3)] hover:text-[var(--om-text-1)]">
          <ArrowLeft size={14} aria-hidden /> Continue with Orgo instead
        </button>
      </form>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col gap-[16px] pt-[18px]">
      <div className="flex flex-col items-center gap-[8px] text-center">
        <Title className={heading}>{step === "ended" && ended?.kind === "busy" ? "Sign-in is busy" : step === "ended" ? "Sign-in didn't finish" : `Sign in to ${brand.name}`}</Title>
        <Description className={sub}>
          {step === "ended" ? ended?.message : source === "composer" ? "We'll keep your message and send it as soon as you're in." : `${brand.name} works on your Orgo account: your own cloud computer, paid with your Orgo plan or credits.`}
        </Description>
      </div>

      <div className="flex flex-col gap-[10px]">
        <button type="button" onClick={() => void continueWithOrgo()} disabled={busy !== null} className={primaryButton}>
          {busy === "orgo" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {step === "ended" ? "Try again with Orgo" : "Continue with Orgo"}
        </button>
        {step !== "ended" ? (
          <p className="text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">You&apos;ll approve {brand.name} in your Orgo account. New to Orgo? You can create an account there for free.</p>
        ) : null}
        {localSignIn ? (
          <button type="button" onClick={() => void localSignInNow()} disabled={busy !== null} className={secondaryButton} title="Uses ORGO_API_KEY from this server's environment">
            {busy === "local" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Laptop size={15} aria-hidden />}
            Sign in with this computer&apos;s Orgo key
          </button>
        ) : null}
        <Alert>{error}</Alert>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep("key");
          }}
          className={linkButton}
        >
          Use an API key instead
        </button>
      </div>

      <p className="pt-[8px] text-center text-[12px] leading-[17px] text-[var(--om-text-3)]">
        By continuing, you agree to our{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-[#4D4D4D] underline hover:text-[var(--om-text-1)]">
          Terms of Service
        </a>{" "}
        and have read our{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-[#4D4D4D] underline hover:text-[var(--om-text-1)]">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
