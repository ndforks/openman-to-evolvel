// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * How a tool call is described on screen: which app it belongs to, the sentence for the row in the work log,
 * the icon, and the one-line summary of a group ("Looked up 2 queries · Ran 1 command").
 * Tool names come from the agent runtime (terminal, web_search, browser_exec, read_file, ...), so matching is by keyword.
 */
import { Bot, Brain, Cable, Compass, FileText, ImageIcon, ListTodo, MessageCircleQuestion, MousePointer2, Puzzle, Search, SquarePen, SquareTerminal, Wrench } from "lucide-react";
import type { TaskFile, ToolCall } from "./reducer";

export type ToolKind = "search" | "browser" | "terminal" | "code" | "read" | "edit" | "write" | "computer" | "image" | "plan" | "ask" | "memory" | "agent" | "skill" | "connector" | "other";

export interface ToolInfo {
  kind: ToolKind;
  /** App shown in the computer panel's footer ("Terminal", "Browser", ...). */
  app: string;
  /** Present-tense lead-in for the live row, e.g. "Running". Empty when the preview already reads as a sentence. */
  verb: string;
  /** The command, query, path or URL the call works on. */
  target: string;
  /** Show the target in a monospace face. */
  mono: boolean;
}

const RULES: readonly { kind: ToolKind; test: RegExp }[] = [
  // File search tools carry "search" in their name but belong with the file tools.
  { kind: "read", test: /search_files|list_files|find_files|^glob$|^grep$|^ls$/ },
  { kind: "search", test: /(^|[_\-.])(web_?search|x_search|session_search|search_web|google|search)([_\-.]|$)/ },
  { kind: "browser", test: /browser|web_extract|web_fetch|webfetch|navigate|crawl|scrape|open_url|fetch_url/ },
  { kind: "terminal", test: /terminal|bash|shell|^exec$|command|process_manage|^run$/ },
  { kind: "code", test: /execute_code|code_exec|python|notebook|run_code/ },
  { kind: "write", test: /write_file|create_file|file_write|^write$|save_file/ },
  { kind: "edit", test: /patch|edit|str_replace|apply_diff|multiedit/ },
  { kind: "read", test: /read_file|file_read|^read$|^view$|view_file/ },
  { kind: "computer", test: /computer|screenshot|mouse|keyboard|click|type_text|press_key|scroll/ },
  { kind: "image", test: /image_gen|generate_image|video_gen|text_to_speech|vision|image/ },
  { kind: "plan", test: /todo|plan|kanban/ },
  { kind: "ask", test: /clarify|ask_user|question|message_ask/ },
  { kind: "memory", test: /memory|remember|recall/ },
  { kind: "agent", test: /delegate|subagent|spawn|task_/ },
  { kind: "skill", test: /skill/ },
];

/** "mcp__github__create_issue" or "mcp-github" -> { server: "GitHub", action: "create issue" }. */
function connectorParts(tool: string): { server: string; action: string } | null {
  const match = /^mcp(?:__|-|\.)([^_.-]+(?:[_-][^_.-]+)*?)(?:__(.+))?$/i.exec(tool);
  if (!match) return null;
  return { server: humanize(match[1]), action: match[2] ? humanize(match[2]).toLowerCase() : "" };
}

export function humanize(name: string): string {
  const words = name.replace(/[_\-.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

export function toolKind(tool: string): ToolKind {
  const name = tool.toLowerCase();
  if (/^mcp(__|-|\.)/.test(name)) return "connector";
  for (const rule of RULES) if (rule.test.test(name)) return rule.kind;
  return "other";
}

const looksLikeUrl = (text: string) => /^(https?:\/\/|www\.)\S+$/i.test(text.trim());
const looksLikePath = (text: string) => /^[~./\w-][\w./~ -]*\.[a-z0-9]{1,8}$/i.test(text.trim()) || /^[~/.]\S*$/.test(text.trim());
const firstLine = (text: string | undefined) => (text ?? "").split("\n")[0].trim();

export function describeCall(call: Pick<ToolCall, "tool" | "input">): ToolInfo {
  const kind = toolKind(call.tool);
  const target = firstLine(call.input);
  switch (kind) {
    case "search":
      return { kind, app: "Search", verb: target ? "Looking up" : "Looking things up online", target, mono: false };
    case "browser":
      return { kind, app: "Browser", verb: looksLikeUrl(target) ? "Visiting" : target ? "" : "Reading pages online", target, mono: looksLikeUrl(target) };
    case "terminal":
      return { kind, app: "Terminal", verb: target ? "Running" : "Working in the terminal", target, mono: true };
    case "code":
      return { kind, app: "Terminal", verb: "Running a script", target, mono: true };
    case "write":
      return { kind, app: "Editor", verb: looksLikePath(target) ? "Writing" : target ? "" : "Writing a new file", target, mono: looksLikePath(target) };
    case "edit":
      return { kind, app: "Editor", verb: looksLikePath(target) ? "Changing" : target ? "" : "Changing a file", target, mono: looksLikePath(target) };
    case "read":
      return { kind, app: "Editor", verb: looksLikePath(target) ? "Opening" : target ? "" : "Opening a file", target, mono: looksLikePath(target) };
    case "computer":
      return { kind, app: "Computer", verb: target ? "" : "Operating the desktop", target, mono: false };
    case "image":
      return { kind, app: "Media", verb: target ? "Making" : "Making an image or audio", target, mono: false };
    case "plan":
      return { kind, app: "Planner", verb: target ? "" : "Revising the plan", target, mono: false };
    case "ask":
      return { kind, app: "Chat", verb: target ? "" : "Checking with you", target, mono: false };
    case "memory":
      return { kind, app: "Memory", verb: target ? "" : "Looking through saved notes", target, mono: false };
    case "agent":
      return { kind, app: "Subagents", verb: target ? "Handing off" : "Handing work to helpers", target, mono: false };
    case "skill":
      return { kind, app: "Skills", verb: target ? "Applying skill" : "Applying a skill", target, mono: false };
    case "connector": {
      const parts = connectorParts(call.tool);
      const app = parts?.server ?? "Connector";
      return { kind, app, verb: target ? "" : parts?.action ? `${app}: ${parts.action}` : `Calling ${app}`, target, mono: false };
    }
    default:
      return { kind, app: humanize(call.tool), verb: target ? "" : `Calling ${humanize(call.tool).toLowerCase()}`, target, mono: false };
  }
}

/** Sentence for the row of a call: "Running ls -la", "Looking up agent frameworks", or the preview itself. */
export function callSentence(call: Pick<ToolCall, "tool" | "input">): string {
  const info = describeCall(call);
  return [info.verb, info.target].filter(Boolean).join(" ");
}

/** Text for a finished row. The preview says it best; without one, fall back to a short past-tense phrase. */
export function finishedLabel(call: Pick<ToolCall, "tool" | "input">): string {
  const info = describeCall(call);
  if (info.target) return info.target;
  const past: Partial<Record<ToolKind, string>> = {
    search: "Looked things up",
    browser: "Read pages online",
    terminal: "Ran a shell command",
    code: "Ran a script",
    write: "Wrote a file",
    edit: "Changed a file",
    read: "Opened a file",
    computer: "Operated the desktop",
    image: "Made an image or audio",
    plan: "Revised the plan",
    ask: "Checked with you",
    memory: "Looked through saved notes",
    agent: "Handed work to helpers",
    skill: "Applied a skill",
  };
  return past[info.kind] ?? `Called ${info.app.toLowerCase()}`;
}

const SUMMARY: Record<string, readonly [verb: string, one: string, many: string]> = {
  search: ["Looked up", "query", "queries"],
  browser: ["Read", "page", "pages"],
  terminal: ["Ran", "command", "commands"],
  write: ["Wrote", "file", "files"],
  edit: ["Changed", "file", "files"],
  read: ["Opened", "file", "files"],
  image: ["Made", "asset", "assets"],
  agent: ["Handed off", "task", "tasks"],
  other: ["Called", "tool", "tools"],
};
const SUMMARY_KEY: Partial<Record<ToolKind, string>> = { search: "search", browser: "browser", terminal: "terminal", code: "terminal", write: "write", edit: "edit", read: "read", image: "image", agent: "agent" };

/** "Read 7 pages · Ran 1 command", in order of first appearance. */
export function summarizeCalls(calls: readonly Pick<ToolCall, "tool">[]): string {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const key = SUMMARY_KEY[toolKind(call.tool)] ?? "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [key, n] of counts) {
    const [verb, one, many] = SUMMARY[key];
    parts.push(`${verb} ${n} ${n === 1 ? one : many}`);
  }
  return parts.join(" · ");
}

/** True for a one-line acknowledgement of a file operation, as opposed to the file's text. */
export function isReceipt(output: string): boolean {
  const text = output.trim();
  return !text.includes("\n") && text.length < 240 && /^(wrote|saved|created|updated|patched|edited|replaced|ok\b|success|done\b|file )/i.test(text);
}

/**
 * Text of a delivered file, when the work log happens to carry it: the result preview of the last
 * write, edit or read of a path with the same file name. The event contract has no file contents,
 * so this is the only source for the inline preview on a file card.
 */
export function filePreview(calls: readonly ToolCall[], file: Pick<TaskFile, "name">): string | undefined {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const call = calls[i];
    const kind = toolKind(call.tool);
    if (kind !== "write" && kind !== "edit" && kind !== "read") continue;
    if (!call.output || !call.output.trim()) continue;
    // A write usually reports a receipt ("Wrote 4812 bytes to ..."), not the contents.
    if (kind !== "read" && isReceipt(call.output)) continue;
    const path = firstLine(call.input);
    if (path === file.name || path.endsWith(`/${file.name}`)) return call.output;
  }
  return undefined;
}

/* ---------------------------------------------------------------- icons */

/** 16 px outlined glyph for a tool in the work log. */
export function ToolIcon({ tool, size = 16 }: { tool: string; size?: number }) {
  const kind = toolKind(tool);
  switch (kind) {
    case "search":
      return <Search size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "browser":
      return <Compass size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "terminal":
    case "code":
      return <SquareTerminal size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "edit":
    case "write":
      return <SquarePen size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "read":
      return <FileText size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "computer":
      return <MousePointer2 size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "image":
      return <ImageIcon size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "plan":
      return <ListTodo size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "ask":
      return <MessageCircleQuestion size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "memory":
      return <Brain size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "agent":
      return <Bot size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "skill":
      return <Puzzle size={size} strokeWidth={1.6} aria-hidden="true" />;
    case "connector":
      return <Cable size={size} strokeWidth={1.6} aria-hidden="true" />;
    default:
      return <Wrench size={size} strokeWidth={1.6} aria-hidden="true" />;
  }
}
