// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * One viewer for any file the agent delivers: picks Markdown, code, text, PDF, image, table, chart,
 * audio, video, web page or slides by the file's name and type, each with download.
 */
import { BinaryViewer, CodeViewer, HtmlViewer, ImageViewer, MarkdownViewer, MediaViewer, PdfViewer } from "./basic-viewers";
import { ChartViewer } from "./chart-viewer";
import { SlideViewer } from "./slide-viewer";
import { TableViewer } from "./table-viewer";
import { kindOf, taskFileSource, type ArtifactKind, type ArtifactSource } from "./util";

export interface ArtifactViewerProps {
  source: ArtifactSource;
  /** Overrides the kind worked out from the name and type. */
  kind?: ArtifactKind;
  /** For slides: the task whose deck to show, and the deck's version. */
  taskId?: string;
  deckVersion?: number;
  /** Maps relative links in Markdown (a report's embedded charts) to URLs. */
  resolve?: (path: string) => string;
  className?: string;
}

export function ArtifactViewer({ source, kind, taskId, deckVersion, resolve, className }: ArtifactViewerProps) {
  const k = kind ?? kindOf(source);
  const body = (() => {
    switch (k) {
      case "markdown":
        return <MarkdownViewer source={source} resolve={resolve} />;
      case "code":
        return <CodeViewer source={source} />;
      case "text":
        return <CodeViewer source={source} wrap />;
      case "pdf":
        return <PdfViewer source={source} />;
      case "image":
        return <ImageViewer source={source} />;
      case "table":
        return <TableViewer source={source} />;
      case "chart":
        return <ChartViewer title={source.name} data={source} />;
      case "audio":
      case "video":
        return <MediaViewer source={source} kind={k} />;
      case "html":
        return <HtmlViewer source={source} />;
      case "slides":
        return taskId ? <SlideViewer taskId={taskId} version={deckVersion ?? 0} /> : <CodeViewer source={source} />;
      default:
        return <BinaryViewer source={source} />;
    }
  })();
  return <div className={className ?? "flex min-h-0 flex-1 flex-col"}>{body}</div>;
}

/** The same for a file from a task's file list (`GET /api/tasks/[id]/files`). */
export function TaskFileViewer({ taskId, file, deckVersion, className }: { taskId: string; file: { fileId: string; name: string; mime?: string; size?: number }; deckVersion?: number; className?: string }) {
  return <ArtifactViewer source={taskFileSource(taskId, file)} taskId={taskId} deckVersion={deckVersion} className={className} />;
}
