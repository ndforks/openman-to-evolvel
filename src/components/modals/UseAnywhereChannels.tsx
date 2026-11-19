"use client";

/**
 * Telegram and Slack: link, status, unlink, Slack access approvals. Shared by the "Reach <brand> from anywhere" panel and
 * Settings → Integrations. The agent on the user's computer (Hermes) talks on both apps itself; see `@/lib/channels/server`.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { brand } from "@/config/brand";
import { Button, TextInput } from "@/components/settings/ui";
import { toast } from "@/components/ui/toast";
import { approveSlack, linkSlack, pollTelegram, slackManifest, startTelegram, unlinkChannel, useChannelStore, useChannels } from "@/lib/channels/client";
import { qrPath } from "@/lib/channels/qr";
import type { ChannelHealth, ChannelId, TelegramPairingAnswer } from "@/lib/channels/types";
import { ModalShell, cn } from "./ModalShell";

/* ---------------------------------------------------------------- small parts */

export function ChannelLogo({ channel, size = 20 }: { channel: ChannelId; size?: number }) {
  if (channel === "slack") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brands/slack-color.svg" alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  return <span aria-hidden className="block shrink-0 bg-[#26A5E4]" style={{ width: size, height: size, WebkitMask: "url(/brands/telegram.svg) center / contain no-repeat", mask: "url(/brands/telegram.svg) center / contain no-repeat" }} />;
}

export function healthLabel(h: ChannelHealth | undefined): { text: string; dot: string } {
  if (!h || !h.linked) return { text: "Not linked", dot: "bg-[var(--om-icon-disabled)]" };
  if (h.state === "connected") return { text: "Connected", dot: "bg-[var(--om-success)]" };
  if (h.state === "failed") return { text: "Failed", dot: "bg-[var(--om-danger)]" };
  if (h.state === "stopped") return { text: "Agent stopped", dot: "bg-[var(--om-warning,#f5a524)]" };
  return { text: "Connecting", dot: "bg-[var(--om-warning,#f5a524)]" };
}

export function StatusPill({ health }: { health: ChannelHealth | undefined }) {
  const { text, dot } = healthLabel(health);
  return (
    <span className="inline-flex shrink-0 items-center gap-[6px] text-[12.5px] leading-[16px] text-[var(--om-text-3)]">
      <span className={cn("size-[6px] rounded-full", dot)} />
      {text}
    </span>
  );
}

function Spinner() {
  return <span className="size-[12px] animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden />;
}

function Step({ n, title, children, done }: { n: number; title: string; children?: ReactNode; done?: boolean }) {
  return (
    <li className="flex gap-[12px]">
      <span className={cn("mt-[1px] flex size-[20px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-medium", done ? "bg-[var(--om-success)] text-white" : "bg-[var(--om-fill-strong)] text-[var(--om-text-2)]")}>{done ? "✓" : n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="text-[13.5px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
        {children ? <div className="text-[13px] leading-[19px] text-[var(--om-text-3)]">{children}</div> : null}
      </div>
    </li>
  );
}

function Path({ children }: { children: ReactNode }) {
  return <span className="font-medium text-[var(--om-text-2)]">{children}</span>;
}

function DialogFrame({ channel, title, subtitle, onClose, children }: { channel: ChannelId; title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <ModalShell title={title} onClose={onClose} className="max-h-[calc(100vh-48px)] w-[540px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[20px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[24px] pb-[24px] pt-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-[12px] pr-[28px]">
        <div className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-[var(--om-border)] bg-[var(--om-surface)]">
          <ChannelLogo channel={channel} size={22} />
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 className="text-[17px] font-semibold leading-[24px] text-[var(--om-text-1)]">{title}</h2>
          <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-[20px] flex flex-col gap-[16px]">{children}</div>
    </ModalShell>
  );
}

/** Unlink, asking first when the agent is mid-task (unlinking restarts it). */
function useUnlink(channel: ChannelId, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const reload = useChannelStore((s) => s.load);
  const run = async (force = false) => {
    setBusy(true);
    const res = await unlinkChannel(channel, force);
    setBusy(false);
    if (res.ok) {
      setConfirm(null);
      toast(`${channel === "slack" ? "Slack" : "Telegram"} unlinked`);
      await reload(true);
      onDone();
    } else if (res.status === 409) setConfirm(res.error);
    else toast(res.error, "error");
  };
  return { busy, confirm, run };
}

function ConfirmBusy({ message, onContinue, busy }: { message: string; onContinue: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-[8px] rounded-[10px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] p-[12px] text-[13px] leading-[19px] text-[var(--om-text-2)]">
      {message}
      <div>
        <Button variant="danger" onClick={onContinue} disabled={busy}>
          {busy ? <Spinner /> : null}
          Continue anyway
        </Button>
      </div>
    </div>
  );
}

function ConversationsLink({ onClose }: { onClose: () => void }) {
  return (
    <Link href="/app/agents" onClick={onClose} className="text-[13px] font-medium text-[var(--om-text-accent,#4a9eff)] hover:underline">
      View conversations
    </Link>
  );
}

/* ---------------------------------------------------------------- Telegram */

function QrCode({ value }: { value: string }) {
  const { d, size } = useMemo(() => qrPath(value), [value]);
  const q = 3;
  return (
    <div role="img" aria-label="QR code that opens Telegram" className="shrink-0 rounded-[12px] bg-white p-[6px]">
      <svg width={168} height={168} viewBox={`${-q} ${-q} ${size + 2 * q} ${size + 2 * q}`} shapeRendering="crispEdges">
        <path d={d} fill="#000" />
      </svg>
    </div>
  );
}

export function TelegramDialog({ onClose }: { onClose: () => void }) {
  const { data, reload } = useChannels();
  const linked = !!data?.telegram.linked;
  const [pairing, setPairing] = useState<TelegramPairingAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const handle = useRef<string | null>(null);
  const unlink = useUnlink("telegram", () => setPairing(null));

  const start = useCallback(async (replace = false) => {
    setError(null);
    setStarting(true);
    const res = await startTelegram(replace);
    setStarting(false);
    if (!res.ok) return setError(res.error);
    handle.current = res.handle ?? null;
    setPairing(res);
    if (res.status === "connected") void reload();
  }, [reload]);

  // Not linked yet: start a pairing as soon as the dialog opens, so the QR code is there straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!data || linked || autoStarted.current) return;
    // The flag is set when the start really runs: React's dev double-run clears the first timer.
    const t = setTimeout(() => {
      autoStarted.current = true;
      void start();
    }, 0);
    return () => clearTimeout(t);
  }, [data, linked, start]);

  // Poll while a pairing is under way.
  useEffect(() => {
    if (!pairing || pairing.status === "connected" || pairing.status === "expired" || pairing.status === "refused" || pairing.status === "stuck") return;
    const t = setInterval(async () => {
      if (!handle.current) return;
      const res = await pollTelegram(handle.current);
      if (!res.ok) return;
      setPairing((p) => ({ ...p, ...res, link: p?.link, handle: p?.handle }));
      if (res.status === "connected") {
        toast("Telegram linked", "success");
        void reload();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [pairing, reload]);

  const bot = data?.telegram.bot ?? pairing?.bot ?? null;
  const showLinked = linked || pairing?.status === "connected";

  return (
    <DialogFrame channel="telegram" title={`${brand.name} on Telegram`} subtitle="A private bot that takes jobs, voice memos, photos and files, and answers in the same chat." onClose={onClose}>
      {showLinked ? (
        <>
          <div className="flex items-center justify-between gap-[12px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card,transparent)] px-[14px] py-[12px]">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] font-medium text-[var(--om-text-1)]">{bot ? `@${bot}` : "Your bot"}</span>
              <span className="text-[12.5px] text-[var(--om-text-3)]">Only you can talk to it. It sees only its own chat with you.</span>
            </div>
            <StatusPill health={data?.telegram ?? { linked: true, state: "connecting", error: null }} />
          </div>
          {data?.telegram.error ? <p className="text-[13px] text-[var(--om-danger)]">{data.telegram.error}</p> : null}
          <div className="flex flex-wrap items-center gap-[8px]">
            {bot ? (
              <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">
                <Button variant="primary">Open in Telegram</Button>
              </a>
            ) : null}
            <Button onClick={() => void start(true)} disabled={starting}>
              New bot
            </Button>
            <Button variant="danger" onClick={() => void unlink.run()} disabled={unlink.busy}>
              {unlink.busy ? <Spinner /> : null}
              Unlink
            </Button>
            <span className="flex-1" />
            <ConversationsLink onClose={onClose} />
          </div>
          {unlink.confirm ? <ConfirmBusy message={unlink.confirm} busy={unlink.busy} onContinue={() => void unlink.run(true)} /> : null}
        </>
      ) : (
        <div className="flex gap-[20px] max-sm:flex-col">
          <div className="flex size-[180px] shrink-0 items-center justify-center">
            {pairing?.link && pairing.status === "waiting" ? <QrCode value={pairing.link} /> : <div className="flex size-[168px] items-center justify-center rounded-[12px] bg-[var(--om-fill-subtle)] text-[var(--om-text-3)]">{pairing?.status === "connecting" ? <span className="px-[12px] text-center text-[12.5px]">Bot created. Handing it to your agent…</span> : <Spinner />}</div>}
          </div>
          <ol className="flex flex-1 flex-col gap-[14px]">
            <Step n={1} title="Scan the code with your phone" done={pairing?.status === "connecting"}>
              Or open the link on this computer.{" "}
              {pairing?.link ? (
                <a className="font-medium text-[var(--om-text-accent,#4a9eff)] hover:underline" href={pairing.link} target="_blank" rel="noreferrer">
                  Open Telegram
                </a>
              ) : null}
            </Step>
            <Step n={2} title="Tap Create in Telegram" done={pairing?.status === "connecting"}>
              Telegram makes a bot that belongs to you. It is linked in about a minute.
            </Step>
            <Step n={3} title="Message your bot">
              Send it a task. Replies, files and voice notes come back in the same chat.
            </Step>
          </ol>
        </div>
      )}
      {!showLinked && pairing?.canLeave && pairing.status === "connecting" ? <p className="text-[12.5px] text-[var(--om-text-3)]">You can close this window. Linking finishes on its own.</p> : null}
      {pairing && (pairing.status === "expired" || pairing.status === "stuck") && !showLinked ? (
        <div className="flex items-center gap-[10px] text-[13px] text-[var(--om-text-2)]">
          {pairing.status === "expired" ? "That code expired." : "Your agent didn\u2019t take the bot."}
          <Button onClick={() => void start(pairing.status === "stuck")}>Try again</Button>
        </div>
      ) : null}
      {pairing?.status === "refused" ? <p className="text-[13px] text-[var(--om-danger)]">This agent is run by hand on its computer, so it can&apos;t take a bot from here.</p> : null}
      {error ? (
        <div className="flex items-center gap-[10px] text-[13px] text-[var(--om-danger)]">
          {error}
          <Button onClick={() => void start()}>Try again</Button>
        </div>
      ) : null}
    </DialogFrame>
  );
}

/* ---------------------------------------------------------------- Slack */

function SlackAccess({ onClose }: { onClose: () => void }) {
  const { data, reload } = useChannels();
  const [acting, setActing] = useState<string | null>(null);
  const pending = data?.slack.pending ?? [];
  const approved = data?.slack.approved ?? 0;

  // Watch for a first DM while nobody has access yet, or while requests wait.
  useEffect(() => {
    if (approved > 0 && pending.length === 0) return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [approved, pending.length, reload]);

  const act = async (id: string, deny: boolean) => {
    setActing(id);
    const res = await approveSlack(id, deny);
    setActing(null);
    if (res.ok) toast(deny ? "Request declined" : `${res.name || "They"} can now use ${brand.name} in Slack`, deny ? "info" : "success");
    else toast(res.error, "error");
    void reload();
  };

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="text-[13.5px] font-medium text-[var(--om-text-1)]">Who can use it</div>
      {pending.map((p) => (
        <div key={p.id} className="flex items-center gap-[10px] rounded-[10px] border border-[var(--om-border)] px-[12px] py-[10px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] text-[var(--om-text-1)]">{p.name}</span>
            <span className="text-[12px] text-[var(--om-text-3)]">Messaged the bot and is waiting for access</span>
          </div>
          <Button onClick={() => void act(p.id, true)} disabled={!!acting}>
            Decline
          </Button>
          <Button variant="primary" onClick={() => void act(p.id, false)} disabled={!!acting}>
            {acting === p.id ? <Spinner /> : null}
            Approve
          </Button>
        </div>
      ))}
      {pending.length === 0 ? (
        <p className="text-[13px] leading-[19px] text-[var(--om-text-3)]">
          {approved > 0 ? `${approved} ${approved === 1 ? "person has" : "people have"} access. ` : ""}
          To let someone in (you first), they send the bot a direct message in Slack. The bot answers with a pairing code and the request shows up here to approve.
          {approved === 0 ? <span className="ml-[6px] inline-flex translate-y-[2px]"><Spinner /></span> : null}
        </p>
      ) : null}
      <p className="text-[12.5px] leading-[18px] text-[var(--om-text-4)]">
        In a channel, invite the bot (<Path>/invite @{brand.name}</Path>) and mention it to start a task; it reads the thread and replies there. DMs work too. <ConversationsLink onClose={onClose} />
      </p>
    </div>
  );
}

export function SlackDialog({ onClose }: { onClose: () => void }) {
  const { data, reload } = useChannels();
  const linked = !!data?.slack.linked;
  const [manifest, setManifest] = useState<{ createUrl: string; text: string } | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [appToken, setAppToken] = useState("");
  const [botToken, setBotToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const unlink = useUnlink("slack", () => undefined);

  useEffect(() => {
    if (linked || manifest || manifestError) return;
    void slackManifest().then((res) => (res.ok ? setManifest({ createUrl: res.createUrl, text: JSON.stringify(res.manifest, null, 2) }) : setManifestError(res.error)));
  }, [linked, manifest, manifestError]);

  const connect = async (force = false) => {
    setError(null);
    setBusy(true);
    const res = await linkSlack(botToken.trim(), appToken.trim(), force);
    setBusy(false);
    if (res.ok) {
      setConfirm(null);
      setAppToken("");
      setBotToken("");
      toast(res.state === "connected" ? `Slack linked: ${res.name}` : `Slack tokens saved: ${res.name}`, "success");
      if (res.error) setError(res.error);
      void reload();
    } else if (res.status === 409) setConfirm(res.error);
    else setError(res.error);
  };

  const copy = () => {
    if (!manifest) return;
    void navigator.clipboard?.writeText(manifest.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <DialogFrame channel="slack" title={`${brand.name} on Slack`} subtitle={`Mention @${brand.name} in a channel or send it a DM to hand over work. Results arrive as replies and attachments.`} onClose={onClose}>
      {linked ? (
        <>
          <div className="flex items-center justify-between gap-[12px] rounded-[12px] border border-[var(--om-border)] px-[14px] py-[12px]">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] font-medium text-[var(--om-text-1)]">{data?.slack.name ?? "Slack workspace"}</span>
              <span className="text-[12.5px] text-[var(--om-text-3)]">Your agent connects to Slack from its own computer (Socket Mode).</span>
            </div>
            <StatusPill health={data?.slack} />
          </div>
          {data?.slack.error ? <p className="text-[13px] text-[var(--om-danger)]">{data.slack.error}</p> : null}
          <SlackAccess onClose={onClose} />
          <div className="flex items-center gap-[8px]">
            <Button variant="danger" onClick={() => void unlink.run()} disabled={unlink.busy}>
              {unlink.busy ? <Spinner /> : null}
              Unlink Slack
            </Button>
          </div>
          {unlink.confirm ? <ConfirmBusy message={unlink.confirm} busy={unlink.busy} onContinue={() => void unlink.run(true)} /> : null}
        </>
      ) : (
        <>
          <ol className="flex flex-col gap-[16px]">
            <Step n={1} title="Create the Slack app">
              <span className="block">
                Opens Slack with everything filled in. Pick your workspace, then <Path>Next</Path> → <Path>Create</Path>.
              </span>
              <span className="mt-[8px] flex flex-wrap items-center gap-[8px]">
                {manifest ? (
                  <a href={manifest.createUrl} target="_blank" rel="noreferrer">
                    <Button variant="primary">Create app in Slack</Button>
                  </a>
                ) : (
                  <Button variant="primary" disabled>
                    {manifestError ? "Unavailable" : <Spinner />}
                  </Button>
                )}
                <Button onClick={copy} disabled={!manifest}>
                  {copied ? "Copied" : "Copy manifest"}
                </Button>
              </span>
              <span className="mt-[6px] block text-[12px] text-[var(--om-text-4)]">
                If the link opens an empty form: <Path>api.slack.com/apps</Path> → <Path>Create New App</Path> → <Path>From a manifest</Path>, paste the copied manifest.
              </span>
              {manifestError ? <span className="mt-[4px] block text-[var(--om-danger)]">{manifestError}</span> : null}
            </Step>
            <Step n={2} title="Make the connection token">
              In your new app: <Path>Basic Information</Path> → <Path>App-Level Tokens</Path> → <Path>Generate Token and Scopes</Path>. Name it anything, add the <Path>connections:write</Path> scope, <Path>Generate</Path>, and copy the token.
              <TextInput className="mt-[8px] w-full font-mono" placeholder="xapp-…" value={appToken} onChange={(e) => setAppToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="App-Level Token" />
            </Step>
            <Step n={3} title="Install it to your workspace">
              <Path>Install App</Path> → <Path>Install to Workspace</Path> → <Path>Allow</Path>, then copy the <Path>Bot User OAuth Token</Path>.
              <TextInput className="mt-[8px] w-full font-mono" placeholder="xoxb-…" value={botToken} onChange={(e) => setBotToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Bot User OAuth Token" />
            </Step>
          </ol>
          <div className="flex items-center gap-[10px]">
            <Button variant="primary" onClick={() => void connect()} disabled={busy || !appToken.trim() || !botToken.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Connecting…" : "Connect Slack"}
            </Button>
            <span className="text-[12px] text-[var(--om-text-4)]">Tokens are checked with Slack, stored encrypted and placed only on your agent&apos;s computer.</span>
          </div>
          {confirm ? <ConfirmBusy message={confirm} busy={busy} onContinue={() => void connect(true)} /> : null}
        </>
      )}
      {error ? <p className="text-[13px] text-[var(--om-danger)]">{error}</p> : null}
    </DialogFrame>
  );
}

export function ChannelDialog({ channel, onClose }: { channel: ChannelId; onClose: () => void }) {
  return channel === "slack" ? <SlackDialog onClose={onClose} /> : <TelegramDialog onClose={onClose} />;
}
