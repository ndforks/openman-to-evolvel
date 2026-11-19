// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * The "+ Add" paths that need a dialog: Upload a skill (.zip, .skill, SKILL.md or a folder), Import from GitHub,
 * and Build from a task (pick a finished task; the agent packages it as a skill in that task's session, then the
 * skill card appears). "Add from official" opens the library on the Skills page instead.
 */
import { Download, FolderUp, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModalShell } from "@/components/modals/ModalShell";
import { brand } from "@/config/brand";
import { listTasks } from "@/lib/agent/client";
import type { TaskSummary } from "@/lib/agent/types";
import { buildStatus, downloadUrl, importFromGithub, refreshSkills, rememberSkill, startBuild, uploadSkill, type SkillInfo } from "@/lib/skills/client";
import { cx } from "../cx";
import { SkillCover, prettyName } from "./SkillCover";

export type AddMode = "build" | "upload" | "official" | "github";

/** Where "Record a skill" lives: its own page (live computer viewer), not a dialog. */
export const RECORD_SKILL_HREF = "/app/skills/record";

/** The "+ Add" menu, in order. `record` opens `RECORD_SKILL_HREF`; the others open `AddSkillDialog` (or the official list). */
export const ADD_OPTIONS: readonly { id: AddMode | "record"; label: string; description: string }[] = [
  { id: "build", label: "Build from a task", description: "Reuse the steps of a task that worked" },
  { id: "record", label: "Record a skill", description: "Demonstrate it once on a computer" },
  { id: "upload", label: "Upload a skill", description: "A .zip, .skill or SKILL.md file, or a folder" },
  { id: "official", label: "Add from official", description: "Choose from the vetted catalogue" },
  { id: "github", label: "Import from GitHub", description: "A public repository with SKILL.md" },
];

const PRIMARY = "flex h-[34px] cursor-pointer items-center justify-center gap-[6px] rounded-[9px] bg-[var(--om-btn-primary)] px-[12px] text-[14px] font-medium text-[var(--om-text-inverse)] outline-none hover:opacity-90 disabled:cursor-default disabled:opacity-50";
const SECONDARY = "flex h-[34px] cursor-pointer items-center justify-center gap-[6px] rounded-[9px] border border-[var(--om-border-strong)] px-[12px] text-[14px] font-medium text-[var(--om-text-1)] outline-none hover:bg-[var(--om-fill-subtle)]";
const INPUT = "h-[38px] w-full rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-[12px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]";

function Frame({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <ModalShell title={title} onClose={onClose} className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-[16px] rounded-[20px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-[4px] pr-[28px]">
        <h2 className="text-[18px] font-semibold leading-[24px]">{title}</h2>
        {subtitle ? <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">{subtitle}</p> : null}
      </div>
      {children}
    </ModalShell>
  );
}

/** The card shown once a skill lands: cover, name, description, Download. */
export function SkillResultCard({ skill, onOpen }: { skill: SkillInfo; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-[14px] rounded-[14px] border border-[var(--om-border)] bg-[var(--om-card)] p-[12px]">
      <div className="flex h-[72px] w-[84px] shrink-0 items-end justify-center overflow-hidden rounded-[8px] bg-[var(--om-fill)]">
        <SkillCover name={skill.name} className="h-[60px] w-[70px] p-[6px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="truncate text-[15px] font-medium leading-[20px]">{prettyName(skill.name)}</div>
        <div className="line-clamp-2 text-[13px] leading-[17px] text-[var(--om-text-3)]">{skill.description}</div>
        <div className="flex gap-[8px] pt-[6px]">
          <a href={downloadUrl(skill.name)} download className="flex h-[26px] items-center gap-[5px] rounded-[7px] border border-[var(--om-border-strong)] px-[8px] text-[13px] font-medium hover:bg-[var(--om-fill-subtle)]">
            <Download size={13} /> Download
          </a>
          {onOpen ? (
            <button type="button" onClick={onOpen} className="h-[26px] cursor-pointer rounded-[7px] border border-[var(--om-border-strong)] px-[8px] text-[13px] font-medium hover:bg-[var(--om-fill-subtle)]">
              Open
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({ onClose, onOpen }: { onClose: () => void; onOpen?: (name: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SkillInfo | null>(null);
  const [pending, setPending] = useState<File[] | null>(null);

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const send = async (files: File[], overwrite = false) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await uploadSkill(files, overwrite));
      setPending(null);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      if (/already installed/i.test(message)) setPending(files);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="Upload a skill" subtitle="A .zip or .skill archive, a SKILL.md file, or a folder with SKILL.md at its top." onClose={onClose}>
      {done ? (
        <SkillResultCard skill={done} onOpen={onOpen ? () => onOpen(done.name) : undefined} />
      ) : (
        <div className="grid grid-cols-2 gap-[10px]">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex h-[112px] cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[14px] border border-dashed border-[var(--om-border-strong)] text-[14px] font-medium hover:bg-[var(--om-fill-subtle)] disabled:opacity-50">
            <Upload size={20} strokeWidth={1.8} className="text-[var(--om-icon-2)]" />
            Choose a file
          </button>
          <button type="button" disabled={busy} onClick={() => folderRef.current?.click()} className="flex h-[112px] cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[14px] border border-dashed border-[var(--om-border-strong)] text-[14px] font-medium hover:bg-[var(--om-fill-subtle)] disabled:opacity-50">
            <FolderUp size={20} strokeWidth={1.8} className="text-[var(--om-icon-2)]" />
            Choose a folder
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".zip,.skill,.md" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void send(f); }} />
      <input ref={folderRef} type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void send(f); }} />
      {busy ? <div className="flex items-center gap-[8px] text-[13px] text-[var(--om-text-3)]"><Loader2 size={14} className="animate-spin" /> Installing on your computer…</div> : null}
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
      <div className="flex justify-end gap-[8px]">
        {pending ? (
          <button type="button" className={SECONDARY} onClick={() => void send(pending, true)}>
            Replace it
          </button>
        ) : null}
        <button type="button" className={done ? PRIMARY : SECONDARY} onClick={onClose}>
          {done ? "Done" : "Cancel"}
        </button>
      </div>
    </Frame>
  );
}

function GithubDialog({ onClose, onOpen }: { onClose: () => void; onOpen?: (name: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SkillInfo | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await importFromGithub(url.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="Import from GitHub" subtitle="A public repository with SKILL.md at its root, or a link to the folder that holds it." onClose={onClose}>
      {done ? (
        <SkillResultCard skill={done} onOpen={onOpen ? () => onOpen(done.name) : undefined} />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) void submit(); }} className="flex flex-col gap-[12px]">
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" aria-label="GitHub repository URL" className={INPUT} />
          <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Hermes downloads it and scans it before installing. Review a community skill&apos;s instructions and scripts before you use it.</p>
          {busy ? <div className="flex items-center gap-[8px] text-[13px] text-[var(--om-text-3)]"><Loader2 size={14} className="animate-spin" /> Installing with Hermes…</div> : null}
          {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger)]">{error}</div> : null}
          <div className="flex justify-end gap-[8px]">
            <button type="button" className={SECONDARY} onClick={onClose}>Cancel</button>
            <button type="submit" className={PRIMARY} disabled={busy || !url.trim()}>Import</button>
          </div>
        </form>
      )}
      {done ? (
        <div className="flex justify-end">
          <button type="button" className={PRIMARY} onClick={onClose}>Done</button>
        </div>
      ) : null}
    </Frame>
  );
}

function BuildDialog({ onClose, onOpen, taskId: initialTask }: { onClose: () => void; onOpen?: (name: string) => void; taskId?: string }) {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(initialTask ?? null);
  const [name, setName] = useState("");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [state, setState] = useState<"pick" | "running" | "done" | "failed">("pick");
  const [skill, setSkill] = useState<SkillInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTasks()
      .then(({ tasks: list }) => setTasks(list.filter((t) => t.status === "completed" || t.status === "stopped").slice(0, 30)))
      .catch(() => setTasks([]));
  }, []);

  useEffect(() => {
    if (!buildId || state !== "running") return;
    let live = true;
    const tick = async () => {
      try {
        const res = await buildStatus(buildId);
        if (!live) return;
        if (res.build.status === "done" && res.skill) {
          rememberSkill(res.skill);
          setSkill(res.skill);
          setState("done");
          void refreshSkills();
          return;
        }
        if (res.build.status === "failed") {
          setError(res.build.detail ?? "The agent didn't save the skill.");
          setState("failed");
          return;
        }
      } catch {
        // keep polling
      }
      if (live) timer = setTimeout(tick, 4000);
    };
    let timer = setTimeout(tick, 4000);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [buildId, state]);

  const start = async () => {
    if (!taskId) return;
    setError(null);
    try {
      const { build } = await startBuild(taskId, name.trim() || undefined);
      setBuildId(build.id);
      setState("running");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Frame title="Build from a task" subtitle={state === "pick" ? `Choose a task that went well. ${brand.name} turns its steps into a skill you can call with /.` : undefined} onClose={onClose}>
      {state === "pick" ? (
        <>
          <div className="max-h-[300px] overflow-y-auto rounded-[12px] border border-[var(--om-border)] p-[4px]">
            {tasks === null ? <div className="p-[12px] text-[13px] text-[var(--om-text-3)]">Loading tasks…</div> : null}
            {tasks?.length === 0 ? <div className="p-[12px] text-[13px] text-[var(--om-text-3)]">No finished tasks yet. Run a task first.</div> : null}
            {tasks?.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTaskId(t.id)}
                className={cx("flex w-full cursor-pointer items-center justify-between gap-[10px] rounded-[8px] px-[10px] py-[8px] text-left text-[14px] leading-[20px] hover:bg-[var(--om-fill-subtle)]", taskId === t.id && "bg-[var(--om-fill)]")}
              >
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="shrink-0 text-[12px] text-[var(--om-text-3)]">{new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-"))} placeholder="Skill name (optional, e.g. weekly-sales-recap)" aria-label="Skill name" className={INPUT} />
          {error ? <div className="text-[13px] text-[var(--om-danger)]">{error}</div> : null}
          <div className="flex justify-end gap-[8px]">
            <button type="button" className={SECONDARY} onClick={onClose}>Cancel</button>
            <button type="button" className={PRIMARY} disabled={!taskId} onClick={() => void start()}>Make it a skill</button>
          </div>
        </>
      ) : null}
      {state === "running" ? (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[10px] rounded-[12px] bg-[var(--om-fill-subtle)] p-[14px] text-[14px] leading-[20px]">
            <Loader2 size={16} className="shrink-0 animate-spin" />
            {brand.name} is packaging the task as a skill. This takes a minute or two.
          </div>
          <div className="flex justify-end gap-[8px]">
            <a href={`/app/task/${taskId}`} className={SECONDARY}>Watch the task</a>
            <button type="button" className={SECONDARY} onClick={onClose}>Close</button>
          </div>
        </div>
      ) : null}
      {state === "done" && skill ? (
        <>
          <SkillResultCard skill={skill} onOpen={onOpen ? () => onOpen(skill.name) : undefined} />
          <div className="flex justify-end">
            <button type="button" className={PRIMARY} onClick={onClose}>Done</button>
          </div>
        </>
      ) : null}
      {state === "failed" ? (
        <>
          <div className="text-[13px] text-[var(--om-danger)]">{error}</div>
          <div className="flex justify-end gap-[8px]">
            <button type="button" className={SECONDARY} onClick={() => setState("pick")}>Try again</button>
            <button type="button" className={PRIMARY} onClick={onClose}>Close</button>
          </div>
        </>
      ) : null}
    </Frame>
  );
}

export function AddSkillDialog({ mode, onClose, onOpen, taskId }: { mode: Exclude<AddMode, "official">; onClose: () => void; onOpen?: (name: string) => void; taskId?: string }) {
  if (mode === "upload") return <UploadDialog onClose={onClose} onOpen={onOpen} />;
  if (mode === "github") return <GithubDialog onClose={onClose} onOpen={onOpen} />;
  return <BuildDialog onClose={onClose} onOpen={onOpen} taskId={taskId} />;
}
