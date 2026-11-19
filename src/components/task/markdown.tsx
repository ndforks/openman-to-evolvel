// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Agent text rendered as GitHub-flavoured Markdown. Typography lives in `task-view.css` under `.tv-md`. */
import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/components/ui/cn";

const plugins = [remarkGfm];

/** react-markdown hands every component the syntax-tree `node`; it must not reach the DOM. */
function domProps<T extends ExtraProps>(props: T): Omit<T, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const components: Components = {
  // Links open in a new tab so the task keeps running in this one.
  a: (props: ComponentProps<"a"> & ExtraProps) => <a {...domProps(props)} target="_blank" rel="noreferrer noopener" />,
  // Wide tables scroll inside their own box instead of stretching the column.
  table: (props: ComponentProps<"table"> & ExtraProps) => (
    <div className="tv-table">
      <table {...domProps(props)} />
    </div>
  ),
};

export interface MarkdownProps {
  text: string;
  /** Shows the round cursor after the last line while the message is still arriving. */
  streaming?: boolean;
  /** "doc" is the denser style for tool results in the side panel, "file" the document style of a file preview, "preview" a small one, "compact" is for cards. */
  variant?: "chat" | "doc" | "file" | "preview" | "compact";
  /** Drop a leading top-level heading, for places that already show the title. */
  hideTitle?: boolean;
  className?: string;
}

export const Markdown = memo(function Markdown({ text, streaming = false, variant = "chat", hideTitle = false, className }: MarkdownProps) {
  return (
    <div className={cn("tv-md", variant === "doc" && "tv-md-doc", variant === "file" && "tv-md-file", variant === "preview" && "tv-md-preview", variant === "compact" && "tv-md-compact", hideTitle && "tv-md-untitled", streaming && "tv-md-streaming", className)}>
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
