"use client";

/** "Files" tab of the side panel: every file the task delivered, with a preview of the selected one. */
import { useMemo, useState } from "react";
import { Cloud, Folder, FolderOpen, Search } from "lucide-react";
import { TaskFileViewer } from "@/components/artifacts";
import { cn } from "@/components/ui/cn";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { DownloadButton, FileGlyph, fileTypeLabel } from "@/components/task/cards";
import { fileUrl, isMarkdownFile, useFileContent, type FileContent } from "@/components/task/files";
import { Markdown } from "@/components/task/markdown";
import { Spinner, formatBytes, formatClock } from "@/components/task/parts";
import type { TaskFile, ToolCall } from "@/components/task/reducer";
import { filePreview } from "@/components/task/tools";

const ICON_BUTTON = "flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors enabled:cursor-pointer enabled:hover:bg-[var(--om-fill)] enabled:hover:text-[var(--om-icon-1)] enabled:focus-visible:bg-[var(--om-fill)] disabled:opacity-40";

export interface FilesTabProps {
  /** Null in mock mode: nothing is fetched and previews come from the work log. */
  taskId: string | null;
  files: TaskFile[];
  calls: ToolCall[];
  selectedId: string | null;
  onSelect: (fileId: string | null) => void;
  /** The list of files beside the preview. Opened on a file, the document gets the room; opened on the list, the list is the point. */
  listOpen: boolean;
  onToggleList: () => void;
}

function Notice({ file, children, download }: { file: TaskFile; children: string; download?: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileGlyph file={file} size={40} />
      <span className="max-w-full truncate text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{file.name}</span>
      <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{[fileTypeLabel(file), formatBytes(file.size)].filter(Boolean).join(" · ")}</span>
      <span className="max-w-[260px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{children}</span>
      {download ? (
        <a href={download} download={file.name} className="mt-1 flex h-8 items-center rounded-[8px] bg-[var(--om-btn-primary)] px-3 text-[14px] font-medium leading-5 text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90">
          Download
        </a>
      ) : null}
    </div>
  );
}

function Preview({ taskId, file, content, fallback }: { taskId: string | null; file: TaskFile; content: FileContent; fallback: string | undefined }) {
  const text = content.state === "text" ? content.text : content.state === "missing" ? fallback : undefined;
  if (content.state === "loading") {
    return (
      <div className="flex size-full items-center justify-center" role="status" aria-label="Loading the file">
        <Spinner size={18} />
      </div>
    );
  }
  if (content.state === "image") {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- an object URL made from the file's bytes; there is nothing for the image optimiser to fetch. */}
        <img src={content.url} alt={file.name} className="max-h-full max-w-full rounded-[8px] object-contain" />
      </div>
    );
  }
  if (content.state === "embed") return <iframe src={content.url} title={file.name} className="size-full border-0 bg-white" />;
  if (text !== undefined && text.trim()) {
    return (
      <div className="px-6 pb-10 pt-5">
        {isMarkdownFile(file) ? <Markdown text={text} variant="file" /> : <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-5 text-[var(--om-text-2)]">{text}</pre>}
        {content.state === "text" && content.truncated ? <p className="pt-4 text-[13px] leading-[18px] text-[var(--om-text-3)]">The preview stops here. Download the file to see the rest.</p> : null}
      </div>
    );
  }
  if (content.state === "binary" && taskId) {
    return (
      <Notice file={file} download={fileUrl(taskId, file.fileId, true)}>
        This kind of file cannot be previewed here.
      </Notice>
    );
  }
  return <Notice file={file}>{content.state === "text" ? "This file is empty." : "A preview is not available for this file."}</Notice>;
}

export function FilesTab({ taskId, files, calls, selectedId, onSelect, listOpen, onToggleList }: FilesTabProps) {
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState(true);

  const selected = files.find((f) => f.fileId === selectedId) ?? null;
  const content = useFileContent(taskId, selected);
  const fallback = selected ? filePreview(calls, selected) : undefined;
  const needle = query.trim().toLowerCase();
  const shown = needle ? files.filter((f) => f.name.toLowerCase().includes(needle)) : files;
  const modified = selected ? formatClock(selected.at) : "";
  const viewerFile = useMemo(() => (selected ? { fileId: selected.fileId, name: selected.name, mime: selected.mime, size: selected.size } : null), [selected]);
  // The artifacts viewer prints the file name and its own download button; the top bar then shows only the date.
  const inViewer = !!(selected && taskId && viewerFile);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--om-border)] pe-3 ps-4">
        {selected ? (
          <>
            {inViewer ? null : <span className="min-w-0 truncate text-[16px] font-semibold leading-6 text-[var(--om-text-1)]">{selected.name.replace(/\.(md|mdx|markdown)$/i, "")}</span>}
            {modified ? (
              <span className="hidden min-w-0 shrink items-center gap-1 truncate text-[12px] leading-4 text-[var(--om-text-3)] sm:flex">
                <Cloud size={13} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
                <span className="truncate">Last modified: {modified}</span>
              </span>
            ) : null}
          </>
        ) : null}
        <div className="ms-auto flex shrink-0 items-center gap-1">
          {selected && !inViewer ? <DownloadButton taskId={taskId} file={selected} content={content} fallbackPreview={fallback} size={17} /> : null}
          <Tooltip label={listOpen ? "Hide file list" : "Show file list"}>
            <button type="button" aria-label="Toggle file list" aria-pressed={listOpen} onClick={onToggleList} className={cn(ICON_BUTTON, listOpen && "bg-[var(--om-fill)] text-[var(--om-icon-1)]")}>
              <Folder size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn("tv-scroll min-w-0 flex-1 overflow-auto", selected && taskId && "flex flex-col")}>
          {selected && taskId && viewerFile ? (
            // The artifacts viewer: documents, code, tables, charts, slides, media and HTML each in the viewer that suits them.
            <TaskFileViewer key={selected.fileId} taskId={taskId} file={viewerFile} className="flex size-full min-h-0 flex-col" />
          ) : selected ? (
            <Preview key={selected.fileId} taskId={taskId} file={selected} content={content} fallback={fallback} />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-[12px] bg-[var(--om-fill)] text-[var(--om-icon-2)]">
                <FolderOpen size={20} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span className="text-[14px] font-semibold leading-5 text-[var(--om-text-1)]">{files.length > 0 ? "Pick a file on the right" : "Nothing saved yet"}</span>
              {files.length === 0 ? <span className="max-w-[240px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Anything the agent saves during this task is listed here.</span> : null}
            </div>
          )}
        </div>

        {listOpen ? (
          <aside className="flex w-[240px] shrink-0 flex-col gap-1 border-s border-[var(--om-border)] p-2" aria-label="Task files">
            <label className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-[var(--om-border)] px-[10px] focus-within:border-[var(--om-border-focus)]">
              <Search size={15} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--om-icon-3)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files" className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]" />
            </label>
            <button type="button" aria-expanded={groupOpen} onClick={() => setGroupOpen((v) => !v)} className="flex h-8 shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] px-1 text-left outline-none hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]">
              <ChevronRightIcon size={12} className={cn("shrink-0 text-[var(--om-icon-3)] transition-transform", groupOpen && "rotate-90")} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-[var(--om-text-1)]">Task files</span>
              <span className="shrink-0 pe-1 text-[12px] leading-4 tabular-nums text-[var(--om-text-3)]">{files.length}</span>
            </button>
            {groupOpen ? (
              <ul className="tv-scroll flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto">
                {shown.map((file) => (
                  <li key={file.fileId}>
                    <button
                      type="button"
                      aria-current={file.fileId === selectedId}
                      title={file.name}
                      onClick={() => onSelect(file.fileId)}
                      className={cn("flex h-9 w-full cursor-pointer items-center gap-2 rounded-[8px] pe-2 ps-[22px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]", file.fileId === selectedId && "bg-[var(--om-fill)]")}
                    >
                      <FileGlyph file={file} size={18} />
                      <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-[var(--om-text-1)]">{file.name}</span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 ? <li className="px-[22px] py-2 text-[13px] leading-[18px] text-[var(--om-text-3)]">{files.length === 0 ? "Nothing saved yet" : "No matching files"}</li> : null}
              </ul>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
