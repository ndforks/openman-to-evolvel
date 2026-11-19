"use client";

/**
 * Agents: conversations the agent had outside this app, in Telegram, Slack and other chat apps. They get their own
 * "Agents" section rather than mixing into the task list, and are read live from Hermes' session store on the user's
 * computer (Orgo's sessions API), newest first, with the selected conversation on the right.
 */
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageShell } from "@/components/pages/ui";
import { ChannelDialog, ChannelLogo, StatusPill } from "@/components/modals/UseAnywhereChannels";
import { brand } from "@/config/brand";
import { useChannels } from "@/lib/channels/client";
import { CHANNEL_LABEL, type ChannelId, type ChannelSession, type ChannelSessionRead } from "@/lib/channels/types";

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

function Logo({ channel }: { channel: string }) {
  if (channel === "telegram" || channel === "slack") return <ChannelLogo channel={channel} size={16} />;
  return <span className="flex size-[16px] items-center justify-center rounded-[4px] bg-[var(--om-fill-strong)] text-[9px] font-semibold text-[var(--om-text-2)]">{(CHANNEL_LABEL[channel] ?? "?").slice(0, 1)}</span>;
}

export function AgentsView() {
  const { data: status } = useChannels();
  const [sessions, setSessions] = useState<ChannelSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [read, setRead] = useState<ChannelSessionRead | null>(null);
  const [reading, setReading] = useState(false);
  const [dialog, setDialog] = useState<ChannelId | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/channels/sessions", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { sessions?: ChannelSession[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't load conversations.");
      setSessions(body.sessions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load conversations.");
      setSessions((s) => s ?? []);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const open = async (id: string) => {
    setSelected(id);
    setReading(true);
    try {
      const res = await fetch(`/api/channels/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as ChannelSessionRead | null;
      setRead(res.ok ? body : null);
    } finally {
      setReading(false);
    }
  };

  const channels: ChannelId[] = ["telegram", "slack"];

  return (
    <PageShell title="Agents" bare>
      <div className="flex min-h-0 flex-1 gap-[16px] px-[22px] pb-[22px] max-md:flex-col">
        <div className="flex w-[340px] shrink-0 flex-col gap-[12px] max-md:w-full">
          <div className="grid grid-cols-2 gap-[8px]">
            {channels.map((c) => (
              <button key={c} type="button" onClick={() => setDialog(c)} className="flex items-center gap-[8px] rounded-[10px] border border-[var(--om-border)] bg-[var(--om-card)] px-[10px] py-[9px] text-left transition-colors hover:bg-[var(--om-fill-subtle)]">
                <ChannelLogo channel={c} size={18} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium leading-[18px]">{CHANNEL_LABEL[c]}</span>
                  <StatusPill health={status?.[c]} />
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-col">
            {sessions === null ? (
              [0, 1, 2].map((i) => <div key={i} className="mb-[6px] h-[52px] animate-pulse rounded-[10px] bg-[var(--om-fill-subtle)]" />)
            ) : sessions.length === 0 ? (
              <p className="px-[4px] py-[8px] text-[13px] leading-[19px] text-[var(--om-text-3)]">
                {error ?? `Nothing here yet. Once Telegram or Slack is linked, every chat with ${brand.name} there is listed on this page.`}
              </p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void open(s.id)}
                  className={`flex h-[52px] items-center gap-[10px] rounded-[10px] px-[10px] text-left transition-colors hover:bg-[var(--om-fill-subtle)] ${selected === s.id ? "bg-[var(--om-fill)]" : ""}`}
                >
                  <Logo channel={s.channel} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] leading-[18px] text-[var(--om-text-1)]">{s.title}</span>
                    <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">
                      {CHANNEL_LABEL[s.channel] ?? s.channel} · {s.messages} message{s.messages === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--om-text-4)]">{when(s.lastAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex min-h-[320px] min-w-0 flex-1 flex-col rounded-[14px] border border-[var(--om-border)] bg-[var(--om-card)]">
          {!selected ? (
            <div className="m-auto max-w-[360px] px-[20px] text-center text-[13px] leading-[19px] text-[var(--om-text-3)]">Pick a conversation to read it. Reply in the chat app itself; {brand.name} answers there.</div>
          ) : reading && !read ? (
            <div className="m-auto text-[13px] text-[var(--om-text-3)]">Loading…</div>
          ) : read ? (
            <>
              <div className="flex items-center gap-[8px] border-b border-[var(--om-border)] px-[16px] py-[12px]">
                <Logo channel={read.channel} />
                <span className="truncate text-[14px] font-medium">{read.title}</span>
                {read.total > read.messages.length ? <span className="ml-auto shrink-0 text-[12px] text-[var(--om-text-3)]">Newest {read.messages.length} of {read.total}</span> : null}
              </div>
              <div className="flex flex-col gap-[12px] overflow-y-auto px-[16px] py-[14px]">
                {read.messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="max-w-[80%] self-end whitespace-pre-wrap rounded-[12px] bg-[var(--om-fill)] px-[12px] py-[8px] text-[14px] leading-[21px]">
                      {m.text}
                    </div>
                  ) : (
                    <div key={i} className="prose-sm max-w-none text-[14px] leading-[22px] text-[var(--om-text-1)] [&_a]:text-[var(--om-text-accent,#4a9eff)] [&_p]:my-[6px] [&_pre]:overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    </div>
                  ),
                )}
              </div>
            </>
          ) : (
            <div className="m-auto text-[13px] text-[var(--om-text-3)]">That conversation isn&apos;t on your computer any more.</div>
          )}
        </div>
      </div>
      {dialog ? <ChannelDialog channel={dialog} onClose={() => setDialog(null)} /> : null}
    </PageShell>
  );
}
