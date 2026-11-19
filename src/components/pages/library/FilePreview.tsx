// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Preview of one Library file: images, video, audio, PDF and HTML inline; text and code as plain text. */
import * as Dialog from "@radix-ui/react-dialog";
import { Download, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortalThemeClass } from "@/components/ui/theme";
import { taskHref } from "../routes";
import { downloadFile, type LibraryItem } from "./useLibrary";

const TEXT = /\.(md|txt|csv|json|js|ts|tsx|jsx|py|css|scss|yml|yaml|toml|sh|sql|xml|log|ini|env\.example)$/i;

function kindOf(file: LibraryItem): "image" | "video" | "audio" | "frame" | "text" | "none" {
  const mime = file.mime ?? "";
  const name = file.name.toLowerCase();
  if (file.category === "Images" || mime.startsWith("image/")) return "image";
  if (file.category === "Videos" || mime.startsWith("video/")) return "video";
  if (file.category === "Audio" || mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || name.endsWith(".pdf") || name.endsWith(".html") || name.endsWith(".htm")) return "frame";
  if (mime.startsWith("text/") || TEXT.test(name)) return "text";
  return "none";
}

function TextBody({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error())))
      .then((t) => alive && setText(t.length > 400_000 ? `${t.slice(0, 400_000)}\n…` : t))
      .catch(() => alive && setText("This file could not be loaded."));
    return () => {
      alive = false;
    };
  }, [url]);
  return <pre className="size-full overflow-auto whitespace-pre-wrap break-words p-[20px] font-mono text-[13px] leading-[19px] text-[var(--om-text-1)]">{text ?? "Loading…"}</pre>;
}

export function FilePreview({ file, onClose }: { file: LibraryItem | null; onClose: () => void }) {
  const theme = usePortalThemeClass();
  const kind = file ? kindOf(file) : "none";
  return (
    <Dialog.Root open={!!file} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className={`${theme} fixed left-1/2 top-1/2 z-50 flex h-[min(86vh,900px)] w-[min(92vw,1100px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-[var(--om-border)] bg-[var(--om-surface)] font-sans outline-none`}>
          {file ? (
            <>
              <div className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--om-border)] pl-[18px] pr-[10px]">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Dialog.Title className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{file.name}</Dialog.Title>
                  {file.taskId ? (
                    <Link href={taskHref(file.taskId)} className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)] hover:underline">
                      {file.taskTitle}
                    </Link>
                  ) : null}
                </div>
                {file.url ? (
                  <>
                    <a href={file.url} target="_blank" rel="noreferrer" aria-label="Open in new tab" className="flex size-[32px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
                      <ExternalLink size={16} aria-hidden />
                    </a>
                    <button type="button" onClick={() => downloadFile(file)} aria-label="Download" className="flex size-[32px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
                      <Download size={16} aria-hidden />
                    </button>
                  </>
                ) : null}
                <Dialog.Close aria-label="Close" className="flex size-[32px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
                  <X size={16} aria-hidden />
                </Dialog.Close>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--om-bg)]">
                {!file.url || kind === "none" ? (
                  <div className="flex flex-col items-center gap-[10px] text-[13px] text-[var(--om-text-2)]">
                    No preview for this file type.
                    {file.url ? (
                      <button type="button" onClick={() => downloadFile(file)} className="h-[32px] rounded-[9px] bg-[var(--om-btn-primary)] px-[13px] text-[14px] font-medium text-[var(--om-text-inverse)]">
                        Download
                      </button>
                    ) : null}
                  </div>
                ) : kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" />
                ) : kind === "video" ? (
                  <video src={file.url} controls className="max-h-full max-w-full" />
                ) : kind === "audio" ? (
                  <audio src={file.url} controls />
                ) : kind === "frame" ? (
                  /\.pdf$/i.test(file.name) || file.mime === "application/pdf" ? (
                    <iframe src={file.url} title={file.name} className="size-full border-0 bg-white" />
                  ) : (
                    <iframe src={file.url} title={file.name} sandbox="allow-scripts allow-popups" className="size-full border-0 bg-white" />
                  )
                ) : (
                  <TextBody url={file.url} />
                )}
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
