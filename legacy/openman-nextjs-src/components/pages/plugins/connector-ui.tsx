// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Shared connector pieces: the logo tile, the connector dialog (connect / reconnect / disconnect, example prompts,
 * details), the key form for key-auth apps, and the custom MCP / API dialog. Used by the Plugins page, Settings and
 * the composer's connectors menu.
 */
import { MessageCircleMore, Plug } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { stashPrompt } from "@/components/composer/handoff";
import { ModalShell, cn } from "@/components/modals/ModalShell";
import { toast } from "@/components/ui/toast";
import type { ConnectorView } from "@/lib/connectors/catalog";
import { addCustomConnector, connectApp, disconnectApp, removeCustomConnector, testMcpServer, useConnectorStore } from "@/lib/connectors/client";

/* ---------------------------------------------------------------- logo */

export function ConnectorGlyph({ size = 18 }: { size?: number }) {
  return <Plug size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** A connector's mark in a rounded tile. Falls back to a plug glyph when there is no logo or it fails to load. */
export function ConnectorLogo({ connector, tile = 36, mark = 20, radius = 9, className }: { connector: Pick<ConnectorView, "logo" | "name">; tile?: number; mark?: number; radius?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      style={{ width: tile, height: tile, borderRadius: radius }}
      className={cn("flex shrink-0 items-center justify-center border border-[var(--om-border)] bg-[var(--om-surface)] text-[var(--om-icon-1)]", className)}
    >
      {connector.logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={connector.logo} alt="" width={mark} height={mark} style={{ width: mark, height: mark }} className="object-contain" onError={() => setBroken(true)} />
      ) : (
        <ConnectorGlyph size={Math.round(mark * 0.9)} />
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- buttons */

const BTN = "inline-flex h-[36px] shrink-0 cursor-pointer items-center justify-center gap-[6px] rounded-[10px] px-[14px] text-[14px] font-medium leading-[20px] outline-none transition-opacity disabled:cursor-default disabled:opacity-50";
export const BTN_WHITE = cn(BTN, "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90");
export const BTN_OUTLINE = cn(BTN, "border border-[var(--om-border-strong)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]");
const INPUT = "h-[36px] w-full rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-[12px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-4)] focus:border-[var(--om-border-focus)]";

function Spinner() {
  return <span aria-hidden className="size-[14px] animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

/* ---------------------------------------------------------------- example prompts */

const PROMPTS: Record<string, string[]> = {
  gmail: ["Summarize the unread emails in my inbox from today and flag anything urgent.", "Draft a polite follow-up to the last email I sent that got no reply."],
  googlecalendar: ["What does my schedule look like tomorrow? Point out any conflicts.", "Find a free 30-minute slot next week and create a focus block."],
  googledrive: ["Find my most recent spreadsheet in Drive and summarize what it tracks.", "List the documents in Drive I edited this week."],
  notion: ["Search my Notion workspace for meeting notes from this week and summarize decisions.", "Create a Notion page for today's plan with three priorities."],
  slack: ["Summarize what happened in my most active Slack channel today.", "Post a short status update in Slack saying the report is ready."],
  github: ["List my open pull requests on GitHub and what each one is waiting on.", "Summarize the newest issues in my most active GitHub repository."],
  linear: ["Show my Linear issues that are in progress and their priorities.", "Create a Linear issue for the bug I describe next."],
  hubspot: ["Find the HubSpot deals that are closing this month.", "Look up the contact record for the person I name next."],
};

function promptsFor(c: ConnectorView): string[] {
  if (PROMPTS[c.slug]) return PROMPTS[c.slug];
  if (c.type === "mcp") return [`Use the ${c.name} tools to help with the task I describe next.`, `What can you do with ${c.name}? List its tools.`];
  if (c.type === "api") return [`Call the ${c.name} API and summarize what it returns.`, `Use ${c.name} to look up the item I describe next.`];
  return [`Use ${c.name} to ${c.description.charAt(0).toLowerCase()}${c.description.slice(1)}.`, `What can you do for me in ${c.name}?`];
}

function ChatGlyph() {
  return <MessageCircleMore size={20} strokeWidth={1.6} aria-hidden="true" className="text-[var(--om-icon-2)]" />;
}

/* ---------------------------------------------------------------- key form */

function KeyForm({ connector, asks, onDone }: { connector: ConnectorView; asks: { name: string; label: string; secret?: boolean; where?: string }[]; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = asks.every((a) => (values[a.name] ?? "").trim() !== "");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await connectApp(connector.slug, values);
    setBusy(false);
    if (res.ok) {
      toast("Connector added", "success");
      onDone();
    } else setError(res.error);
  };
  return (
    <form onSubmit={submit} className="mt-[16px] flex w-full max-w-[420px] flex-col gap-[10px]">
      {asks.map((a) => (
        <label key={a.name} className="flex flex-col gap-[4px] text-left">
          <input className={INPUT} type={a.secret ? "password" : "text"} placeholder={a.label} aria-label={a.label} autoComplete="off" value={values[a.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.name]: e.target.value }))} />
          {a.where ? <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">Find it in {connector.name}: {a.where}</span> : null}
        </label>
      ))}
      {error ? <p className="text-[13px] text-[var(--om-danger,#ef4444)]">{error}</p> : null}
      <button type="submit" className={cn(BTN_WHITE, "self-center")} disabled={!ready || busy}>
        {busy ? <Spinner /> : null}
        Connect
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- connector dialog */

export function ConnectorDialog({ connector: initial, onClose }: { connector: ConnectorView; onClose: () => void }) {
  const router = useRouter();
  const live = useConnectorStore((s) => s.data?.connectors.find((c) => c.slug === initial.slug)) ?? initial;
  const pending = useConnectorStore((s) => s.pending);
  const [asks, setAsks] = useState<{ name: string; label: string; secret?: boolean; where?: string }[] | null>(null);
  const [busy, setBusy] = useState<"connect" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCustom = live.type !== "app";
  const connecting = busy === "connect" || pending === live.slug;

  const connect = async () => {
    setError(null);
    setBusy("connect");
    const res = await connectApp(live.slug);
    setBusy(null);
    if (res.ok) toast("Connector added", "success");
    else if ("needs" in res) setAsks(res.needs);
    else if (!res.cancelled) setError(res.error);
  };

  const remove = async () => {
    setError(null);
    setBusy("remove");
    const res = isCustom && live.id ? await removeCustomConnector(live.id) : await disconnectApp(live.slug);
    setBusy(null);
    if (res.ok) {
      toast(`${live.name} removed`);
      if (isCustom) onClose();
    } else setError(res.error ?? "Couldn't remove it.");
  };

  const pickPrompt = (text: string) => {
    stashPrompt(text, "draft");
    onClose();
    router.push("/app");
  };

  const typeLabel = live.type === "app" ? "App" : live.type === "mcp" ? "MCP" : "API key";

  return (
    <ModalShell title={live.name} onClose={onClose} className="max-h-[calc(100vh-48px)] w-[680px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[20px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[24px] pb-[24px] pt-[56px] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col items-center text-center">
        <ConnectorLogo connector={live} tile={64} mark={36} radius={12} />
        <h2 className="mt-[16px] text-[20px] font-semibold leading-[28px] text-[var(--om-text-1)]">{live.name}</h2>
        <p className="mt-[6px] max-w-[600px] text-[14px] leading-[20px] text-[var(--om-text-3)]">{live.detail && isCustom ? `${live.description} · ${live.detail}` : live.description}</p>
        {asks ? (
          <KeyForm connector={live} asks={asks} onDone={() => setAsks(null)} />
        ) : live.connected ? (
          <div className="mt-[16px] flex items-center gap-[8px]">
            <span className="mr-[4px] inline-flex items-center gap-[6px] text-[13px] text-[var(--om-text-2)]">
              <span className="size-[7px] rounded-full bg-[var(--om-success,#22c55e)]" /> Connected
            </span>
            {!isCustom ? (
              <button type="button" className={BTN_OUTLINE} onClick={connect} disabled={!!busy} title="Sign in again or use another account">
                {connecting ? <Spinner /> : null}
                Reconnect
              </button>
            ) : null}
            <button type="button" className={BTN_OUTLINE} onClick={remove} disabled={!!busy}>
              {busy === "remove" ? <Spinner /> : null}
              {isCustom ? "Remove" : "Disconnect"}
            </button>
          </div>
        ) : isCustom ? (
          <div className="mt-[16px] flex flex-col items-center gap-[8px]">
            <span className="text-[13px] text-[var(--om-text-2)]">{live.status === "error" ? "Install failed on your computer." : "Installing…"}</span>
            <button type="button" className={BTN_OUTLINE} onClick={remove} disabled={!!busy}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className={cn(BTN_WHITE, "mt-[16px]")} onClick={connect} disabled={connecting}>
            {connecting ? <Spinner /> : null}
            {connecting ? "Waiting for sign-in…" : "Connect"}
          </button>
        )}
        {error ? <p className="mt-[10px] text-[13px] text-[var(--om-danger,#ef4444)]">{error}</p> : null}
        {connecting && !live.connected ? <p className="mt-[8px] text-[13px] text-[var(--om-text-3)]">Finish signing in in the window that opened. This updates by itself.</p> : null}
      </div>

      <h3 className="mt-[28px] text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">Example prompts</h3>
      <div className="mt-[12px] grid grid-cols-1 gap-[12px] sm:grid-cols-2">
        {promptsFor(live).map((p) => (
          <button key={p} type="button" onClick={() => pickPrompt(p)} className="flex min-h-[104px] cursor-pointer flex-col gap-[10px] rounded-[12px] border border-[var(--om-border)] p-[16px] text-left outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]">
            <ChatGlyph />
            <span className="line-clamp-2 text-[14px] leading-[20px] text-[var(--om-text-1)]">{p}</span>
          </button>
        ))}
      </div>

      {live.tools && live.tools.length > 0 ? (
        <>
          <h3 className="mt-[28px] text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">Tools</h3>
          <ul className="mt-[12px] flex flex-col divide-y divide-[var(--om-border)] rounded-[12px] border border-[var(--om-border)]">
            {live.tools.map((t) => (
              <li key={t.name} className="flex flex-col gap-[2px] px-[16px] py-[10px] text-left">
                <span className="font-mono text-[13px] text-[var(--om-text-1)]">{t.name}</span>
                {t.description ? <span className="line-clamp-2 text-[13px] leading-[18px] text-[var(--om-text-3)]">{t.description}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="mt-[28px] text-[16px] font-semibold leading-[22px] text-[var(--om-text-1)]">Details</h3>
      <div className="mt-[12px] grid grid-cols-2 gap-x-[16px] gap-y-[16px] rounded-[12px] border border-[var(--om-border)] p-[20px] text-left">
        <Detail label="Category" value={live.category} wide />
        <Detail label="Connector Type" value={typeLabel} />
        <Detail label="Author" value={isCustom ? "You" : live.name} />
      </div>
    </ModalShell>
  );
}

function Detail({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-[4px]", wide && "col-span-2")}>
      <span className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{label}</span>
      <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- custom connector dialog */

export type CustomMode = "mcp" | "mcp-command" | "api";

function parseLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*[:=]\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Splits a command line into words, honouring simple quotes. */
function splitArgs(text: string): string[] {
  return (text.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ""));
}

export function CustomConnectorDialog({ mode: initialMode, onClose }: { mode: CustomMode; onClose: () => void }) {
  const [mode, setMode] = useState<CustomMode>(initialMode);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [commandLine, setCommandLine] = useState("");
  const [extra, setExtra] = useState("");
  const [key, setKey] = useState("");
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<{ name: string; description?: string }[] | null>(null);

  const ready = name.trim() !== "" && (mode === "mcp-command" ? commandLine.trim() !== "" : url.trim() !== "");

  const test = async () => {
    setBusy("test");
    setError(null);
    setTools(null);
    const res = await testMcpServer(url.trim(), parseLines(extra));
    setBusy(null);
    if (res.ok) setTools(res.tools ?? []);
    else setError(res.error ?? "The connection test failed.");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy("save");
    setError(null);
    const words = splitArgs(commandLine.trim());
    const res =
      mode === "api"
        ? await addCustomConnector({ kind: "api", name: name.trim(), url: url.trim(), key: key || undefined, authHeader: authHeader.trim() || "Authorization" })
        : mode === "mcp"
          ? await addCustomConnector({ kind: "mcp", transport: "http", name: name.trim(), url: url.trim(), headers: parseLines(extra) })
          : await addCustomConnector({ kind: "mcp", transport: "command", name: name.trim(), command: words[0], args: words.slice(1), headers: parseLines(extra) });
    setBusy(null);
    if (res.ok) {
      toast("Connector added", "success");
      onClose();
    } else setError(res.detail ? `${res.error}\n${res.detail}` : (res.error ?? "Couldn't add it."));
  };

  const TABS: { id: CustomMode; label: string }[] = [
    { id: "mcp", label: "MCP server URL" },
    { id: "mcp-command", label: "MCP command" },
    { id: "api", label: "Custom API" },
  ];

  return (
    <ModalShell title="Add a custom connector" onClose={onClose} dismissOnOutside={!busy} className="w-[520px] max-w-[calc(100vw-32px)] rounded-[20px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <form onSubmit={save} className="flex flex-col gap-[14px]">
        <h2 className="text-[18px] font-semibold leading-[26px] text-[var(--om-text-1)]">{mode === "api" ? "Add a custom API" : "Add a custom MCP server"}</h2>
        <div className="flex gap-[6px]" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={mode === t.id} onClick={() => { setMode(t.id); setTools(null); setError(null); }} className={cn("h-[30px] cursor-pointer rounded-[8px] px-[10px] text-[13px] outline-none", mode === t.id ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-2)] hover:bg-[var(--om-fill-subtle)]")}>
              {t.label}
            </button>
          ))}
        </div>
        <input className={INPUT} autoFocus placeholder="Name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        {mode === "mcp-command" ? (
          <>
            <input className={cn(INPUT, "font-mono text-[13px]")} placeholder="npx -y @modelcontextprotocol/server-everything" aria-label="Command" value={commandLine} onChange={(e) => setCommandLine(e.target.value)} />
            <textarea className={cn(INPUT, "h-[72px] resize-none py-[8px] font-mono text-[13px]")} placeholder={"Environment variables (optional), one per line\nAPI_TOKEN=..."} aria-label="Environment variables" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Runs on your agent&apos;s computer through its own MCP settings. Values are stored encrypted.</p>
          </>
        ) : (
          <>
            <input className={INPUT} placeholder={mode === "api" ? "Base URL, like https://api.example.com" : "https://example.com/mcp"} aria-label={mode === "api" ? "Base URL" : "Server URL"} inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            {mode === "mcp" ? (
              <textarea className={cn(INPUT, "h-[72px] resize-none py-[8px] font-mono text-[13px]")} placeholder={"Headers (optional), one per line\nAuthorization: Bearer ..."} aria-label="Headers" value={extra} onChange={(e) => setExtra(e.target.value)} />
            ) : (
              <div className="flex gap-[8px]">
                <input className={cn(INPUT, "w-[160px] shrink-0")} placeholder="Header" aria-label="Key header" value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} />
                <input className={INPUT} type="password" autoComplete="off" placeholder="API key (optional)" aria-label="API key" value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
            )}
            {mode === "api" ? <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">The key is stored encrypted and added to each request. The agent calls this API with one HTTP tool.</p> : null}
          </>
        )}
        {tools ? (
          <div className="rounded-[10px] border border-[var(--om-border)] p-[10px] text-[13px] text-[var(--om-text-2)]">
            <div className="mb-[4px] text-[var(--om-text-1)]">Connected · {tools.length} tool{tools.length === 1 ? "" : "s"}</div>
            <div className="line-clamp-3 font-mono text-[12px]">{tools.map((t) => t.name).join(", ")}</div>
          </div>
        ) : null}
        {error ? <p className="whitespace-pre-wrap break-words text-[13px] text-[var(--om-danger,#ef4444)]">{error}</p> : null}
        <div className="flex items-center justify-end gap-[8px] pt-[4px]">
          {mode === "mcp" ? (
            <button type="button" className={cn(BTN_OUTLINE, "mr-auto")} onClick={test} disabled={!url.trim() || !!busy}>
              {busy === "test" ? <Spinner /> : null}
              Test connection
            </button>
          ) : null}
          <button type="button" className={BTN_OUTLINE} onClick={onClose} disabled={busy === "save"}>
            Cancel
          </button>
          <button type="submit" className={BTN_WHITE} disabled={!ready || !!busy}>
            {busy === "save" ? <Spinner /> : null}
            {busy === "save" ? "Installing…" : "Add"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
