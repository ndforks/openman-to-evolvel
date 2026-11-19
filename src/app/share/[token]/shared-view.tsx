"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, FileText, Pause, Play, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import type { SharedItem } from "./shared";

interface Props {
  token: string;
  title: string;
  createdAt: string;
  items: SharedItem[];
  replay: boolean;
  brandName: string;
  logoMark: string;
}

/** Delay before showing item `i` in a replay: the real gap, squeezed to between 0.25 s and 1.5 s. */
function gap(items: SharedItem[], i: number, speed: number): number {
  if (i === 0) return 400 / speed;
  const real = Date.parse(items[i].at) - Date.parse(items[i - 1].at);
  const ms = Number.isFinite(real) ? Math.min(1500, Math.max(250, real)) : 600;
  return ms / speed;
}

export function SharedView({ token, title, createdAt, items, replay, brandName, logoMark }: Props) {
  const [shown, setShown] = useState(replay ? 0 : items.length);
  const [playing, setPlaying] = useState(replay);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing || shown >= items.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), gap(items, shown, speed));
    return () => clearTimeout(t);
  }, [playing, shown, items, speed]);

  useEffect(() => {
    if (replay && shown > 0) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [replay, shown]);

  const done = shown >= items.length;

  return (
    <div className="min-h-screen bg-[var(--om-bg)] text-[var(--om-text-1)]">
      <header className="sticky top-0 z-10 flex h-[56px] items-center gap-3 border-b border-[var(--om-border)] bg-[var(--om-bg)] px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoMark} alt={brandName} className="h-[24px] w-[24px]" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-medium leading-[20px]">{title}</h1>
          <p className="text-[12px] leading-[16px] text-[var(--om-text-3)]">
            Shared from {brandName} · {new Date(createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
          </p>
        </div>
        {replay ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (done ? (setShown(0), setPlaying(true)) : setPlaying((p) => !p))}
              className="flex h-[32px] items-center gap-1.5 rounded-[8px] border border-[var(--om-border)] px-3 text-[13px] hover:bg-[var(--om-fill)]"
            >
              {done ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
              {done ? "Replay" : playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))}
              className="h-[32px] rounded-[8px] border border-[var(--om-border)] px-2 text-[13px] tabular-nums hover:bg-[var(--om-fill)]"
            >
              {speed}x
            </button>
          </div>
        ) : (
          <a href={`/share/${token}?replay=1`} className="flex h-[32px] items-center gap-1.5 rounded-[8px] border border-[var(--om-border)] px-3 text-[13px] hover:bg-[var(--om-fill)]">
            <Play size={14} /> Replay
          </a>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[768px] flex-col gap-4 px-4 py-6">
        {items.slice(0, shown).map((item, i) => (
          <Item key={i} item={item} token={token} />
        ))}
        {items.length === 0 && <p className="text-center text-[14px] text-[var(--om-text-3)]">Nothing to show yet.</p>}
      </main>
    </div>
  );
}

function Item({ item, token }: { item: SharedItem; token: string }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-[12px] bg-[var(--om-fill-solid)] px-4 py-3 text-[15px] leading-[24px] shadow-sm dark:bg-[var(--om-fill)]">
            {item.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="prose-sm max-w-none text-[15px] leading-[24px] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--om-fill-sunken)] [&_code]:px-1 [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[8px] [&_pre]:bg-[var(--om-fill-sunken)] [&_pre]:p-3 [&_ul]:list-disc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
        </div>
      );
    case "tool":
      return (
        <div className="flex items-start gap-2 text-[13px] leading-[20px] text-[var(--om-text-2)]">
          {item.error ? <TriangleAlert size={14} className="mt-[3px] shrink-0 text-[var(--om-danger)]" /> : <Wrench size={14} className="mt-[3px] shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium">{item.tool}</span>
            {item.preview && <span className="ml-2 break-all text-[var(--om-text-3)]">{item.preview}</span>}
          </span>
        </div>
      );
    case "file":
      return (
        <a
          href={`/share/${token}/files/${encodeURIComponent(item.fileId)}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-3 rounded-[12px] border border-[var(--om-border)] px-3 py-2 text-[14px] hover:bg-[var(--om-fill)]"
        >
          <FileText size={18} className="shrink-0 text-[var(--om-text-2)]" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.name}</span>
            {item.size !== undefined && <span className="text-[12px] text-[var(--om-text-3)]">{item.size < 1024 ? `${item.size} B` : `${Math.round(item.size / 1024)} KB`}</span>}
          </span>
        </a>
      );
    case "plan":
      return (
        <ol className="rounded-[12px] border border-[var(--om-border)] px-4 py-3 text-[13px] leading-[20px]">
          {item.steps.map((s, i) => (
            <li key={i} className={s.status === "done" ? "text-[var(--om-text-3)]" : s.status === "active" ? "font-medium" : ""}>
              {s.title}
            </li>
          ))}
        </ol>
      );
    case "end":
      return (
        <div className="flex items-center gap-2 text-[13px] text-[var(--om-text-3)]">
          {item.status === "completed" ? <CheckCircle2 size={14} className="text-[var(--om-success)]" /> : <TriangleAlert size={14} />}
          {item.status === "completed" ? "Done" : item.status === "stopped" ? "Stopped" : `Hit an error${item.text ? `: ${item.text}` : ""}`}
        </div>
      );
  }
}
