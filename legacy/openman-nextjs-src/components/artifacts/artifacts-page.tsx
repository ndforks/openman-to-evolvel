// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * A task's artifacts on a page of their own (`/app/artifacts/[taskId]`): the generator panel for a
 * generator task, and every file the task delivered in the matching viewer.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useGeneratorState } from "@/lib/generators/client";
import { TaskFileViewer } from "./artifact-viewer";
import { GeneratorPanel } from "./generator-panel";
import { formatBytes } from "./util";

interface FileRow {
  fileId: string;
  name: string;
  mime?: string;
  size?: number;
}

export function ArtifactsPage({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<{ title: string; status: string } | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [selected, setSelected] = useState<string | "generator">("generator");
  const live = !!task && ["waking", "running", "waiting"].includes(task.status);
  const { state } = useGeneratorState(taskId, live);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch(`/api/tasks/${encodeURIComponent(taskId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { task?: { title: string; status: string } } | null) => !cancelled && d?.task && setTask(d.task));
      void fetch(`/api/tasks/${encodeURIComponent(taskId)}/files`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { files?: FileRow[] } | null) => !cancelled && d?.files && setFiles(d.files));
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId]);

  const isGenerator = !!state?.kind;
  const current = selected === "generator" && isGenerator ? "generator" : selected === "generator" ? files[0]?.fileId : selected;
  const file = files.find((f) => f.fileId === current);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--om-bg)] text-[var(--om-text-1)]">
      <header className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--om-border)] px-[16px]">
        <Link href={`/app/task/${encodeURIComponent(taskId)}`} aria-label="Back to the task" className="flex size-[30px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium">{task?.title ?? "Artifacts"}</h1>
        {task ? <span className="text-[12px] capitalize text-[var(--om-text-3)]">{task.status}</span> : null}
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Files" className="flex w-[240px] shrink-0 flex-col gap-[2px] overflow-y-auto border-e border-[var(--om-border)] p-[8px] max-md:hidden">
          {isGenerator ? (
            <button type="button" onClick={() => setSelected("generator")} className={cn("flex cursor-pointer items-center gap-[8px] rounded-[8px] px-[10px] py-[7px] text-start text-[13px] hover:bg-[var(--om-fill)]", current === "generator" && "bg-[var(--om-fill)] font-medium")}>
              <Sparkles size={14} className="shrink-0 text-[var(--om-icon-2)]" />
              <span className="truncate capitalize">{state?.kind === "data" ? "Analysis" : state?.kind === "research" ? "Research" : state?.kind}</span>
            </button>
          ) : null}
          {files.map((f) => (
            <button key={f.fileId} type="button" onClick={() => setSelected(f.fileId)} className={cn("flex cursor-pointer flex-col rounded-[8px] px-[10px] py-[6px] text-start hover:bg-[var(--om-fill)]", current === f.fileId && "bg-[var(--om-fill)]")}>
              <span className="truncate text-[13px]">{f.name}</span>
              <span className="text-[11px] text-[var(--om-text-3)]">{formatBytes(f.size)}</span>
            </button>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col">
          {current === "generator" ? (
            <GeneratorPanel taskId={taskId} live={live} />
          ) : file ? (
            <TaskFileViewer key={file.fileId} taskId={taskId} file={file} deckVersion={state?.slides?.updatedAt} />
          ) : (
            <p className="m-auto text-[13px] text-[var(--om-text-3)]">No files yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
