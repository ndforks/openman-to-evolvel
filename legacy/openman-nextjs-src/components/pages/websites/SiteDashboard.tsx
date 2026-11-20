// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * One site's dashboard: Overview (live preview, URLs, preview controls), Versions (checkpoints with rollback),
 * Analytics (page views logged by the published site on the user's computer), Database (full-stack sites),
 * Settings (general, AI, secrets, schedules, custom domains where the Orgo plan allows, code, copy, delete).
 */
import { ArrowLeft, Copy, Download, ExternalLink, MessageSquare, Power, Share, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { brand } from "@/config/brand";
import { copyWebsite, deleteWebsite, downloadCode, editInNewTask, getDomains, getWebsite, startPreview, stopPreview, timeAgo, updateWebsite } from "@/lib/websites/client";
import type { PreviewState, Website } from "@/lib/websites/types";
import { PageShell } from "../ui";
import { siteStatusLabel } from "./MySites";
import { CopyField, PublishPanel, VersionsList, VisibilitySelect } from "./PublishPanel";
import { SiteAnalytics } from "./SiteAnalytics";
import { SiteDatabase } from "./SiteDatabase";
import { SiteDomains } from "./SiteDomains";
import { SiteSchedules } from "./SiteSchedules";
import { SiteSecrets } from "./SiteSecrets";
import { BTN, Card, Row } from "./site-ui";

type Tab = "overview" | "analytics" | "database" | "versions" | "settings";
const TABS: { id: Tab; label: string; fullstack?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "database", label: "Database", fullstack: true },
  { id: "versions", label: "Versions" },
  { id: "settings", label: "Settings" },
];
type Section = "general" | "secrets" | "schedules" | "domains";

export function SiteDashboard({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [site, setSite] = useState<Website | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [frame, setFrame] = useState(0);
  const [section, setSection] = useState<Section>("general");
  // Custom domains appear only when the user's Orgo plan lets them add one here (or one already exists).
  const [domainsOk, setDomainsOk] = useState(false);
  useEffect(() => {
    let alive = true;
    getDomains(siteId)
      .then((d) => alive && setDomainsOk(d.available || d.domains.length > 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [siteId]);

  const load = useCallback(async () => {
    try {
      const r = await getWebsite(siteId);
      setSite(r.site);
      setPreview(r.preview);
      setName(r.site.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This website could not be loaded.");
    }
  }, [siteId]);

  useEffect(() => {
    let alive = true;
    getWebsite(siteId)
      .then((r) => {
        if (!alive) return;
        setSite(r.site);
        setPreview(r.preview);
        setName(r.site.name);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "This website could not be loaded."));
    return () => {
      alive = false;
    };
  }, [siteId]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <PageShell title="Website">
        <div className="flex flex-1 flex-col items-center justify-center gap-[12px] py-[80px] text-[14px] text-[var(--om-text-2)]">
          {error}
          <Link href="/app/websites" className={BTN}>
            Back to Websites
          </Link>
        </div>
      </PageShell>
    );
  }
  if (!site) return <PageShell title="Website">{null}</PageShell>;

  const status = siteStatusLabel(site);
  const live = preview?.state === "live" && !!preview.url;

  return (
    <PageShell
      title={
        <span className="flex items-center gap-[10px]">
          <Link href="/app/websites" aria-label="Back to Websites" className="flex size-[28px] items-center justify-center rounded-[8px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          {site.name}
          <span className="flex items-center gap-[6px] text-[13px] font-normal text-[var(--om-text-2)]">
            <span className={cn("size-[6px] rounded-full", status.tone)} />
            {status.label}
          </span>
        </span>
      }
      actions={
        <>
          {site.taskId ? (
            <Link href={`/app/task/${site.taskId}`} className={BTN}>
              <MessageSquare size={14} aria-hidden /> Open task
            </Link>
          ) : null}
          {site.publishedUrl ? (
            <a href={site.publishedUrl} target="_blank" rel="noopener noreferrer" className={BTN}>
              <ExternalLink size={14} aria-hidden /> Visit
            </a>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={cn(BTN, "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:bg-[var(--om-btn-primary)] hover:opacity-90")}>
                <Share size={14} aria-hidden /> Publish
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[400px] p-0">
              <PublishPanel site={site} onChange={setSite} canPublish={site.status !== "building"} />
            </PopoverContent>
          </Popover>
        </>
      }
    >
      <div className="mx-auto flex w-[960px] max-w-full flex-col gap-[16px] pb-[40px]">
        <div role="tablist" className="flex gap-[4px] border-b border-[var(--om-border)]">
          {TABS.filter((t) => !t.fullstack || site.template === "fullstack").map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px h-[38px] border-b-2 px-[10px] text-[14px] font-medium outline-none transition-colors",
                tab === t.id ? "border-[var(--om-text-1)] text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-1)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="grid grid-cols-1 gap-[16px] min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="self-start overflow-hidden p-0">
              <div className="aspect-[16/10] w-full overflow-hidden bg-[var(--om-card)]">
                {live ? (
                  <div className="h-[200%] w-[200%] origin-top-left scale-50">
                    <iframe key={frame} src={preview!.url!} title={`${site.name} preview`} className="size-full border-0 bg-white" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null || site.status === "building"}
                    onClick={() =>
                      void act("wake", async () => {
                        const r = await startPreview(site.id);
                        setSite(r.site);
                        setPreview(r.preview);
                        setFrame((f) => f + 1);
                      })
                    }
                    className="flex size-full flex-col items-center justify-center gap-[8px] text-[var(--om-text-2)]"
                  >
                    <Power size={20} aria-hidden />
                    <span className="text-[14px] font-medium text-[var(--om-text-1)]">
                      {site.status === "building" ? "The agent is still building" : busy === "wake" ? "Waking up…" : preview?.state === "paused" ? "Website paused" : "Preview stopped"}
                    </span>
                    {site.status !== "building" ? <span className="text-[12px]">Click to wake</span> : null}
                  </button>
                )}
              </div>
            </Card>
            <div className="flex flex-col gap-[16px]">
              <Card title="Published site">
                {site.publishedUrl ? (
                  <div className="flex flex-col gap-[8px]">
                    <CopyField value={site.publishedUrl} />
                    <span className="text-[12px] text-[var(--om-text-3)]">Published {timeAgo(site.publishedAt)}{site.publishedSha ? ` from ${site.publishedSha.slice(0, 7)}` : ""}</span>
                  </div>
                ) : (
                  <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Not published yet. Use Publish to put it online at its own address.</p>
                )}
              </Card>
              <Card title="Preview">
                {site.previewUrl ? <CopyField value={site.previewUrl} /> : <p className="text-[13px] text-[var(--om-text-3)]">No preview running.</p>}
                <div className="mt-[10px] flex flex-wrap gap-[8px]">
                  {live ? (
                    <button
                      type="button"
                      className={BTN}
                      disabled={busy !== null}
                      onClick={() =>
                        void act("stop", async () => {
                          setSite((await stopPreview(site.id)).site);
                          setPreview({ state: "stopped", url: null });
                        })
                      }
                    >
                      <Power size={14} aria-hidden /> Stop preview
                    </button>
                  ) : null}
                  <button type="button" className={BTN} onClick={() => downloadCode(site.id)}>
                    <Download size={14} aria-hidden /> Download code
                  </button>
                </div>
              </Card>
              <Card title="Details">
                <dl className="grid grid-cols-[auto_1fr] gap-x-[12px] gap-y-[6px] text-[12px] leading-[16px]">
                  <dt className="text-[var(--om-text-3)]">Template</dt>
                  <dd className="truncate text-[var(--om-text-1)]">
                    {site.template === "vite-react" ? "Vite + React" : site.template === "static" ? "Static HTML" : site.template === "fullstack" ? "Full-stack (Node + SQLite)" : "Not chosen yet"}
                  </dd>
                  {site.features.length ? (
                    <>
                      <dt className="text-[var(--om-text-3)]">Uses</dt>
                      <dd className="truncate text-[var(--om-text-1)]">{site.features.join(", ")}</dd>
                    </>
                  ) : null}
                  <dt className="text-[var(--om-text-3)]">Folder</dt>
                  <dd className="truncate font-mono text-[var(--om-text-1)]">{site.folder}</dd>
                  <dt className="text-[var(--om-text-3)]">Created</dt>
                  <dd className="text-[var(--om-text-1)]">{new Date(site.createdAt).toLocaleString()}</dd>
                </dl>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === "analytics" ? <SiteAnalytics site={site} /> : null}
        {tab === "database" && site.template === "fullstack" ? <SiteDatabase site={site} /> : null}

        {tab === "versions" ? (
          <Card title="Versions">
            <p className="mb-[12px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Every change the agent finishes is saved as a version. Restoring one keeps the newer versions, so it can be undone.</p>
            <VersionsList site={site} onRolledBack={() => void load()} />
          </Card>
        ) : null}

        {tab === "settings" ? (
          <div className="flex flex-col gap-[16px]">
            <div className="flex gap-[4px]">
              {(["general", "secrets", "schedules", ...(domainsOk ? ["domains"] : [])] as Section[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSection(s)}
                  className={cn("h-[30px] rounded-[8px] px-[10px] text-[13px] font-medium capitalize", section === s ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-1)]")}
                >
                  {s}
                </button>
              ))}
            </div>
            {section === "secrets" ? <SiteSecrets site={site} /> : null}
            {section === "schedules" ? <SiteSchedules site={site} /> : null}
            {section === "domains" && domainsOk ? <SiteDomains site={site} /> : null}
            {section === "general" ? (
            <>
            <Card title="General">
              <Row label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-[34px] w-[260px] rounded-[9px] border border-[var(--om-border)] bg-transparent px-[10px] text-[14px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]"
                />
                <button type="button" className={BTN} disabled={busy !== null || !name.trim() || name.trim() === site.name} onClick={() => void act("rename", async () => setSite((await updateWebsite(site.id, { name })).site))}>
                  Save
                </button>
              </Row>
              <Row label="General access" hint="Who can open the published site.">
                <div className="w-[260px]">
                  <VisibilitySelect site={site} onChange={setSite} />
                </div>
              </Row>
              <Row label="Auto-publish" hint="Republish after each saved version or rollback.">
                <Switch checked={site.autoPublish} onCheckedChange={(v) => void act("auto", async () => setSite((await updateWebsite(site.id, { autoPublish: v })).site))} />
              </Row>
              <Row label={`“Made with ${brand.name}” badge`} hint="Shown in the corner of the published site.">
                <Switch checked={site.showBadge} onCheckedChange={(v) => void act("badge", async () => setSite((await updateWebsite(site.id, { showBadge: v })).site))} />
              </Row>
              {site.template === "fullstack" ? (
                <Row label="AI features in the app" hint="Signed-in visitors can use the site's AI (up to 200 calls a day). Billed to your Orgo account like your agent's model use.">
                  <Switch checked={site.aiEnabled} onCheckedChange={(v) => void act("ai", async () => setSite((await updateWebsite(site.id, { aiEnabled: v })).site))} />
                </Row>
              ) : null}
            </Card>
            <Card title="Edit in new task">
              <div className="flex gap-[8px]">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the next change"
                  className="h-[34px] min-w-0 flex-1 rounded-[9px] border border-[var(--om-border)] bg-transparent px-[10px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]"
                />
                <button
                  type="button"
                  className={BTN}
                  disabled={busy !== null || !prompt.trim()}
                  onClick={() =>
                    void act("edit", async () => {
                      const { task } = await editInNewTask(site.id, prompt.trim());
                      router.push(`/app/task/${task.id}`);
                    })
                  }
                >
                  <MessageSquare size={14} aria-hidden /> Start
                </button>
              </div>
            </Card>
            <Card title="Code and copies">
              <Row label="Download code" hint="The site's source as a .tar.gz archive.">
                <button type="button" className={BTN} onClick={() => downloadCode(site.id)}>
                  <Download size={14} aria-hidden /> Download
                </button>
              </Row>
              <Row label="Make a copy" hint="A new site from these files, with its own preview and address.">
                <button
                  type="button"
                  className={BTN}
                  disabled={busy !== null}
                  onClick={() =>
                    void act("copy", async () => {
                      const { site: copy } = await copyWebsite(site.id);
                      toast("Copy made.", "success");
                      router.push(`/app/website/${copy.id}`);
                    })
                  }
                >
                  <Copy size={14} aria-hidden /> Make a copy
                </button>
              </Row>
            </Card>
            <Card title="Danger zone">
              <Row label="Delete website" hint="Unpublishes it, stops the preview and deletes its files from your computer.">
                <button
                  type="button"
                  className={cn(BTN, "border-[var(--om-danger)] text-[var(--om-danger)]")}
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
                    void act("delete", async () => {
                      await deleteWebsite(site.id);
                      router.push("/app/websites");
                    });
                  }}
                >
                  <Trash2 size={14} aria-hidden /> Delete
                </button>
              </Row>
            </Card>
            </>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

