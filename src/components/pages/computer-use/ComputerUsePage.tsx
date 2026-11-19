"use client";

/**
 * Computer Use: the agent operates desktop apps on its computer, and the user decides per app. The first time
 * a task uses an app the user is asked (Allow, Always allow, Never); "Always allow" and "Never" are kept here,
 * per user, and the relay honours them through Hermes's approval gate (`lib/agent/server/computer-use.ts`).
 * Stored in the settings document under `computerUse.apps`.
 */
import { useCallback, useEffect, useState } from "react";
import { brand } from "@/config/brand";
import { cx } from "../cx";
import { PageShell } from "../ui";

type Permission = "always" | "never";
interface Entry {
  name: string;
  permission: Permission;
  updatedAt: string;
}

const appKey = (name: string) => name.trim().toLowerCase().replace(/\.app$/, "").replace(/\s+/g, " ").slice(0, 80);

function readEntries(settings: unknown): Record<string, Entry> {
  const section = settings && typeof settings === "object" ? (settings as Record<string, unknown>).computerUse : undefined;
  const apps = section && typeof section === "object" ? (section as { apps?: unknown }).apps : undefined;
  const out: Record<string, Entry> = {};
  if (!apps || typeof apps !== "object") return out;
  for (const [key, value] of Object.entries(apps as Record<string, Partial<Entry> | null>)) {
    if (value && (value.permission === "always" || value.permission === "never")) out[key] = { name: value.name ?? key, permission: value.permission, updatedAt: value.updatedAt ?? "" };
  }
  return out;
}

const CHOICES: { value: Permission | "ask"; label: string }[] = [
  { value: "always", label: "Always allow" },
  { value: "ask", label: "Ask in each task" },
  { value: "never", label: "Never" },
];

function Art() {
  return (
    <div aria-hidden className="flex h-[49px] w-[88px] shrink-0 items-center justify-center rounded-[8px] bg-[#2E2E2E]">
      <div className="h-[28px] w-[44px] shrink-0 rounded-[3px] border-2 border-[#111111]" style={{ backgroundImage: "linear-gradient(in oklab 160deg, #9CC7EF 0%, #5D8FC4 100%)", backgroundOrigin: "border-box" }} />
    </div>
  );
}

export function ComputerUsePage() {
  const [entries, setEntries] = useState<Record<string, Entry> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPermission, setDraftPermission] = useState<Permission>("always");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setEntries(readEntries(((await res.json()) as { settings?: unknown }).settings));
    } catch {
      setFailure("Your app permissions could not be loaded.");
      setEntries({});
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (name: string, value: Permission | "ask") => {
    const key = appKey(name);
    if (!key) return;
    const entry: Entry | null = value === "ask" ? null : { name: name.trim(), permission: value, updatedAt: new Date().toISOString() };
    setEntries((current) => {
      const next = { ...(current ?? {}) };
      if (entry) next[key] = entry;
      else delete next[key];
      return next;
    });
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ computerUse: { apps: { [key]: entry } } }) });
      if (!res.ok) throw new Error(String(res.status));
      setFailure(null);
    } catch {
      setFailure("The change could not be saved. Try again.");
      void load();
    }
  };

  const list = Object.entries(entries ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <PageShell title="Computer Use">
      <div className="flex w-full flex-col pb-[32px] pt-[12px]">
        <div className="mb-[20px] flex flex-col gap-[4px]">
          <h2 className="text-[18px] font-medium leading-[28px] text-[var(--om-text-1)]">{brand.name} on its computer</h2>
          <p className="text-[14px] leading-[20px] text-[var(--om-text-2)]">
            {brand.agentNoun} can open and operate desktop apps on its cloud computer. You decide which apps, one at a time.
          </p>
        </div>

        <div className="flex flex-col rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)]">
          <div className="flex min-h-[112px] items-center justify-between gap-[12px] p-[16px]">
            <span className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <span className="text-[16px] font-medium leading-[24px] text-[var(--om-text-1)]">Computer Use</span>
              <span className="text-[13px] leading-[20px] text-[var(--om-text-2)]">
                The first time a task uses an app, you are asked: Allow (for that task), Always allow, or Never. Your answers for every task are kept below.
              </span>
            </span>
            <Art />
          </div>

          <div className="border-t border-[var(--om-border)] px-[16px] pb-[12px] pt-[14px]">
            <div className="pb-[8px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">App permissions</div>
            {entries === null ? (
              <div aria-busy="true" className="h-[40px] animate-pulse rounded-[10px] bg-[var(--om-fill)]" />
            ) : list.length === 0 ? (
              <p className="py-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">No decisions yet. Apps appear here once you choose Always allow or Never.</p>
            ) : (
              <ul className="flex flex-col">
                {list.map(([key, entry], index) => (
                  <li key={key} className={cx("flex items-center gap-[12px] py-[8px]", index > 0 && "border-t border-[var(--om-border)]")}>
                    <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[7px] bg-[var(--om-fill)] text-[12px] font-semibold uppercase text-[var(--om-text-2)]">{entry.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{entry.name}</span>
                    <select
                      aria-label={`Permission for ${entry.name}`}
                      value={entry.permission}
                      onChange={(e) => void save(entry.name, e.target.value as Permission | "ask")}
                      className="h-[32px] cursor-pointer rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[8px] text-[14px] text-[var(--om-text-1)] outline-none"
                    >
                      {CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex items-center gap-[8px] pt-[10px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                void save(draft, draftPermission);
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add an app, such as Google Chrome"
                aria-label="App name"
                maxLength={80}
                className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[12px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-3)] focus:border-[var(--om-border-focus)]"
              />
              <select
                aria-label="Permission for the new app"
                value={draftPermission}
                onChange={(e) => setDraftPermission(e.target.value as Permission)}
                className="h-[32px] cursor-pointer rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[8px] text-[14px] text-[var(--om-text-1)] outline-none"
              >
                <option value="always">Always allow</option>
                <option value="never">Never</option>
              </select>
              <button type="submit" disabled={!draft.trim()} className="h-[32px] min-w-[64px] cursor-pointer rounded-[8px] bg-[var(--om-btn-primary)] px-[8px] text-[14px] font-medium text-[var(--om-text-inverse)] disabled:cursor-not-allowed disabled:opacity-40">
                Add
              </button>
            </form>
            {failure ? (
              <p role="alert" className="pt-[8px] text-[13px] leading-[18px] text-[var(--om-danger)]">
                {failure}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
