"use client";

/**
 * Live preview of the website a task builds.
 * Toolbar: device menu (desktop / mobile), path bar, open in new tab, reload, more menu, versions, Publish popover,
 * fullscreen. States: building (agent has not reported a site), live, stopped, paused ("click to wake").
 *
 * Click-to-edit: the "Select element" button talks to the inspector the preview server injects (preview only, never the
 * published site); the selection opens `ElementEditor`, which restyles live and sends a scoped follow-up to this task.
 * Secrets the agent asked for show as a card above the frame.
 *
 * Mount: `<WebsitePreview taskId={id} />` in the task's right panel. It renders nothing for a task that builds no
 * site, so it can be mounted for every task; `useTaskWebsite(taskId)` tells a parent whether there is one.
 */
import { useTasksStore } from "@/components/shell/tasks-store";
import { ChevronDown, Code2, Copy, Download, ExternalLink, History, LayoutDashboard, Maximize2, Minimize2, Monitor, MoreHorizontal, MousePointerClick, Power, RotateCw, Share, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { ElementEditor, type Selection } from "@/components/pages/websites/ElementEditor";
import { PublishPanel, VersionsList } from "@/components/pages/websites/PublishPanel";
import { SecretRequestCard } from "@/components/pages/websites/SiteSecrets";
import { copyWebsite, downloadCode, saveCheckpoint, startPreview, stopPreview, websiteForTask } from "@/lib/websites/client";
import type { PreviewState, Website } from "@/lib/websites/types";

const POLL_BUILDING_MS = 4000;
const POLL_LIVE_MS = 15000;

/** The site a task builds, kept fresh by polling. `site` is null until known and for tasks without one. */
export function useTaskWebsite(taskId: string | null | undefined) {
  const [site, setSite] = useState<Website | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [known, setKnown] = useState(false);
  const tick = useRef(0);
  const liveRef = useRef(false);
  useEffect(() => {
    liveRef.current = preview?.state === "live";
  }, [preview?.state]);

  const refresh = useCallback(async () => {
    if (!taskId) return;
    const n = ++tick.current;
    try {
      const r = await websiteForTask(taskId);
      if (n !== tick.current) return;
      setSite(r.site);
      setPreview(r.preview);
    } catch {
      // Keep the last state; the next poll tries again.
    } finally {
      if (n === tick.current) setKnown(true);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    let timer = 0;
    const loop = async () => {
      await refresh();
      if (!alive) return;
      timer = window.setTimeout(loop, document.hidden ? POLL_LIVE_MS * 2 : liveRef.current ? POLL_LIVE_MS : POLL_BUILDING_MS);
    };
    void loop();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [taskId, refresh]);

  return { site, preview, known, refresh, setSite, setPreview };
}

const TOOL_BTN =
  "flex h-[32px] shrink-0 items-center justify-center gap-[4px] rounded-[8px] px-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)] disabled:opacity-40";

export function WebsitePreview({ taskId, className }: { taskId: string; className?: string }) {
  const router = useRouter();
  const { site, preview, known, setSite, setPreview, refresh } = useTaskWebsite(taskId);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [path, setPath] = useState("/");
  const [draftPath, setDraftPath] = useState("/");
  const [frameKey, setFrameKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [waking, setWaking] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const lastUrl = useRef<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [inspectorReady, setInspectorReady] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const previewOrigin = (() => {
    try {
      return preview?.url ? new URL(preview.url).origin : null;
    } catch {
      return null;
    }
  })();

  // Messages from the preview's inspector: only from that frame and that origin.
  useEffect(() => {
    if (!previewOrigin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== previewOrigin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { om?: unknown; type?: unknown } | null;
      if (!d || d.om !== true) return;
      if (d.type === "ready") setInspectorReady(true);
      else if (d.type === "selected") {
        setSelection(d as unknown as Selection);
        setInspecting(false);
        frameRef.current?.contentWindow?.postMessage({ om: true, type: "inspect", on: false }, previewOrigin);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewOrigin]);

  const toFrame = (msg: Record<string, unknown>) => {
    if (previewOrigin) frameRef.current?.contentWindow?.postMessage({ om: true, ...msg }, previewOrigin);
  };

  // Reload the frame when the preview URL first appears or changes.
  useEffect(() => {
    if (preview?.url && preview.url !== lastUrl.current) {
      lastUrl.current = preview.url;
      setFrameKey((k) => k + 1);
    }
  }, [preview?.url]);

  // Reload it again when a run of the task ends: the agent usually rewrote the site while the starter page was showing.
  const taskStatus = useTasksStore((st) => st.tasks.find((t) => t.id === taskId)?.status);
  const lastStatus = useRef(taskStatus);
  useEffect(() => {
    const was = lastStatus.current;
    lastStatus.current = taskStatus;
    const active = (x: string | undefined) => x === "running" || x === "waking";
    if (active(was) && !active(taskStatus) && lastUrl.current) setFrameKey((k) => k + 1);
  }, [taskStatus]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (!known || !site) return null;

  const url = preview?.url ?? site.previewUrl;
  const live = preview?.state === "live" && !!url;
  const src = url ? `${url.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}` : null;

  const wake = async () => {
    setWaking(true);
    try {
      const r = await startPreview(site.id);
      setSite(r.site);
      setPreview(r.preview);
      setFrameKey((k) => k + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The preview could not start.", "error");
    } finally {
      setWaking(false);
    }
  };

  const stop = async () => {
    try {
      setSite((await stopPreview(site.id)).site);
      setPreview({ state: "stopped", url: null });
    } catch (err) {
      toast(err instanceof Error ? err.message : "The preview could not be stopped.", "error");
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--om-bg)]",
        fullscreen && "fixed inset-0 z-[60]",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex h-[52px] shrink-0 items-center gap-[6px] border-b border-[var(--om-border)] px-[12px]">
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={cn(TOOL_BTN, "h-[34px] rounded-[10px] border border-[var(--om-border)] px-[8px]")} aria-label="Preview size">
              {device === "desktop" ? <Monitor size={16} aria-hidden /> : <Smartphone size={16} aria-hidden />}
              <ChevronDown size={14} aria-hidden />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-[180px]">
            <MenuItem onSelect={() => setDevice("desktop")}>
              <Monitor size={16} aria-hidden /> Desktop
            </MenuItem>
            <MenuItem onSelect={() => setDevice("mobile")}>
              <Smartphone size={16} aria-hidden /> Mobile
            </MenuItem>
          </MenuContent>
        </Menu>

        <form
          className="flex h-[34px] min-w-0 flex-1 items-center gap-[4px] rounded-[10px] border border-[var(--om-border)] pl-[10px] pr-[2px]"
          onSubmit={(e) => {
            e.preventDefault();
            const p = draftPath.trim() || "/";
            setPath(p.startsWith("/") ? p : `/${p}`);
            setFrameKey((k) => k + 1);
          }}
        >
          <input
            value={draftPath}
            onChange={(e) => setDraftPath(e.target.value)}
            aria-label="Page path"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--om-text-1)] outline-none"
          />
          <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab" className={cn(TOOL_BTN, "h-[28px] px-[5px]", !src && "pointer-events-none opacity-40")}>
            <ExternalLink size={15} aria-hidden />
          </a>
          <button type="button" aria-label="Reload" disabled={!src} onClick={() => setFrameKey((k) => k + 1)} className={cn(TOOL_BTN, "h-[28px] px-[5px]")}>
            <RotateCw size={15} aria-hidden />
          </button>
        </form>

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={TOOL_BTN} aria-label="More">
              <MoreHorizontal size={18} aria-hidden />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="w-[220px]">
            <MenuItem asChild>
              <Link href={`/app/website/${site.id}`}>
                <LayoutDashboard size={16} aria-hidden /> Open dashboard
              </Link>
            </MenuItem>
            <MenuItem
              onSelect={() =>
                void saveCheckpoint(site.id, "Saved from preview")
                  .then(() => toast("Version saved.", "success"))
                  .catch((e: Error) => toast(e.message, "error"))
              }
            >
              <History size={16} aria-hidden /> Save version
            </MenuItem>
            <MenuItem onSelect={() => downloadCode(site.id)}>
              <Download size={16} aria-hidden /> Download code
            </MenuItem>
            <MenuItem
              onSelect={() =>
                void copyWebsite(site.id)
                  .then(({ site: copy }) => {
                    toast("Copy made.", "success");
                    router.push(`/app/website/${copy.id}`);
                  })
                  .catch((e: Error) => toast(e.message, "error"))
              }
            >
              <Copy size={16} aria-hidden /> Make a copy
            </MenuItem>
            <MenuSeparator />
            {live ? (
              <MenuItem onSelect={() => void stop()}>
                <Power size={16} aria-hidden /> Stop preview
              </MenuItem>
            ) : (
              <MenuItem onSelect={() => void wake()}>
                <Code2 size={16} aria-hidden /> Start preview
              </MenuItem>
            )}
          </MenuContent>
        </Menu>

        {inspectorReady && live ? (
          <button
            type="button"
            className={cn(TOOL_BTN, inspecting && "bg-[var(--om-fill-strong)] text-[var(--om-icon-accent)]")}
            aria-label="Select an element to edit"
            aria-pressed={inspecting}
            title="Select an element to edit"
            onClick={() => {
              const next = !inspecting;
              setInspecting(next);
              if (next) setSelection(null);
              toFrame({ type: "inspect", on: next });
            }}
          >
            <MousePointerClick size={17} aria-hidden />
          </button>
        ) : null}

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={TOOL_BTN} aria-label="Versions">
              <History size={17} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] p-0">
            <div className="px-[16px] pb-[4px] pt-[14px] text-[15px] font-semibold text-[var(--om-text-1)]">Versions</div>
            <VersionsList site={site} compact onRolledBack={() => setFrameKey((k) => k + 1)} />
          </PopoverContent>
        </Popover>

        <Popover open={publishOpen} onOpenChange={setPublishOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex h-[34px] shrink-0 items-center gap-[6px] rounded-[10px] border border-[var(--om-border)] bg-[var(--om-surface)] px-[12px] text-[14px] font-medium text-[var(--om-text-1)] outline-none hover:bg-[var(--om-fill)]"
            >
              <Share size={15} aria-hidden />
              Publish
              {site.status !== "published" && site.status !== "building" ? <span className="absolute -right-[2px] -top-[2px] size-[8px] rounded-full bg-[var(--om-icon-accent)]" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[400px] p-0">
            <PublishPanel site={site} onChange={(s) => setSite(s)} canPublish={site.status !== "building"} />
          </PopoverContent>
        </Popover>

        <button type="button" className={TOOL_BTN} aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => setFullscreen((f) => !f)}>
          {fullscreen ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        </button>
      </div>

      {preview?.needsSecrets?.length ? <SecretRequestCard siteId={site.id} requests={preview.needsSecrets} onSaved={() => void refresh()} /> : null}

      {/* Frame */}
      <div className={cn("relative flex min-h-0 flex-1 justify-center overflow-hidden", device === "mobile" && "bg-[var(--om-fill)] py-[16px]")}>
        {live && src ? (
          <iframe
            key={frameKey}
            ref={frameRef}
            onLoad={() => {
              setInspectorReady(false);
              setInspecting(false);
              setSelection(null);
              toFrame({ type: "hello" });
            }}
            src={src}
            title={`${site.name} preview`}
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            className={cn(
              "h-full border-0 bg-white",
              device === "desktop" ? "w-full" : "w-[390px] max-w-full rounded-[20px] border border-[var(--om-border)] shadow-[0_8px_24px_rgba(0,0,0,0.25)]",
            )}
          />
        ) : preview?.state === "paused" || preview?.state === "stopped" ? (
          <button type="button" onClick={() => void wake()} disabled={waking} className="flex size-full flex-col items-center justify-center gap-[10px] text-center outline-none">
            <span className="flex size-[44px] items-center justify-center rounded-full border border-[var(--om-border)] text-[var(--om-icon-2)]">
              <Power size={18} aria-hidden />
            </span>
            <span className="text-[15px] font-medium text-[var(--om-text-1)]">{waking ? "Starting up…" : preview.state === "paused" ? "Site is asleep" : "Preview is off"}</span>
            <span className="text-[13px] text-[var(--om-text-3)]">{waking ? "Booting the desktop and the dev server." : "Click to start it again"}</span>
          </button>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-[12px] text-center">
            <div className="h-[6px] w-[160px] overflow-hidden rounded-full bg-[var(--om-fill)]">
              <div className="h-full w-1/3 animate-[om-site-bar_1.4s_ease-in-out_infinite] rounded-full bg-[var(--om-icon-3)]" />
            </div>
            <span className="text-[15px] font-medium text-[var(--om-text-1)]">Putting your site together</span>
            <span className="max-w-[300px] text-[13px] leading-[18px] text-[var(--om-text-3)]">You will see it here the moment the first page loads.</span>
            <style>{`@keyframes om-site-bar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          </div>
        )}
        {selection && live ? (
          <ElementEditor
            key={selection.selector}
            taskId={taskId}
            selection={selection}
            onStyle={(styles) => toFrame({ type: "style", selector: selection.selector, styles })}
            onClose={() => {
              setSelection(null);
              toFrame({ type: "clear" });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
