"use client";

/**
 * A skill opened from a card: chips, title, author and date, "Try it out",
 * the description, and the actions in the top-right corner (switch, download, more, close). "Edit SKILL.md" swaps the
 * body for an editor that saves straight to the computer. An official skill that is not installed shows "Add" instead.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, ExternalLink, FileText, Loader2, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { stashPrompt } from "@/components/composer/handoff";
import { ModalShell } from "@/components/modals/ModalShell";
import { useThemeClass } from "@/components/modals/theme";
import { Toggle } from "@/components/settings/ui";
import { toast } from "@/components/ui/toast";
import { downloadUrl, getProjectSkills, getSkill, installOfficial, removeSkill, saveFiles, setEnabled, setProjectSkills, skillPrefix, useSkills, type SkillDetail } from "@/lib/skills/client";
import type { OfficialSkill } from "@/lib/skills/official";
import { cx } from "../cx";

import { SkillCover, prettyName } from "./SkillCover";

const CHIP = "flex h-[22px] items-center rounded-[5px] bg-[var(--om-fill)] px-[6px] text-[13px] leading-[18px] text-[var(--om-text-2)]";
const ICON_BTN = "flex size-[30px] cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] disabled:opacity-40";
const MENU = "z-[130] min-w-[200px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]";
const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center gap-[8px] rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

function fmtDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SkillDetailDialog({ name, official, onClose }: { name: string; official?: OfficialSkill; onClose: () => void }) {
  const router = useRouter();
  const themeClass = useThemeClass();
  const { skills } = useSkills();
  const installed = skills?.find((s) => s.name === name) ?? null;
  const [detail, setDetail] = useState<(SkillDetail & { projects: string[] }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "save" | "install" | "delete">(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!installed) return;
    let live = true;
    getSkill(name)
      .then((d) => live && setDetail(d))
      .catch((err: Error) => live && setLoadError(err.message));
    return () => {
      live = false;
    };
  }, [name, installed?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d: { projects?: { id: string; name: string }[] }) => setProjects(d.projects ?? []))
      .catch(() => undefined);
  }, []);

  const skillMd = useMemo(() => detail?.files.find((f) => f.path === "SKILL.md")?.content ?? "", [detail]);
  const body = useMemo(() => skillMd.replace(/^---[\s\S]*?\n---\s*\n?/, "").trim(), [skillMd]);
  const title = official?.title ?? prettyName(name);
  const description = installed?.description || official?.description || "";
  const chips = official?.categories ?? [installed?.category, ...(installed?.tags ?? [])].filter((c): c is string => !!c).slice(0, 3);
  const author = installed?.source === "builtin" || installed?.hubSource === "official" ? "Hermes" : official ? official.publisher : installed?.source === "local" ? "You" : (installed?.author ?? installed?.hubSource ?? "Community");

  const tryIt = () => {
    stashPrompt(skillPrefix(name), "draft");
    onClose();
    router.push("/app");
  };

  const install = async () => {
    if (!official) return;
    setBusy("install");
    try {
      await installOfficial(official.name);
      toast(`${official.title} added to your skills.`, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await saveFiles(name, [{ path: "SKILL.md", content: draft }]);
      setDetail((d) => (d ? { ...d, files: d.files.map((f) => (f.path === "SKILL.md" ? { ...f, content: draft } : f)) } : d));
      setEditing(false);
      toast("Skill saved to your computer.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${title} from your computer?`)) return;
    setBusy("delete");
    try {
      await removeSkill(name);
      toast(`${title} deleted.`, "success");
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(null);
    }
  };

  const toggleProject = async (projectId: string) => {
    try {
      const current = (await getProjectSkills(projectId)).skills;
      const next = current.includes(name) ? current.filter((s) => s !== name) : [...current, name];
      await setProjectSkills(projectId, next);
      setDetail((d) => (d ? { ...d, projects: next.includes(name) ? [...d.projects, projectId] : d.projects.filter((p) => p !== projectId) } : d));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <ModalShell title={title} onClose={onClose} closeButton={false} className="flex max-h-[86vh] w-[938px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[20px] border border-[var(--om-border)] bg-[var(--om-surface)] shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
      <div className="flex shrink-0 items-center justify-end gap-[6px] px-[28px] pt-[24px]">
        {installed ? <Toggle checked={installed.enabled} onCheckedChange={(next) => void setEnabled(name, next).catch((err: Error) => toast(err.message, "error"))} label={`Enable ${title}`} /> : null}
        {installed ? (
          <a href={downloadUrl(name)} download className={ICON_BTN} aria-label="Download skill">
            <Download size={18} strokeWidth={1.8} />
          </a>
        ) : null}
        {installed ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={ICON_BTN} aria-label="More">
              <MoreHorizontal size={18} strokeWidth={1.8} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={cx(themeClass, MENU)}>
                <DropdownMenu.Item className={MENU_ITEM} onSelect={() => { setDraft(skillMd); setEditing(true); }} disabled={!detail}>
                  Edit SKILL.md
                </DropdownMenu.Item>
                {projects.length ? (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger className={MENU_ITEM}>Add to project</DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent sideOffset={6} className={cx(themeClass, MENU)}>
                        {projects.map((p) => (
                          <DropdownMenu.CheckboxItem key={p.id} className={MENU_ITEM} checked={!!detail?.projects.includes(p.id)} onSelect={(e) => { e.preventDefault(); void toggleProject(p.id); }}>
                            <span className="w-[14px]">{detail?.projects.includes(p.id) ? "✓" : ""}</span>
                            {p.name}
                          </DropdownMenu.CheckboxItem>
                        ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                ) : null}
                {installed.source !== "builtin" ? (
                  <DropdownMenu.Item className={cx(MENU_ITEM, "text-[var(--om-danger)]")} onSelect={() => void remove()}>
                    Delete
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
        <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[36px] pb-[32px]">
        <div className="relative flex gap-[24px] border-b border-[var(--om-border)] pb-[24px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            {chips.length ? (
              <div className="flex flex-wrap gap-[6px]">
                {chips.map((c) => (
                  <span key={c} className={CHIP}>
                    {prettyName(c)}
                  </span>
                ))}
              </div>
            ) : null}
            <h2 className="text-[24px] font-semibold leading-[32px] text-[var(--om-text-1)]">{title}</h2>
            <div className="flex items-center gap-[8px] text-[15px] leading-[20px] text-[var(--om-text-2)]">
              <span className="flex items-center gap-[6px] text-[var(--om-text-1)]">
                {author === "Hermes" ? <span className="size-[12px] rounded-full bg-[#6E56CF]" /> : null}
                {author}
              </span>
              {installed ? (
                <>
                  <span className="h-[12px] w-px bg-[var(--om-border-strong)]" />
                  <span>
                    Updated <span className="text-[var(--om-text-1)]">{fmtDate(installed.updatedAt)}</span>
                  </span>
                </>
              ) : official ? (
                <>
                  <span className="h-[12px] w-px bg-[var(--om-border-strong)]" />
                  <span>{official.license}</span>
                </>
              ) : null}
            </div>
            <div className="flex gap-[8px] pt-[6px]">
              {installed ? (
                <button type="button" onClick={tryIt} className="h-[36px] cursor-pointer rounded-[10px] bg-[var(--om-btn-primary)] px-[12px] text-[15px] font-medium text-[var(--om-text-inverse)] hover:opacity-90">
                  Try it out
                </button>
              ) : (
                <button type="button" disabled={busy === "install"} onClick={() => void install()} className="flex h-[36px] cursor-pointer items-center gap-[6px] rounded-[10px] bg-[var(--om-btn-primary)] px-[12px] text-[15px] font-medium text-[var(--om-text-inverse)] hover:opacity-90 disabled:opacity-60">
                  {busy === "install" ? <Loader2 size={15} className="animate-spin" /> : null}
                  {busy === "install" ? "Adding" : "Add"}
                </button>
              )}
              {installed ? (
                <button type="button" disabled={!detail} onClick={() => { setDraft(skillMd); setEditing((v) => !v); }} className="flex h-[36px] cursor-pointer items-center gap-[6px] rounded-[10px] border border-[var(--om-border-strong)] px-[10px] text-[15px] font-medium text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] disabled:opacity-50">
                  <FileText size={16} strokeWidth={1.8} />
                  {editing ? "View details" : "Edit SKILL.md"}
                </button>
              ) : official ? (
                <a href={official.sourceUrl} target="_blank" rel="noreferrer" className="flex h-[36px] items-center gap-[6px] rounded-[10px] border border-[var(--om-border-strong)] px-[10px] text-[15px] font-medium text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]">
                  <ExternalLink size={15} strokeWidth={1.8} />
                  View source
                </a>
              ) : null}
            </div>
          </div>
          <div className="mr-[48px] hidden shrink-0 sm:block">
            <SkillCover name={name} title={title} colors={official?.cover} size="detail" />
          </div>
        </div>

        {editing ? (
          <div className="flex flex-col gap-[10px] pt-[20px]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              aria-label="SKILL.md"
              className="min-h-[360px] w-full resize-y rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-bg)] p-[14px] font-mono text-[13px] leading-[20px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]"
            />
            <div className="flex justify-end gap-[8px]">
              <button type="button" onClick={() => setEditing(false)} className="h-[32px] cursor-pointer rounded-[8px] border border-[var(--om-border-strong)] px-[12px] text-[14px] font-medium hover:bg-[var(--om-fill-subtle)]">
                Cancel
              </button>
              <button type="button" disabled={busy === "save" || draft === skillMd} onClick={() => void save()} className="flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-[var(--om-btn-primary)] px-[12px] text-[14px] font-medium text-[var(--om-text-inverse)] disabled:opacity-50">
                {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[16px] pt-[24px]">
            <p className="whitespace-pre-wrap text-[16px] leading-[24px] text-[var(--om-text-1)]">{description}</p>
            {installed && !detail && !loadError ? <div className="text-[14px] text-[var(--om-text-3)]">Reading the skill from your computer…</div> : null}
            {loadError ? <div className="text-[14px] text-[var(--om-danger)]">{loadError}</div> : null}
            {detail ? (
              <>
                <div className="rounded-[12px] border border-[var(--om-border)]">
                  <div className="border-b border-[var(--om-border)] px-[16px] py-[10px] text-[13px] font-medium text-[var(--om-text-2)]">
                    {detail.files.length} file{detail.files.length === 1 ? "" : "s"} · {installed?.dir}
                  </div>
                  <ul className="max-h-[160px] overflow-y-auto py-[4px]">
                    {detail.files.map((f) => (
                      <li key={f.path} className="flex items-center justify-between px-[16px] py-[5px] font-mono text-[13px] text-[var(--om-text-1)]">
                        <span className="truncate">{f.path}</span>
                        <span className="shrink-0 text-[var(--om-text-3)]">{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} KB`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {body ? <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[12px] bg-[var(--om-bg)] p-[16px] font-mono text-[13px] leading-[19px] text-[var(--om-text-2)]">{body.slice(0, 12_000)}</pre> : null}
              </>
            ) : null}
            {official && !installed ? (
              <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">
                Published by {official.publisher} under {official.license}. Installed with Hermes&apos; own installer as <code className="font-mono">{official.identifier}</code>.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
