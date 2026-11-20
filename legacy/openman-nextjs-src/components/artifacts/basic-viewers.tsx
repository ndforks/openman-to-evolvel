// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Viewers for the simple file kinds: Markdown, code and text, PDF, images, audio, video, web pages, and anything else. */
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileQuestion, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { safeHref } from "@/lib/net/safe-href";
import { ArtifactHeader, DownloadButton, ToolbarButton, ViewerMessage, useText } from "./viewer-chrome";
import type { ArtifactSource } from "./util";

const PROSE =
  "max-w-none text-[15px] leading-[1.65] text-[var(--om-text-1)] [&_a]:text-[var(--om-text-accent)] [&_a]:underline [&_blockquote]:border-s-[3px] [&_blockquote]:border-[var(--om-border-strong)] [&_blockquote]:ps-[12px] [&_blockquote]:text-[var(--om-text-2)] [&_code]:rounded-[4px] [&_code]:bg-[var(--om-fill)] [&_code]:px-[4px] [&_code]:text-[13px] [&_h1]:mb-[12px] [&_h1]:mt-[8px] [&_h1]:font-serif [&_h1]:text-[26px] [&_h1]:leading-[34px] [&_h2]:mb-[8px] [&_h2]:mt-[22px] [&_h2]:text-[20px] [&_h2]:font-semibold [&_h3]:mb-[6px] [&_h3]:mt-[18px] [&_h3]:text-[16px] [&_h3]:font-semibold [&_hr]:my-[20px] [&_hr]:border-[var(--om-border)] [&_img]:my-[12px] [&_img]:max-w-full [&_img]:rounded-[8px] [&_li]:my-[4px] [&_ol]:my-[10px] [&_ol]:list-decimal [&_ol]:ps-[22px] [&_p]:my-[10px] [&_pre]:my-[12px] [&_pre]:overflow-auto [&_pre]:rounded-[8px] [&_pre]:bg-[var(--om-fill)] [&_pre]:p-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-[12px] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border [&_td]:border-[var(--om-border)] [&_td]:px-[8px] [&_td]:py-[4px] [&_th]:border [&_th]:border-[var(--om-border)] [&_th]:bg-[var(--om-fill)] [&_th]:px-[8px] [&_th]:py-[4px] [&_th]:text-start [&_ul]:my-[10px] [&_ul]:list-disc [&_ul]:ps-[22px]";

/** Renders Markdown text. `resolve` maps a relative image or link target to a URL (for reports that embed their charts). */
export function MarkdownBody({ text, resolve, className }: { text: string; resolve?: (src: string) => string; className?: string }) {
  const resolved = (src?: string | Blob) => (typeof src === "string" && resolve && !/^(https?:|data:|\/|#|mailto:)/i.test(src) ? resolve(src) : typeof src === "string" ? src : undefined);
  // Agent-written Markdown: only http(s), mailto, anchors, relative paths and data:image survive (no javascript: links).
  const map = (src?: string | Blob, kind: "link" | "image" = "link") => safeHref(resolved(src), kind);
  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => <img src={map(src, "image")} alt={alt ?? ""} />,
          a: ({ href, children }) => (
            <a href={map(href)} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownViewer({ source, resolve }: { source: ArtifactSource; resolve?: (src: string) => string }) {
  const { text, error } = useText(source.url);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} />
      <div className="min-h-0 flex-1 overflow-auto px-[28px] py-[20px]">
        {error ? <ViewerMessage tone="error">{error}</ViewerMessage> : text === null ? <ViewerMessage>Loading…</ViewerMessage> : <MarkdownBody text={text} resolve={resolve} className="mx-auto max-w-[760px]" />}
      </div>
    </div>
  );
}

export function CodeViewer({ source, wrap: initialWrap = false }: { source: ArtifactSource; wrap?: boolean }) {
  const { text, error, truncated } = useText(source.url);
  const [wrap, setWrap] = useState(initialWrap);
  const pretty = useMemo(() => {
    if (text === null || !/\.json$/i.test(source.name)) return text;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, [text, source.name]);
  const lines = pretty?.split("\n") ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} actions={<ToolbarButton onClick={() => setWrap((w) => !w)} active={wrap} title="Wrap lines">Wrap</ToolbarButton>} />
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--om-bg-2)]">
        {error ? (
          <ViewerMessage tone="error">{error}</ViewerMessage>
        ) : pretty === null ? (
          <ViewerMessage>Loading…</ViewerMessage>
        ) : (
          <table className="w-full border-collapse font-mono text-[13px] leading-[20px]">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="w-[1%] select-none whitespace-nowrap border-e border-[var(--om-border)] px-[10px] text-end align-top text-[var(--om-text-3)]">{i + 1}</td>
                  <td className={cn("px-[12px] align-top text-[var(--om-text-1)]", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>{line || " "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {truncated ? <p className="p-[12px] text-[12px] text-[var(--om-text-3)]">Showing the first part. Download the file for all of it.</p> : null}
      </div>
    </div>
  );
}

export function PdfViewer({ source }: { source: ArtifactSource }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} />
      <iframe title={source.name} src={source.url} className="min-h-0 w-full flex-1 border-0 bg-[var(--om-bg-2)]" />
    </div>
  );
}

export function ImageViewer({ source, caption }: { source: ArtifactSource; caption?: string }) {
  const [actual, setActual] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader
        source={source}
        actions={
          <ToolbarButton onClick={() => setActual((a) => !a)} title={actual ? "Fit to view" : "Actual size"}>
            {actual ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </ToolbarButton>
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-auto bg-[var(--om-preview-bg,var(--om-bg-2))] p-[16px]", !actual && "flex items-center justify-center")}>
        {failed ? (
          <ViewerMessage tone="error">The image could not be loaded.</ViewerMessage>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source.url} alt={caption ?? source.name} onError={() => setFailed(true)} className={cn("rounded-[6px]", actual ? "max-w-none" : "max-h-full max-w-full object-contain")} />
        )}
      </div>
      {caption ? <p className="border-t border-[var(--om-border)] px-[16px] py-[10px] text-[13px] text-[var(--om-text-2)]">{caption}</p> : null}
    </div>
  );
}

export function AudioPlayer({ src, title, detail, downloadUrl }: { src: string; title: string; detail?: string; downloadUrl?: string }) {
  return (
    <div className="flex flex-col gap-[10px] rounded-[12px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[14px]">
      <div className="flex items-start gap-[8px]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--om-text-1)]">{title}</p>
          {detail ? <p className="mt-[2px] line-clamp-3 text-[13px] leading-[18px] text-[var(--om-text-3)]">{detail}</p> : null}
        </div>
        {downloadUrl ? <DownloadButton href={downloadUrl} label="Download" /> : null}
      </div>
      <audio controls preload="metadata" src={src} className="w-full" />
    </div>
  );
}

export function MediaViewer({ source, kind }: { source: ArtifactSource; kind: "audio" | "video" }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} />
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--om-video-bg,#000)] p-[16px]">
        {kind === "video" ? (
          <video controls preload="metadata" src={source.url} className="max-h-full max-w-full rounded-[8px]" />
        ) : (
          <div className="w-full max-w-[520px]">
            <AudioPlayer src={source.url} title={source.name} />
          </div>
        )}
      </div>
    </div>
  );
}

/** A web page the agent wrote, in a sandboxed frame (the file route also sends a sandbox policy). */
export function HtmlViewer({ source }: { source: ArtifactSource }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} />
      <iframe title={source.name} src={source.url} sandbox="allow-scripts allow-popups allow-forms" className="min-h-0 w-full flex-1 border-0 bg-white" />
    </div>
  );
}

export function BinaryViewer({ source }: { source: ArtifactSource }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArtifactHeader source={source} />
      <ViewerMessage>
        <span className="flex flex-col items-center gap-[10px]">
          <FileQuestion size={28} className="text-[var(--om-icon-3)]" />
          No preview for this file type.
          {source.downloadUrl ? <DownloadButton href={source.downloadUrl} label={`Download ${source.name}`} /> : null}
        </span>
      </ViewerMessage>
    </div>
  );
}
