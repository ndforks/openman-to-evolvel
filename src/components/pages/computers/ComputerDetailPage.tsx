"use client";

/**
 * One cloud computer: its live screen, a terminal, live CPU / memory / storage with a short history kept in
 * this tab, size, daily backups with restore, SSH (Linux), rename, restart and delete.
 * The computer that runs the agent is shown read-only: screen (view only), readings and backups.
 */
import "@/components/task/task-view.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { VncViewer } from "@/components/computer/vnc-viewer";
import { ModalShell } from "@/components/modals/ModalShell";
import type { ComputerView } from "@/lib/agent/types";
import type { CloudComputer } from "@/lib/orgo/types";
import { cx } from "../cx";
import { PageShell } from "../ui";
import { describeComputer, osLabel, useComputers, useComputersStore } from "./useComputers";
import { WebTerminal } from "./WebTerminal";

/* ---------- shared bits ---------- */

const CARD = "rounded-[14px] border border-[var(--om-border)] bg-[#222222]";
const BTN =
  "flex h-[29px] shrink-0 cursor-pointer items-center justify-center gap-[6px] rounded-[8px] border border-[var(--om-border-strong)] px-[10px] text-[13px] font-medium leading-[18px] text-[var(--om-text-1)] outline-none transition-colors enabled:hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_DANGER = cx(BTN, "text-[var(--om-danger)] enabled:hover:bg-[var(--om-danger-soft)]");
const BTN_PRIMARY =
  "flex h-[29px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-[var(--om-btn-primary)] px-[12px] text-[13px] font-medium leading-[18px] text-[var(--om-text-inverse)] outline-none transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error?.trim() || `${fallback} (the server answered ${res.status}).`;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col pb-[22px]">
      <div className="flex min-h-[29px] items-center justify-between gap-[12px] pb-[10px]">
        <h2 className="text-[15px] font-medium leading-[22px] text-[var(--om-text-1)]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return <p role={tone === "error" ? "alert" : "status"} className={cx("text-[13px] leading-[18px]", tone === "error" ? "text-[var(--om-danger)]" : "text-[var(--om-text-3)]")}>{children}</p>;
}

const GB = 1024 ** 3;
const fmtGb = (bytes: number | null) => (bytes === null ? "–" : bytes >= 100 * GB ? `${Math.round(bytes / GB)} GB` : `${(bytes / GB).toFixed(1)} GB`);

/* ---------- screen ---------- */

function Screen({ computer }: { computer: CloudComputer }) {
  const [view, setView] = useState<ComputerView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = computer.status === "running";

  useEffect(() => {
    if (!running) return;
    let alive = true;
    fetch(`/api/computers/${computer.id}/view`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (ComputerView & { error?: string }) | null;
        if (!alive) return;
        if (!res.ok || !data) setFailure(data?.error ?? `The screen could not be opened (the server answered ${res.status}).`);
        else setView(data);
      })
      .catch(() => alive && setFailure("The request could not be sent."));
    return () => {
      alive = false;
    };
  }, [computer.id, running]);

  return (
    <Section title="Screen" aside={view?.vncUrl ? <span className="text-[13px] text-[var(--om-text-3)]">{view.viewOnly ? "View only" : "Live: click to control"}</span> : null}>
      <div className="relative w-full overflow-hidden rounded-[14px] border border-[var(--om-border)] bg-black" style={{ aspectRatio: view ? `${view.width} / ${view.height}` : "16 / 9" }}>
        {running && view?.vncUrl ? (
          <VncViewer url={view.vncUrl} interactive={!view.viewOnly} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-[24px] text-center text-[13px] text-[var(--om-text-3)]">
            {!running ? `${computer.name} is ${computer.statusLabel.toLowerCase()}.` : (failure ?? "Opening the screen...")}
          </div>
        )}
      </div>
    </Section>
  );
}

/* ---------- metrics with a client-side history ---------- */

interface Reading {
  at: string;
  cpuPct: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
}

const HISTORY_MAX = 360; // 30 minutes at one reading every 5 seconds
const POLL_MS = 5000;

function loadHistory(id: string): Reading[] {
  try {
    const raw = sessionStorage.getItem(`om-metrics-${id}`);
    const list = raw ? (JSON.parse(raw) as Reading[]) : [];
    const cutoff = Date.now() - HISTORY_MAX * POLL_MS;
    return Array.isArray(list) ? list.filter((r) => Date.parse(r.at) > cutoff) : [];
  } catch {
    return [];
  }
}

function saveHistory(id: string, list: Reading[]) {
  try {
    sessionStorage.setItem(`om-metrics-${id}`, JSON.stringify(list.slice(-HISTORY_MAX)));
  } catch {
    // storage full or blocked: the history just stays in memory
  }
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-[36px]" />;
  const w = 220;
  const h = 36;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (Math.max(0, Math.min(100, v)) / 100) * (h - 2) - 1).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[36px] w-full" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tile({ label, value, detail, series, color }: { label: string; value: string; detail: string; series: number[]; color: string }) {
  return (
    <div className={cx(CARD, "flex min-w-0 flex-col gap-[4px] p-[14px]")}>
      <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{label}</span>
      <span className="text-[22px] font-medium leading-[28px] text-[var(--om-text-1)] tabular-nums">{value}</span>
      <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-2)]">{detail}</span>
      <Sparkline values={series} color={color} />
    </div>
  );
}

function Metrics({ computer }: { computer: CloudComputer }) {
  const [history, setHistory] = useState<Reading[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const running = computer.status === "running";

  useEffect(() => {
    const t = setTimeout(() => setHistory(loadHistory(computer.id)), 0);
    return () => clearTimeout(t);
  }, [computer.id]);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/computers/${computer.id}/metrics`, { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) return setFailure(await readError(res, "No reading"));
        const r = (await res.json()) as Reading;
        setFailure(null);
        setHistory((prev) => {
          const next = [...prev, r].slice(-HISTORY_MAX);
          saveHistory(computer.id, next);
          return next;
        });
      } catch {
        if (alive) setFailure("The reading could not be fetched.");
      }
    };
    void read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [computer.id, running]);

  const last = history[history.length - 1];
  const pct = (used: number | null, total: number | null) => (used !== null && total ? (used / total) * 100 : null);
  const cpu = history.map((r) => r.cpuPct ?? 0);
  const mem = history.map((r) => pct(r.memUsedBytes, r.memTotalBytes) ?? 0);
  const disk = history.map((r) => pct(r.diskUsedBytes, r.diskTotalBytes) ?? 0);
  const memPct = last ? pct(last.memUsedBytes, last.memTotalBytes) : null;
  const diskPct = last ? pct(last.diskUsedBytes, last.diskTotalBytes) : null;
  const span = history.length > 1 ? Math.round((Date.parse(history[history.length - 1].at) - Date.parse(history[0].at)) / 60_000) : 0;

  return (
    <Section title="Monitoring" aside={<span className="text-[13px] text-[var(--om-text-3)]">{running ? `Live, every 5 s${span ? ` · last ${span} min` : ""}` : "Not running"}</span>}>
      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
        <Tile label="CPU" value={last?.cpuPct != null ? `${Math.round(last.cpuPct)}%` : "–"} detail={`${computer.specs.vcpu} vCPU`} series={cpu} color="#4C9BF5" />
        <Tile label="Memory" value={memPct !== null ? `${Math.round(memPct)}%` : "–"} detail={last ? `${fmtGb(last.memUsedBytes)} of ${fmtGb(last.memTotalBytes)}` : `${computer.specs.memoryGb} GB`} series={mem} color="#B07CF0" />
        <Tile label="Storage" value={diskPct !== null ? `${Math.round(diskPct)}%` : "–"} detail={last ? `${fmtGb(last.diskUsedBytes)} of ${fmtGb(last.diskTotalBytes)}` : computer.specs.storageGb ? `${computer.specs.storageGb} GB` : ""} series={disk} color="#3FB68B" />
      </div>
      {failure ? <div className="pt-[8px]"><Note tone="error">{failure}</Note></div> : null}
    </Section>
  );
}

/* ---------- size ---------- */

interface ResizeOption {
  id: string;
  name: string;
  vcpu: number;
  memoryGb: number;
  monthlyUsd: number;
  current: boolean;
}

function Size({ computer }: { computer: CloudComputer }) {
  const [options, setOptions] = useState<ResizeOption[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "muted" | "error" } | null>(null);
  const upsert = useComputersStore((s) => s.upsert);

  const load = useCallback(async () => {
    const res = await fetch(`/api/computers/${computer.id}/resize`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setReason(res ? await readError(res, "Sizes could not be loaded") : "Sizes could not be loaded.");
    const data = (await res.json()) as { supported: boolean; reason?: string; options: ResizeOption[] };
    if (!data.supported) setReason(data.reason ?? "This computer can't be resized.");
    setOptions(data.options);
  }, [computer.id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, computer.specs.memoryGb, computer.specs.vcpu]);

  const apply = async () => {
    if (!picked) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/computers/${computer.id}/resize`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: picked }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNote({ text: res ? await readError(res, "The computer could not be resized") : "The request could not be sent.", tone: "error" });
    const data = (await res.json()) as { computer?: CloudComputer };
    if (data.computer) upsert(data.computer);
    setPicked(null);
    setNote({ text: "Resized. Memory and disk changes on Windows take effect after a restart.", tone: "muted" });
    void load();
  };

  if (reason && !options?.length) return <Section title="Size"><Note>{reason}</Note></Section>;
  return (
    <Section title="Size" aside={<button type="button" className={BTN_PRIMARY} disabled={!picked || busy || computer.status !== "running"} onClick={() => void apply()}>{busy ? "Resizing..." : "Apply"}</button>}>
      <div role="radiogroup" aria-label="Computer size" className="grid grid-cols-1 gap-[10px] sm:grid-cols-3">
        {(options ?? []).map((o) => {
          const selected = picked ? picked === o.id : o.current;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.current}
              onClick={() => setPicked(o.id)}
              className={cx(CARD, "flex cursor-pointer flex-col gap-[2px] p-[12px] text-left outline-none transition-colors disabled:cursor-default", selected ? "border-[var(--om-border-focus)]" : "hover:border-[var(--om-border-strong)]")}
            >
              <span className="flex items-center justify-between text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">
                {o.name}
                {o.current ? <span className="text-[12px] font-normal text-[var(--om-text-3)]">Current</span> : null}
              </span>
              <span className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{o.vcpu} vCPU · {o.memoryGb} GB RAM</span>
              <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">${o.monthlyUsd}/mo</span>
            </button>
          );
        })}
      </div>
      <div className="pt-[8px]">
        {note ? <Note tone={note.tone}>{note.text}</Note> : computer.status !== "running" ? <Note>Start the computer to resize it.</Note> : <Note>CPU changes apply live; on Linux, memory too.</Note>}
      </div>
    </Section>
  );
}

/* ---------- backups ---------- */

interface Backup {
  id: string;
  createdAt: string;
  status: string;
  sizeBytes: number | null;
  expiresAt: string | null;
  restorable: boolean;
}

function Backups({ computer }: { computer: CloudComputer }) {
  const router = useRouter();
  const [data, setData] = useState<{ backups: Backup[]; retention: string | null; restoreInPlace: boolean; supported: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ backup: Backup; mode: "as_new" | "in_place" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/computers/${computer.id}/backups`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) setFailure(await readError(res, "Backups could not be loaded"));
        else setData(await res.json());
      })
      .catch(() => alive && setFailure("Backups could not be loaded."));
    return () => {
      alive = false;
    };
  }, [computer.id]);

  const restore = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await fetch(`/api/computers/${computer.id}/backups/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backupId: confirm.backup.id, mode: confirm.mode }) }).catch(() => null);
    setBusy(false);
    const mode = confirm.mode;
    setConfirm(null);
    if (!res?.ok) return setNote(res ? await readError(res, "The backup could not be restored") : "The request could not be sent.");
    const out = (await res.json()) as { computerId?: string };
    if (mode === "as_new" && out.computerId) router.push(`/app/computers/${out.computerId}`);
    else setNote(mode === "as_new" ? "Restoring to a new computer. It appears in your list when ready." : "Restoring in place. The computer comes back with the backup's disk.");
  };

  if (failure) return <Section title="Backups"><Note tone="error">{failure}</Note></Section>;
  if (data && !data.supported) return <Section title="Backups"><Note>Orgo makes daily backups of Linux and Windows computers.</Note></Section>;
  return (
    <Section title="Backups">
      {!data ? (
        <div className={cx(CARD, "h-[52px] animate-pulse")} />
      ) : data.backups.length === 0 ? (
        <div className={cx(CARD, "px-[16px] py-[14px] text-[13px] leading-[18px] text-[var(--om-text-2)]")}>No backups yet. Orgo backs up this computer once a day.</div>
      ) : (
        <ul className={cx(CARD, "flex flex-col overflow-hidden")}>
          {data.backups.map((b, i) => (
            <li key={b.id} className={cx("flex items-center gap-[12px] px-[16px] py-[10px]", i > 0 && "border-t border-[var(--om-border)]")}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] leading-[20px] text-[var(--om-text-1)]">{b.createdAt ? new Date(b.createdAt).toLocaleString() : b.id}</span>
                <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">
                  {b.status}
                  {b.sizeBytes !== null ? ` · ${fmtGb(b.sizeBytes)}` : ""}
                  {b.expiresAt ? ` · kept until ${new Date(b.expiresAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              {!computer.protected ? (
                <>
                  <button type="button" className={BTN} disabled={!b.restorable || busy} onClick={() => setConfirm({ backup: b, mode: "as_new" })}>
                    Restore as new
                  </button>
                  <button type="button" className={BTN} disabled={!b.restorable || busy || !data.restoreInPlace} title={data.restoreInPlace ? undefined : "Stop the computer to restore in place."} onClick={() => setConfirm({ backup: b, mode: "in_place" })}>
                    Restore here
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="pt-[8px]">{note ? <Note>{note}</Note> : data?.retention ? <Note>{data.retention}</Note> : null}</div>
      {confirm ? (
        <Confirm
          title={confirm.mode === "as_new" ? "Restore to a new computer?" : `Restore ${computer.name} in place?`}
          body={confirm.mode === "as_new" ? "Orgo makes a new computer from this backup. This computer is not changed. The new one counts against your plan like any computer." : "This computer's disk is replaced by the backup. Everything written since is lost."}
          action={confirm.mode === "as_new" ? "Restore" : "Replace disk"}
          danger={confirm.mode === "in_place"}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void restore()}
        />
      ) : null}
    </Section>
  );
}

/* ---------- SSH ---------- */

interface Ssh {
  supported: boolean;
  enabled: boolean;
  command: string | null;
  keySet: boolean;
  pendingRestart: boolean;
}

function SshSection({ computer }: { computer: CloudComputer }) {
  const [ssh, setSsh] = useState<Ssh | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "muted" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/computers/${computer.id}/ssh`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Ssh | null) => setSsh(data))
      .catch(() => setSsh(null));
  }, [computer.id]);

  if (!ssh?.supported) return null;

  const save = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/computers/${computer.id}/ssh`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ publicKey: key }) : undefined }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNote({ text: res ? await readError(res, "SSH could not be changed") : "The request could not be sent.", tone: "error" });
    const next = (await res.json()) as Ssh;
    setSsh(next);
    setKey("");
    setNote({ text: method === "DELETE" ? "SSH is off." : next.command ? "Key saved." : "Key saved. Restart the computer to apply it; the command appears here then.", tone: "muted" });
  };

  return (
    <Section title="SSH" aside={ssh.enabled ? <button type="button" className={BTN} disabled={busy} onClick={() => void save("DELETE")}>Turn off</button> : null}>
      {ssh.enabled && ssh.command ? (
        <div className={cx(CARD, "flex items-center gap-[10px] px-[14px] py-[10px]")}>
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--om-text-1)]">{ssh.command}</code>
          <button
            type="button"
            className={BTN}
            onClick={() => {
              void navigator.clipboard?.writeText(ssh.command ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          <textarea
            value={key}
            onChange={(e) => setKey(e.target.value)}
            rows={2}
            placeholder="Paste your public key (ssh-ed25519 AAAA... you@laptop)"
            aria-label="SSH public key"
            className={cx(CARD, "w-full resize-none px-[12px] py-[9px] font-mono text-[13px] leading-[18px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-3)] focus:border-[var(--om-border-focus)]")}
          />
          <div className="flex items-center justify-between gap-[12px]">
            <Note>{ssh.pendingRestart ? "A key is set. Restart the computer to apply it." : "SSH turns on with your key; Orgo applies it at the next restart."}</Note>
            <button type="button" className={BTN_PRIMARY} disabled={busy || key.trim().length < 20} onClick={() => void save("POST")}>
              Turn on SSH
            </button>
          </div>
        </div>
      )}
      {note ? <div className="pt-[8px]"><Note tone={note.tone}>{note.text}</Note></div> : null}
    </Section>
  );
}

/* ---------- dialogs ---------- */

function Confirm({ title, body, action, danger, busy, onCancel, onConfirm, children }: { title: string; body: string; action: string; danger?: boolean; busy?: boolean; onCancel: () => void; onConfirm: () => void; children?: ReactNode }) {
  return (
    <ModalShell title={title} onClose={onCancel} closeButton={false} className="flex w-[440px] max-w-[calc(100vw-32px)] flex-col rounded-[20px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
      <div className="text-[18px] font-semibold leading-[26px] text-[var(--om-text-1)]">{title}</div>
      <p className="pt-[8px] text-[14px] leading-[20px] text-[var(--om-text-2)]">{body}</p>
      {children}
      <div className="flex justify-end gap-[9px] pt-[22px]">
        <button type="button" onClick={onCancel} className={cx(BTN, "h-[36px] px-[14px] text-[14px]")}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={cx("flex h-[36px] cursor-pointer items-center rounded-[10px] px-[14px] text-[14px] font-medium outline-none transition-opacity enabled:hover:opacity-90 disabled:opacity-50", danger ? "bg-[var(--om-danger)] text-white" : "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]")}
        >
          {action}
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------- page ---------- */

function NameEditor({ computer }: { computer: CloudComputer }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(computer.name);
  const [failure, setFailure] = useState<string | null>(null);
  const upsert = useComputersStore((s) => s.upsert);

  const save = async () => {
    const next = name.trim();
    if (!next || next === computer.name) return setEditing(false);
    const res = await fetch(`/api/computers/${computer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }).catch(() => null);
    if (!res?.ok) return setFailure(res ? await readError(res, "Couldn't rename") : "The request could not be sent.");
    const data = (await res.json()) as { computer: CloudComputer };
    upsert(data.computer);
    setFailure(null);
    setEditing(false);
  };

  if (!editing)
    return (
      <div className="flex min-w-0 items-center gap-[8px]">
        <h1 className="truncate text-[22px] font-semibold leading-[30px] text-[var(--om-text-1)]">{computer.name}</h1>
        {!computer.protected ? (
          <button type="button" aria-label="Rename" title="Rename" onClick={() => { setName(computer.name); setEditing(true); }} className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill-subtle)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        ) : null}
      </div>
    );
  return (
    <form className="flex items-center gap-[8px]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Computer name" className="h-[34px] w-[320px] max-w-full rounded-[9px] border border-[var(--om-border-focus)] bg-transparent px-[10px] text-[16px] text-[var(--om-text-1)] outline-none" />
      <button type="submit" className={BTN_PRIMARY}>Save</button>
      <button type="button" className={BTN} onClick={() => setEditing(false)}>Cancel</button>
      {failure ? <Note tone="error">{failure}</Note> : null}
    </form>
  );
}

export function ComputerDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { computers, loaded, notice } = useComputers();
  const busy = useComputersStore((s) => s.busy[id]);
  const restart = useComputersStore((s) => s.restart);
  const remove = useComputersStore((s) => s.remove);
  const [confirm, setConfirm] = useState<"restart" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const computer = useMemo(() => computers.find((c) => c.id === id), [computers, id]);

  const act = async (action: "restart" | "delete") => {
    setConfirm(null);
    setFailure(null);
    const out = await (action === "delete" ? remove(id) : restart(id));
    if (out) setFailure(out);
    else if (action === "delete") router.push("/app/computers");
  };

  const back = (
    <Link href="/app/computers" className="flex items-center gap-[4px] text-[13px] text-[var(--om-text-3)] hover:text-[var(--om-text-2)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
      Computers
    </Link>
  );

  if (!computer)
    return (
      <PageShell title={back}>
        <div className="flex w-full flex-col pt-[24px]">
          {!loaded ? <div className={cx(CARD, "h-[120px] animate-pulse")} /> : <Note tone={notice ? "error" : "muted"}>{notice ?? "This computer doesn't exist in your workspace any more."}</Note>}
        </div>
      </PageShell>
    );

  const locked = computer.protected;
  const running = computer.status === "running";
  return (
    <PageShell title={back}>
      <div className="flex w-full flex-col pb-[40px]">
        <div className="flex flex-wrap items-start justify-between gap-[12px] pb-[20px] pt-[4px]">
          <div className="flex min-w-0 flex-col gap-[4px]">
            <NameEditor computer={computer} />
            <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
              {busy === "restart" ? "Restarting" : busy === "delete" ? "Deleting" : computer.statusLabel} · {describeComputer(computer)}
            </span>
            {locked ? <Note>This computer runs the agent for every task, so it is shown read-only.</Note> : null}
          </div>
          {!locked ? (
            <div className="flex items-center gap-[8px]">
              <button type="button" className={BTN} disabled={!!busy || !running} onClick={() => setConfirm("restart")}>
                Restart
              </button>
              <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => { setTyped(""); setConfirm("delete"); }}>
                Delete
              </button>
            </div>
          ) : null}
        </div>
        {failure ? <div className="pb-[14px]"><Note tone="error">{failure}</Note></div> : null}

        <Screen computer={computer} />
        {!locked ? (
          <Section title="Terminal" aside={<span className="text-[13px] text-[var(--om-text-3)]">{computer.os === "windows" ? "PowerShell" : "bash"} · {osLabel(computer.os)}</span>}>
            {running ? <WebTerminal computerId={computer.id} className="h-[340px]" /> : <Note>Start the computer to open a terminal.</Note>}
          </Section>
        ) : null}
        <SshSection computer={computer} />
        <Metrics computer={computer} />
        {!locked ? <Size computer={computer} /> : null}
        <Backups computer={computer} />
      </div>

      {confirm === "restart" ? (
        <Confirm title={`Restart ${computer.name}?`} body="The computer reboots in place. Its files are kept; anything running on it stops and open sessions disconnect." action="Restart" onCancel={() => setConfirm(null)} onConfirm={() => void act("restart")} />
      ) : null}
      {confirm === "delete" ? (
        <Confirm
          title={`Delete ${computer.name}?`}
          body="This deletes the computer on Orgo with everything on it: files, installed software and settings. It can't be undone."
          action="Delete computer"
          danger
          busy={typed.trim() !== computer.name}
          onCancel={() => setConfirm(null)}
          onConfirm={() => typed.trim() === computer.name && void act("delete")}
        >
          <label className="flex flex-col gap-[6px] pt-[14px] text-[13px] text-[var(--om-text-2)]">
            Type {computer.name} to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the computer name to confirm" className="h-[34px] rounded-[9px] border border-[var(--om-border-strong)] bg-transparent px-[10px] text-[14px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]" />
          </label>
        </Confirm>
      ) : null}
    </PageShell>
  );
}
