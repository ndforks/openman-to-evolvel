"use client";

/** Cards that appear in an agent turn: a question, an approval request, a delivered file and an error. */
import { useState } from "react";
import { CircleAlert, Download, Ellipsis, ShieldQuestion } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { fileUrl, isMarkdownFile, useFileContent, type FileContent } from "./files";
import { Markdown } from "./markdown";
import { formatBytes } from "./parts";
import type { ApprovalBlock, QuestionBlock, TaskFile } from "./reducer";
import { ProposalDiff } from "./proposal-diff";
import { humanize } from "./tools";

const CARD = "tv-rise-in flex flex-col rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)]";
const BUTTON = "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-[6px] rounded-[8px] px-3 text-[14px] font-medium leading-5 outline-none transition-[opacity,background-color] disabled:cursor-default disabled:opacity-50";
const PRIMARY = cn(BUTTON, "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90 focus-visible:opacity-90");
const SECONDARY = cn(BUTTON, "border border-[var(--om-border-strong)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]");

type Reply = (requestId: string, reply: { choice?: string; answer?: string }) => Promise<void>;

/* ---------------------------------------------------------------- approval */

/** Raw choice ids from an agent runtime; the server normally sends ready-made labels instead. */
const CHOICE_LABEL: Record<string, string> = { once: "Allow once", session: "Allow for this session", always: "Always allow", deny: "Deny" };
const isRefusal = (choice: string) => /^(deny|reject|decline|dismiss|cancel|skip|stop|no\b|don'?t)/i.test(choice.trim());

export function choiceLabel(choice: string): string {
  return CHOICE_LABEL[choice.toLowerCase()] ?? humanize(choice);
}

export function ApprovalCard({ block, onReply }: { block: ApprovalBlock; onReply: Reply }) {
  const [sending, setSending] = useState<string | null>(null);
  const resolved = block.choice !== undefined || block.skipped === true;
  // The first affirmative choice is the main action; refusals stay quiet and come first in the row.
  const primary = block.choices.find((c) => !isRefusal(c));
  const ordered = [...block.choices.filter(isRefusal), ...block.choices.filter((c) => !isRefusal(c) && c !== primary), ...(primary ? [primary] : [])];
  // For a command the runtime's title is its reason for asking ("delete in root path"); the command itself is the detail.
  const forCommand = block.approvalKind === "command" && block.detail !== undefined;
  const heading = forCommand ? "OK to run this command?" : block.title;
  const reason = forCommand && block.title ? block.title[0].toUpperCase() + block.title.slice(1) : null;

  const pick = async (choice: string) => {
    setSending(choice);
    try {
      await onReply(block.requestId, { choice });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className={cn(CARD, "gap-3 p-4")} role="group" aria-label={heading}>
      <div className="flex items-start gap-[10px]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--om-fill)] text-[var(--om-icon-1)]">
          <ShieldQuestion size={16} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col pt-[3px]">
          <span className="break-words text-[15px] font-semibold leading-[22px] text-[var(--om-text-1)]">{heading}</span>
          {reason ? <span className="break-words text-[13px] leading-[18px] text-[var(--om-text-3)]">{reason}</span> : null}
        </div>
      </div>
      {block.approvalKind === "project-update" ? (
        <ProposalDiff proposalId={block.requestId.replace(/^ext:project-update:/, "")} fallback={block.detail} />
      ) : block.detail ? (
        <pre className="tv-scroll max-h-[168px] overflow-auto whitespace-pre-wrap break-words rounded-[8px] border border-[var(--om-border-subtle)] bg-[var(--om-fill-sunken)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--om-text-2)]">{block.detail}</pre>
      ) : null}
      {resolved ? (
        <div className="flex items-center gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
          {block.choice !== undefined && !isRefusal(block.choice) ? <CheckIcon size={14} className="text-[var(--om-success)]" /> : null}
          {block.choice !== undefined ? (
            <span>
              You chose <span className="text-[var(--om-text-2)]">{choiceLabel(block.choice)}</span>
            </span>
          ) : (
            "Answered"
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {ordered.map((choice) => (
            <button key={choice} type="button" disabled={sending !== null} onClick={() => void pick(choice)} className={choice === primary ? PRIMARY : SECONDARY}>
              {choiceLabel(choice)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- question */

/** Some runtimes end a question with this instruction; the card offers a Skip button instead. */
const SKIP_HINT = /\s*Reply ["“”']skip["“”'] to skip this question\.?\s*$/i;

export function QuestionCard({ block, onReply }: { block: QuestionBlock; onReply: Reply }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const options = block.options ?? [];
  const resolved = block.answer !== undefined || block.skipped === true;
  const answered = block.answer !== undefined ? block.answer.split("\n").map((a) => a.trim()) : [];
  const skippable = SKIP_HINT.test(block.text);
  const question = block.text.replace(SKIP_HINT, "");
  const skippedByUser = block.answer !== undefined && block.answer.trim().toLowerCase() === "skip";

  const submit = async (answer: string) => {
    setSending(true);
    try {
      await onReply(block.requestId, { answer });
    } finally {
      setSending(false);
    }
  };
  const toggle = (option: string) => setPicked((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));

  return (
    <div className={cn(CARD, "gap-3 p-4")} role="group" aria-label="Question">
      <Markdown text={question} variant="compact" />
      {options.length > 0 ? (
        <div className="flex flex-col gap-[6px]">
          {options.map((option) => {
            const chosen = resolved ? answered.includes(option) : picked.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={resolved || sending}
                aria-pressed={chosen}
                onClick={() => (block.multiple ? toggle(option) : void submit(option))}
                className={cn(
                  "flex min-h-9 w-full items-center gap-[10px] rounded-[10px] border px-3 py-[7px] text-left text-[14px] leading-5 outline-none transition-colors",
                  chosen ? "border-[var(--om-border-focus)] bg-[var(--om-fill)] text-[var(--om-text-1)]" : "border-[var(--om-border)] text-[var(--om-text-2)]",
                  resolved || sending ? "cursor-default" : "cursor-pointer hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] focus-visible:bg-[var(--om-fill-subtle)]",
                  resolved && !chosen && "opacity-50",
                )}
              >
                {block.multiple ? (
                  <span aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", chosen ? "border-transparent bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)]" : "border-[var(--om-border-strong)]")}>
                    {chosen ? <CheckIcon size={11} strokeWidth={2.4} /> : null}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 break-words">{option}</span>
                {!block.multiple && chosen ? <CheckIcon size={14} className="shrink-0 text-[var(--om-icon-1)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {resolved ? (
        block.answer !== undefined && !answered.some((a) => options.includes(a)) ? (
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
            {skippedByUser ? (
              "Skipped"
            ) : (
              <>
                Answered: <span className="text-[var(--om-text-2)]">{block.answer}</span>
              </>
            )}
          </div>
        ) : null
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{options.length > 0 ? "None of these? Reply in the message box." : "Reply in the message box."}</span>
          <div className="flex shrink-0 items-center gap-2">
            {skippable ? (
              <button type="button" disabled={sending} onClick={() => void submit("skip")} className={cn(SECONDARY, "h-7 px-[10px] text-[13px]")}>
                Skip
              </button>
            ) : null}
            {block.multiple && options.length > 0 ? (
              <button type="button" disabled={picked.length === 0 || sending} onClick={() => void submit(picked.join("\n"))} className={PRIMARY}>
                Submit
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- file */

type FileFamily = "doc" | "sheet" | "slides" | "image" | "media" | "code" | "archive" | "other";

const FAMILY_COLOR: Record<FileFamily, string> = { doc: "#3b82f6", sheet: "#22a565", slides: "#f08a24", image: "#a66bf0", media: "#e5567a", code: "#6b7c93", archive: "#b58a2f", other: "#7a7a7a" };
const FAMILY_NAME: Record<FileFamily, string> = { doc: "Document", sheet: "Spreadsheet", slides: "Slides", image: "Image", media: "Media", code: "Code", archive: "Archive", other: "File" };

export function fileFamily(file: Pick<TaskFile, "name" | "mime">): FileFamily {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const mime = file.mime ?? "";
  if (/^image\//.test(mime) || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (/^(video|audio)\//.test(mime) || ["mp4", "mov", "webm", "mp3", "wav", "m4a"].includes(ext)) return "media";
  if (["csv", "xlsx", "xls", "tsv"].includes(ext) || /spreadsheet|csv/.test(mime)) return "sheet";
  if (["pptx", "ppt", "key"].includes(ext) || /presentation/.test(mime)) return "slides";
  if (["zip", "tar", "gz", "tgz", "rar", "7z"].includes(ext) || /zip|tar/.test(mime)) return "archive";
  if (["md", "mdx", "txt", "pdf", "doc", "docx", "rtf"].includes(ext) || /markdown|pdf|msword|wordprocessing|text\/plain/.test(mime)) return "doc";
  if (["js", "ts", "tsx", "jsx", "py", "json", "html", "css", "sh", "yaml", "yml", "go", "rs", "java", "c", "cpp", "sql", "xml", "toml"].includes(ext) || /json|javascript|html|xml/.test(mime)) return "code";
  return "other";
}

export function fileTypeLabel(file: Pick<TaskFile, "name" | "mime">): string {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "";
  const family = FAMILY_NAME[fileFamily(file)];
  if (ext === "MD" || ext === "MDX") return "Markdown";
  if (!ext || ext.length > 5) return family;
  return `${ext} ${family.toLowerCase()}`;
}

/** Coloured page glyph for a file, tinted by its family. */
export function FileGlyph({ file, size = 24 }: { file: Pick<TaskFile, "name" | "mime">; size?: number }) {
  const color = FAMILY_COLOR[fileFamily(file)];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6.6 2.5h6.9l6 6V19a2.5 2.5 0 0 1-2.5 2.5H6.6A2.5 2.5 0 0 1 4.1 19V5a2.5 2.5 0 0 1 2.5-2.5z" fill={color} />
      <path d="M13.5 2.5v4a2 2 0 0 0 2 2h4z" fill="#fff" fillOpacity="0.4" />
      <path d="M8 12.6h8M8 15.4h8M8 18.2h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Saves text the browser already holds (a preview) as a file. */
export function downloadText(name: string, text: string, mime = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface FileCardProps {
  /** Task the file belongs to; null in mock mode, where nothing is fetched. */
  taskId: string | null;
  file: TaskFile;
  /** Text of the file when the work log carries it; used until (or instead of) the copy on the server. */
  fallbackPreview?: string;
  onOpen: (fileId: string) => void;
}

const CARD_ACTION = "flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors";
const CARD_ACTION_ON = "cursor-pointer hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill-subtle)]";

/** First top-level heading of a Markdown document, used as the card title. */
export function documentTitle(markdown: string | undefined): string | null {
  if (!markdown) return null;
  const match = /^\s*#\s+(.+?)\s*$/m.exec(markdown.split("\n").slice(0, 5).join("\n"));
  return match ? match[1].replace(/[*_`]/g, "") : null;
}

/** Download control for a file: the server's copy when there is one, else the text already on screen. */
export function DownloadButton({ taskId, file, content, fallbackPreview, className, size = 16 }: { taskId: string | null; file: TaskFile; content: FileContent; fallbackPreview?: string; className?: string; size?: number }) {
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const icon = <Download size={size} strokeWidth={1.7} aria-hidden="true" />;
  if (taskId && content.state !== "missing" && content.state !== "loading") {
    return (
      <Tooltip label="Download">
        <a href={fileUrl(taskId, file.fileId, true)} download={file.name} aria-label={`Download ${file.name}`} onClick={stop} onKeyDown={stop} className={cn(CARD_ACTION, CARD_ACTION_ON, className)}>
          {icon}
        </a>
      </Tooltip>
    );
  }
  const text = content.state === "missing" ? fallbackPreview : undefined;
  return (
    <Tooltip label={text ? "Download" : content.state === "loading" ? "Download" : "No copy of this file to download"}>
      <button
        type="button"
        aria-label={`Download ${file.name}`}
        aria-disabled={!text}
        onClick={(event) => {
          event.stopPropagation();
          if (text) downloadText(file.name, text, file.mime ?? "text/plain");
        }}
        onKeyDown={stop}
        className={cn(CARD_ACTION, text ? CARD_ACTION_ON : "cursor-default opacity-40", className)}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

export function FileCard({ taskId, file, fallbackPreview, onOpen }: FileCardProps) {
  const content = useFileContent(taskId, file);
  const markdown = isMarkdownFile(file);
  const preview = content.state === "text" ? content.text : content.state === "missing" ? fallbackPreview : undefined;
  const meta = [fileTypeLabel(file), formatBytes(file.size)].filter(Boolean).join(" · ");
  const title = (markdown ? documentTitle(preview) : null) ?? file.name;
  const hasBody = Boolean(preview && preview.trim()) || content.state === "image";
  // Only a document that runs past the card fades out at the bottom; a short note is shown whole.
  const long = preview !== undefined && (preview.length > 700 || preview.split("\n").length > 12);
  return (
    <div className="tv-rise-in flex w-full max-w-[570px] flex-col overflow-hidden rounded-[12px] border-[0.5px] border-[var(--om-border-strong)] bg-[var(--om-surface)] transition-shadow hover:shadow-[0_4px_16px_var(--om-shadow-sm)]">
      <div
        role="button"
        tabIndex={0}
        title={file.name}
        onClick={() => onOpen(file.fileId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(file.fileId);
          }
        }}
        className={cn("flex shrink-0 cursor-pointer items-center gap-2 px-3 outline-none focus-visible:bg-[var(--om-fill-subtle)]", hasBody ? "border-b border-[var(--om-border)] py-[14px]" : "py-[10px]")}
      >
        <FileGlyph file={file} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-medium leading-5 text-[var(--om-text-1)]">{title}</span>
          {hasBody ? null : <span className="truncate text-[12px] leading-4 text-[var(--om-text-3)]">{meta}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DownloadButton taskId={taskId} file={file} content={content} fallbackPreview={fallbackPreview} />
          <Menu>
            <Tooltip label="More">
              <MenuTrigger asChild>
                <button type="button" aria-label="More" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className={cn(CARD_ACTION, CARD_ACTION_ON, "data-[state=open]:bg-[var(--om-fill-subtle)]")}>
                  <Ellipsis size={16} aria-hidden="true" />
                </button>
              </MenuTrigger>
            </Tooltip>
            <MenuContent align="end" className="w-[200px]" onClick={(event) => event.stopPropagation()}>
              <MenuItem onSelect={() => onOpen(file.fileId)}>Open in panel</MenuItem>
              <MenuItem onSelect={() => void navigator.clipboard?.writeText(file.name)}>Copy file name</MenuItem>
              {preview ? <MenuItem onSelect={() => void navigator.clipboard?.writeText(preview)}>Copy contents</MenuItem> : null}
            </MenuContent>
          </Menu>
        </div>
      </div>
      {hasBody ? (
        // The header above is the keyboard target; this area only widens the click target for the mouse.
        <div aria-hidden="true" onClick={() => onOpen(file.fileId)} className={cn("relative w-full cursor-pointer overflow-hidden px-4", content.state === "image" ? "aspect-[16/9] py-2" : "max-h-[320px] pb-3 pt-1")}>
          {content.state === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- an object URL made from the file's bytes; there is nothing for the image optimiser to fetch.
            <img src={content.url} alt={file.name} className="size-full rounded-[6px] object-contain" />
          ) : (
            // Shown at three quarters of its size; `zoom` shrinks the space it takes as well.
            <div className="pointer-events-none pt-2 [zoom:0.75]">
              {markdown ? <Markdown text={preview ?? ""} hideTitle /> : <pre className="whitespace-pre-wrap break-words font-mono text-[14px] leading-[22px] text-[var(--om-text-2)]">{(preview ?? "").slice(0, 4000)}</pre>}
            </div>
          )}
          {long ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--om-surface)] to-transparent" /> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- error */

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="tv-rise-in flex items-start gap-[10px] rounded-[12px] border border-[color-mix(in_srgb,var(--om-danger)_30%,transparent)] bg-[var(--om-danger-soft)] px-4 py-3">
      <CircleAlert size={18} strokeWidth={1.7} aria-hidden="true" className="mt-[2px] shrink-0 text-[var(--om-danger)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[14px] font-medium leading-5 text-[var(--om-text-1)]">Something went wrong</span>
        <span className="break-words text-[13px] leading-[18px] text-[var(--om-text-2)]">{message}</span>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={cn(SECONDARY, "h-7 px-[10px] text-[13px]")}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
