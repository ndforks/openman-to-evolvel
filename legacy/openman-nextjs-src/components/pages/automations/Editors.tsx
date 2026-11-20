// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** The three automation editors (Schedule, Triggered task, Advanced automation), for create and edit. */
import { ArrowUp, Check, Clock, Copy, Info, Plus, Rss, Trash2, Webhook, X, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { brand } from "@/config/brand";
import type { AutomationInput, AutomationView, AutomationsMeta, Condition, RepeatRule, TriggerInput } from "@/lib/automations/types";
import { describeRule } from "@/lib/automations/types";
import { cx } from "../cx";
import { AUTOMATIONS_HREF } from "../routes";
import { automationsApi, localTimeZone } from "./api";
import { RuleRow, SettingsMenu, type RunSettings } from "./controls";
import { TriggerIcon } from "./icons";

export const CARD = "flex w-[698px] max-w-full flex-col rounded-[22px] border border-[var(--om-border-strong)] bg-[var(--om-surface)]";
const BOX = "rounded-[12px] border border-[var(--om-border)]";
const INPUT =
  "h-[32px] min-w-0 rounded-[8px] border border-[var(--om-border)] bg-transparent px-[10px] text-[13px] leading-[18px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]";

type Kind = "schedule" | "trigger" | "advanced";

export function defaultSettings(initial?: AutomationView | null): RunSettings {
  return {
    runIn: initial?.runIn ?? "new",
    mode: initial?.mode ?? "standard",
    projectId: initial?.projectId ?? null,
    connectors: initial?.connectors ?? [],
    timezone: initial?.timezone ?? localTimeZone(),
    endsAt: initial?.endsAt ?? null,
  };
}

function useMeta(): AutomationsMeta | null {
  const [meta, setMeta] = useState<AutomationsMeta | null>(null);
  useEffect(() => {
    automationsApi
      .list()
      .then((r) => setMeta(r.meta))
      .catch(() => undefined);
  }, []);
  return meta;
}

function Header({ title, badge, onClose }: { title: string; badge?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-[6px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">
        {title}
        {badge ? <span className="h-[18px] rounded-[4px] bg-[var(--om-fill)] px-[5px] text-[12px] font-normal leading-[18px] text-[var(--om-text-3)]">{badge}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="-m-[5px] flex cursor-pointer rounded-[7px] p-[5px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)]"
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function Instruction({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <>
      <div className="pt-[4px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{brand.agentNoun} will</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${brand.agentNoun} will`}
        placeholder={placeholder ?? `The work to do each time, e.g. check our three competitors’ pricing pages and list anything that moved`}
        className={cx(BOX, "field-sizing-content min-h-[84px] max-h-[260px] w-full resize-none bg-transparent px-[13px] py-[11px] text-[14px] leading-[22px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]")}
      />
    </>
  );
}

function Footer({ settings, onSettings, onSubmit, canSubmit, busy, label }: { settings: RunSettings; onSettings: (s: RunSettings) => void; onSubmit: () => void; canSubmit: boolean; busy: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between pt-[2px]">
      <SettingsMenu value={settings} onChange={onSettings} />
      <button
        type="button"
        disabled={!canSubmit || busy}
        onClick={onSubmit}
        className={cx(
          "h-[32px] rounded-full px-[14px] text-[14px] font-medium leading-[20px] outline-none transition-colors",
          canSubmit && !busy ? "cursor-pointer bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90" : "bg-[#3A3A3A] text-[#9A9A9A]",
        )}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[13px] leading-[18px] text-[var(--om-danger)]">
      {error}
    </p>
  ) : null;
}

function inputFrom(kind: Kind, name: string | undefined, prompt: string, repeat: RepeatRule | null, triggers: TriggerInput[], s: RunSettings, enabled = true): Partial<AutomationInput> {
  return { kind, name, prompt, repeat, triggers, timezone: s.timezone, endsAt: s.endsAt, mode: s.mode, runIn: s.runIn, projectId: s.projectId, connectors: s.connectors, enabled };
}

function useSave(initial?: AutomationView | null) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (input: Partial<AutomationInput>) => {
    setBusy(true);
    setError(null);
    try {
      if (initial) await automationsApi.update(initial.id, { ...input, enabled: initial.enabled });
      else await automationsApi.create(input);
      router.push(`${AUTOMATIONS_HREF}?tab=manage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the automation.");
      setBusy(false);
    }
  };
  return { busy, error, save };
}

// ------------------------------------------------------------------ Schedule

export function ScheduleEditor({ initial, onClose, seedPrompt }: { initial?: AutomationView | null; onClose: () => void; seedPrompt?: string }) {
  const meta = useMeta();
  const [settings, setSettings] = useState<RunSettings>(() => defaultSettings(initial));
  const [rule, setRule] = useState<RepeatRule>(initial?.repeat ?? { freq: "daily", time: "10:00" });
  const [prompt, setPrompt] = useState(initial?.prompt ?? seedPrompt ?? "");
  const { busy, error, save } = useSave(initial);
  return (
    <div className={cx(CARD, "gap-[12px] px-[20px] pb-[14px] pt-[18px]")}>
      <Header title="When" onClose={onClose} />
      <RuleRow rule={rule} onChange={setRule} timezone={settings.timezone} minInterval={meta?.minIntervalMinutes} />
      <Instruction value={prompt} onChange={setPrompt} />
      <ErrorLine error={error} />
      <Footer
        settings={settings}
        onSettings={setSettings}
        canSubmit={prompt.trim().length > 0}
        busy={busy}
        label={initial ? "Save" : "Create"}
        onSubmit={() => void save(inputFrom("schedule", initial?.name, prompt.trim(), rule, [], settings))}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Triggered task

type TriggerDraft = TriggerInput & { key: string; url?: string; address?: string; hasAuthValue?: boolean };

const SOURCES: { type: TriggerInput["type"]; label: string; icon: ReactNode; needs?: keyof AutomationsMeta }[] = [
  { type: "webhook", label: "Webhook", icon: <Webhook size={18} strokeWidth={1.7} className="text-[#E5487D]" /> },
  { type: "rss", label: "RSS", icon: <Rss size={18} strokeWidth={1.8} className="text-[var(--om-icon-1)]" /> },
  { type: "email", label: "Mail " + brand.name, icon: <Mail size={18} strokeWidth={1.7} className="text-[var(--om-icon-1)]" />, needs: "emailTriggers" },
  { type: "timer", label: "Timer", icon: <Clock size={18} strokeWidth={1.8} className="text-[var(--om-icon-1)]" /> },
];

let keySeq = 0;
const newKey = () => `t${++keySeq}`;

function draftFor(type: TriggerInput["type"]): TriggerDraft {
  const key = newKey();
  if (type === "webhook") return { key, type, conditions: [] };
  if (type === "rss") return { key, type, url: "", conditions: [] };
  if (type === "email") return { key, type, senders: [], conditions: [] };
  return { key, type: "timer", rule: { freq: "daily", time: "09:00" } };
}

function draftsFrom(a?: AutomationView | null): TriggerDraft[] {
  if (!a) return [];
  return a.triggers.map((t) => {
    const key = newKey();
    if (t.type === "webhook") return { key, id: t.id, type: "webhook", url: t.url, authHeaderName: t.authHeaderName, hasAuthValue: t.hasAuthValue, conditions: t.conditions };
    if (t.type === "rss") return { key, id: t.id, type: "rss", url: t.url, conditions: t.conditions };
    if (t.type === "email") return { key, id: t.id, type: "email", address: t.address, senders: t.senders, conditions: t.conditions };
    return { key, id: t.id, type: "timer", rule: t.rule };
  });
}

function toInput(d: TriggerDraft): TriggerInput {
  if (d.type === "webhook") return { id: d.id, type: "webhook", authHeaderName: d.authHeaderName || undefined, ...(d.authHeaderValue !== undefined ? { authHeaderValue: d.authHeaderValue } : {}), conditions: d.conditions };
  if (d.type === "rss") return { id: d.id, type: "rss", url: d.url.trim(), conditions: d.conditions };
  if (d.type === "email") return { id: d.id, type: "email", senders: d.senders, conditions: d.conditions };
  return { id: d.id, type: "timer", rule: d.rule };
}

const OPS: { id: Condition["op"]; label: string }[] = [
  { id: "equals", label: "is" },
  { id: "not_equals", label: "is not" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "does not contain" },
  { id: "starts_with", label: "starts with" },
  { id: "exists", label: "is present" },
  { id: "greater_than", label: ">" },
  { id: "less_than", label: "<" },
];

function Conditions({ value, onChange, hint }: { value: Condition[]; onChange: (c: Condition[]) => void; hint: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-[6px]">
          <span className="w-[44px] shrink-0 text-[12px] text-[var(--om-text-3)]">{i === 0 ? "Only if" : "and"}</span>
          <input aria-label="Field" value={c.field} placeholder={hint} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className={cx(INPUT, "w-[150px]")} />
          <select
            aria-label="Operator"
            value={c.op}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"] } : x)))}
            className={cx(INPUT, "w-[132px] cursor-pointer bg-[var(--om-surface)] [color-scheme:dark]")}
          >
            {OPS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {c.op !== "exists" ? <input aria-label="Value" value={c.value} placeholder="value" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={cx(INPUT, "flex-1")} /> : <span className="flex-1" />}
          <button type="button" aria-label="Remove condition" onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[7px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ))}
      {value.length < 10 ? (
        <button type="button" onClick={() => onChange([...value, { field: "", op: "equals", value: "" }])} className="flex w-fit cursor-pointer items-center gap-[4px] rounded-[7px] px-[6px] py-[3px] text-[13px] text-[var(--om-text-2)] hover:bg-[var(--om-fill)]">
          <Plus size={13} strokeWidth={2} aria-hidden /> Add condition
        </button>
      ) : null}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-[6px]">
      <code className={cx(INPUT, "flex flex-1 items-center truncate font-mono text-[12px]")}>{value}</code>
      <button
        type="button"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-border)] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]"
      >
        {copied ? <Check size={14} strokeWidth={2} aria-hidden /> : <Copy size={14} strokeWidth={1.8} aria-hidden />}
      </button>
    </div>
  );
}

function TriggerCard({ draft, onChange, onRemove, timezone, minInterval }: { draft: TriggerDraft; onChange: (d: TriggerDraft) => void; onRemove: () => void; timezone: string; minInterval?: number }) {
  const source = SOURCES.find((s) => s.type === draft.type)!;
  return (
    <div className={cx(BOX, "flex flex-col gap-[10px] px-[14px] py-[12px]")}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-[8px] text-[14px] font-medium leading-[20px]">
          {source.icon}
          {source.label}
        </span>
        <button type="button" aria-label={`Remove ${source.label} trigger`} onClick={onRemove} className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
          <Trash2 size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
      {draft.type === "timer" ? <RuleRow rule={draft.rule} onChange={(rule) => onChange({ ...draft, rule })} timezone={timezone} minInterval={minInterval} allowInterval /> : null}
      {draft.type === "rss" ? (
        <>
          <input aria-label="Feed URL" value={draft.url} placeholder="https://example.com/feed.xml" onChange={(e) => onChange({ ...draft, url: e.target.value })} className={cx(INPUT, "w-full")} />
          <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">Checked every 5 minutes. Each run gets the new items. Fields: title, link, summary, author, categories.</span>
          <Conditions value={draft.conditions} onChange={(conditions) => onChange({ ...draft, conditions })} hint="title" />
        </>
      ) : null}
      {draft.type === "webhook" ? (
        <>
          {draft.url ? <CopyField value={draft.url} /> : <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">The webhook URL appears here after you create the automation. POST JSON to it.</span>}
          <div className="flex items-center gap-[6px]">
            <input aria-label="Auth header name" value={draft.authHeaderName ?? ""} placeholder="Auth header (optional), e.g. X-Api-Key" onChange={(e) => onChange({ ...draft, authHeaderName: e.target.value })} className={cx(INPUT, "w-[240px]")} />
            <input
              aria-label="Auth header value"
              type="password"
              value={draft.authHeaderValue ?? ""}
              placeholder={draft.hasAuthValue ? "•••••• (unchanged)" : "Header value"}
              onChange={(e) => onChange({ ...draft, authHeaderValue: e.target.value })}
              className={cx(INPUT, "flex-1")}
            />
          </div>
          {!draft.authHeaderName ? <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">Without an auth header, anyone with the webhook URL can trigger this automation.</span> : null}
          <Conditions value={draft.conditions} onChange={(conditions) => onChange({ ...draft, conditions })} hint="body field, e.g. status" />
        </>
      ) : null}
      {draft.type === "email" ? (
        <>
          {draft.address ? <CopyField value={draft.address} /> : <span className="text-[13px] text-[var(--om-text-3)]">A dedicated address appears here after you create the automation.</span>}
          <input
            aria-label="Approved senders"
            value={draft.senders.join(", ")}
            placeholder="Approved senders (optional): me@example.com, @company.com"
            onChange={(e) => onChange({ ...draft, senders: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            className={cx(INPUT, "w-full")}
          />
          <Conditions value={draft.conditions} onChange={(conditions) => onChange({ ...draft, conditions })} hint="subject" />
        </>
      ) : null}
    </div>
  );
}

export function TriggerEditor({ initial, kind = "trigger", onClose, preset, seedPrompt }: { initial?: AutomationView | null; kind?: "trigger" | "advanced"; onClose: () => void; preset?: { prompt: string; name?: string; repeat: RepeatRule | null; triggers: TriggerInput[] }; seedPrompt?: string }) {
  const meta = useMeta();
  const [settings, setSettings] = useState<RunSettings>(() => defaultSettings(initial));
  const [triggers, setTriggers] = useState<TriggerDraft[]>(() => (preset ? preset.triggers.map((t) => ({ ...t, key: newKey() }) as TriggerDraft) : draftsFrom(initial)));
  const [repeat] = useState<RepeatRule | null>(preset?.repeat ?? initial?.repeat ?? null);
  const [picking, setPicking] = useState(false);
  const [prompt, setPrompt] = useState(preset?.prompt ?? initial?.prompt ?? seedPrompt ?? "");
  const { busy, error, save } = useSave(initial);
  const sources = SOURCES.filter((s) => !s.needs || (meta && meta[s.needs])).filter((s) => s.type !== "webhook" || !triggers.some((t) => t.type === "webhook"));
  const allTriggers = [...(repeat ? [{ type: "timer" as const, rule: repeat }] : []), ...triggers.map(toInput)];
  const ready = prompt.trim().length > 0 && allTriggers.length > 0 && triggers.every((t) => t.type !== "rss" || /^https?:\/\/\S+/.test(t.url.trim()));

  return (
    <div className={cx(CARD, "gap-[12px] px-[20px] pb-[14px] pt-[18px]")}>
      <Header title="When this happens" onClose={onClose} />
      {triggers.map((t) => (
        <TriggerCard
          key={t.key}
          draft={t}
          timezone={settings.timezone}
          minInterval={meta?.minIntervalMinutes}
          onChange={(d) => setTriggers((all) => all.map((x) => (x.key === t.key ? d : x)))}
          onRemove={() => setTriggers((all) => all.filter((x) => x.key !== t.key))}
        />
      ))}
      {repeat ? <div className={cx(BOX, "px-[14px] py-[10px] text-[13px] text-[var(--om-text-2)]")}>{describeRule(repeat)}</div> : null}
      {allTriggers.length < 10 ? (
        <div className="flex flex-col gap-[0px]">
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking((p) => !p)}
            className={cx(BOX, "flex h-[44px] cursor-pointer items-center gap-[8px] px-[14px] text-[14px] leading-[20px] text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)]", picking && "rounded-b-none")}
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden /> Add Trigger
          </button>
          {picking ? (
            <div className={cx(BOX, "-mt-px grid grid-cols-4 gap-[10px] rounded-t-none p-[12px] max-md:grid-cols-2")}>
              {sources.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => {
                    setTriggers((all) => [...all, draftFor(s.type)]);
                    setPicking(false);
                  }}
                  className="flex h-[76px] cursor-pointer flex-col justify-between rounded-[10px] border border-[var(--om-border)] bg-[var(--om-fill-subtle)] px-[14px] py-[12px] text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:border-[var(--om-border-strong)] hover:bg-[var(--om-fill)]"
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <Instruction value={prompt} onChange={setPrompt} />
      <ErrorLine error={error} />
      <Footer
        settings={settings}
        onSettings={setSettings}
        canSubmit={ready}
        busy={busy}
        label={initial ? "Save" : "Create"}
        onSubmit={() => void save(inputFrom(kind, initial?.name ?? preset?.name, prompt.trim(), triggers.length === 0 ? repeat : null, triggers.length === 0 ? [] : allTriggers, settings))}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Advanced

export function AdvancedEditor({ onClose }: { onClose: () => void }) {
  const meta = useMeta();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; prompt: string; repeat: RepeatRule | null; triggers: TriggerInput[]; understood: string[] } | null>(null);
  const tz = localTimeZone();

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { draft } = await automationsApi.draft(text.trim(), tz);
      if (!draft.repeat && draft.triggers.length === 0) setError(`Say when ${brand.agentNoun} should run, e.g. "every weekday at 9am", "every 30 minutes", "when https://site.com/feed.xml posts" or "when the webhook is called".`);
      else setDraft({ ...draft, repeat: draft.repeat ?? null, triggers: draft.triggers ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that description.");
    } finally {
      setBusy(false);
    }
  };

  if (draft) {
    return (
      <div className="flex w-[698px] max-w-full flex-col gap-[10px]">
        <div className={cx(BOX, "flex flex-wrap items-center gap-[6px] bg-[var(--om-fill-subtle)] px-[14px] py-[10px] text-[13px] text-[var(--om-text-2)]")}>
          <TriggerIcon size={15} />
          Understood:
          {draft.understood.map((u) => (
            <span key={u} className="rounded-[6px] bg-[var(--om-fill)] px-[7px] py-[2px] text-[13px] text-[var(--om-text-1)]">
              {u}
            </span>
          ))}
          <button type="button" onClick={() => setDraft(null)} className="ml-auto cursor-pointer text-[13px] text-[var(--om-text-accent)] hover:underline">
            Rewrite
          </button>
        </div>
        {draft.triggers.length === 0 && draft.repeat ? <ScheduleFromDraft draft={draft} onClose={onClose} /> : <TriggerEditor kind="advanced" preset={draft} onClose={onClose} />}
      </div>
    );
  }

  return (
    <div className="flex w-[698px] max-w-full flex-col gap-[6px]">
      <div className={cx(CARD, "gap-[10px] px-[20px] pb-[12px] pt-[18px]")}>
        <Header title="Advanced automation" badge="Beta" onClose={onClose} />
        <textarea
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Describe the automation"
          placeholder={`For example: when a new post appears on our competitor’s blog, summarise it and email me`}
          className={cx(BOX, "field-sizing-content min-h-[84px] max-h-[260px] w-full resize-none bg-transparent px-[15px] py-[11px] text-[14px] leading-[22px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]")}
        />
        <p className="flex gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
          <Info size={14} strokeWidth={1.8} className="mt-[2px] shrink-0" aria-hidden />
          Each automation can run as often as every {meta?.minIntervalMinutes ?? 5} minutes{meta && meta.minIntervalMinutes > 5 ? " on your plan" : " (every 15 minutes on the Free plan)"}. Short intervals suit watching a page or feed for changes.
        </p>
        <div className="flex items-center justify-end">
          <button
            type="button"
            aria-label="Continue"
            disabled={!text.trim() || busy}
            onClick={() => void send()}
            className={cx("flex h-[32px] w-[32px] items-center justify-center rounded-full outline-none", text.trim() && !busy ? "cursor-pointer bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]" : "bg-[#383838] text-[#7A7A7A]")}
          >
            <ArrowUp size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function ScheduleFromDraft({ draft, onClose }: { draft: { name: string; prompt: string; repeat: RepeatRule | null }; onClose: () => void }) {
  const [settings, setSettings] = useState<RunSettings>(() => defaultSettings(null));
  const [rule, setRule] = useState<RepeatRule>(draft.repeat ?? { freq: "daily", time: "09:00" });
  const [prompt, setPrompt] = useState(draft.prompt);
  const { busy, error, save } = useSave(null);
  return (
    <div className={cx(CARD, "gap-[12px] px-[20px] pb-[14px] pt-[18px]")}>
      <Header title="When" onClose={onClose} />
      <RuleRow rule={rule} onChange={setRule} timezone={settings.timezone} allowInterval />
      <Instruction value={prompt} onChange={setPrompt} />
      <ErrorLine error={error} />
      <Footer settings={settings} onSettings={setSettings} canSubmit={prompt.trim().length > 0} busy={busy} label="Create" onSubmit={() => void save(inputFrom("advanced", draft.name, prompt.trim(), rule, [], settings))} />
    </div>
  );
}
