"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, Check, Download, File, FileText, Film, Gamepad2, Globe, Image as ImageIcon, LayoutGrid, List, ListFilter, Music, Presentation, Smartphone, SquarePen, Star, Table } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ComponentType } from "react";
import { cx } from "../cx";
import { LIBRARY_CATEGORIES, LIBRARY_SORTS, type LibraryCategory, type LibrarySort } from "../data/library";
import { NEW_TASK_HREF, taskHref } from "../routes";
import { toast } from "@/components/ui/toast";
import { MENU_SURFACE, PageShell, PillTabs, SearchField, type PillTab } from "../ui";
import { FilePreview } from "./FilePreview";
import { downloadAll, downloadFile, useLibrary, type LibraryItem } from "./useLibrary";

type Filter = "All" | LibraryCategory;
type View = "grid" | "list";

const TABS: PillTab<Filter>[] = [{ id: "All", label: "All" }, ...LIBRARY_CATEGORIES.map((c) => ({ id: c, label: c }))];

const ICONS: Record<LibraryCategory, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  "Text & PDF": FileText,
  Websites: Globe,
  Slides: Presentation,
  Games: Gamepad2,
  Spreadsheets: Table,
  Images: ImageIcon,
  Videos: Film,
  Audio: Music,
  "Mobile apps": Smartphone,
  Others: File,
};

const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center gap-[8px] rounded-[8px] px-[8px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--om-fill)]";
const ICON_BUTTON = "flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] p-[8px] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : DATE.format(time);
}

/** Files in date sections, newest first as already sorted ("Yesterday (1)" headings, 40 px apart). */
function byDay(files: LibraryItem[]): { label: string; files: LibraryItem[] }[] {
  const groups: { label: string; files: LibraryItem[] }[] = [];
  for (const file of files) {
    const label = formatDate(file.createdAt) || "Earlier";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.files.push(file);
    else groups.push({ label, files: [file] });
  }
  return groups;
}

function FileActions({ file, favourite, onFavourite }: { file: LibraryItem; favourite: boolean; onFavourite: (id: string) => void }) {
  return (
    <span className="flex shrink-0 items-center gap-[2px]">
      <button type="button" onClick={() => onFavourite(file.id)} aria-pressed={favourite} aria-label={favourite ? `Remove ${file.name} from favorites` : `Add ${file.name} to favorites`} className={ICON_BUTTON}>
        <Star size={16} strokeWidth={1.8} fill={favourite ? "currentColor" : "none"} className={favourite ? "text-[var(--om-warning)]" : "text-[var(--om-icon-3)]"} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          downloadFile(file);
          toast(`Downloading ${file.name}`);
        }}
        disabled={!file.url}
        aria-label={`Download ${file.name}`}
        title={file.url ? "Download" : "Not available for download yet"}
        className={ICON_BUTTON}
      >
        <Download size={16} strokeWidth={1.8} className="text-[var(--om-icon-2)]" aria-hidden />
      </button>
    </span>
  );
}

export function LibraryPage({ initialFiles = [], initialFavourites = [], loading = false }: { initialFiles?: LibraryItem[]; initialFavourites?: string[]; loading?: boolean }) {
  const library = useLibrary(initialFiles, initialFavourites);
  const { files, favourites, toggleFavourite } = library;
  const ready = library.ready && !loading;
  const [previewing, setPreviewing] = useState<LibraryItem | null>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [view, setView] = useState<View>("list");
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("newest");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = files.filter((file) => {
      if (filter !== "All" && file.category !== filter) return false;
      if (onlyFavourites && !favourites.includes(file.id)) return false;
      if (!needle) return true;
      return file.name.toLowerCase().includes(needle) || file.taskTitle.toLowerCase().includes(needle);
    });
    return matches.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt);
    });
  }, [files, favourites, query, filter, onlyFavourites, sort]);

  const downloadable = visible.filter((file) => file.url);
  const filtering = query.trim() !== "" || filter !== "All" || onlyFavourites;

  return (
    <PageShell
      title="Library"
      bare
      actions={
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search files" className="h-[32px] w-[240px] max-md:w-[140px]" />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Filter and sort"
                className={cx(
                  "relative flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-btn-border)] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:border-[var(--om-border-focus)] data-[state=open]:bg-[var(--om-fill)]",
                )}
              >
                <ListFilter size={16} strokeWidth={2} aria-hidden />
                {onlyFavourites ? <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-[var(--om-icon-accent)]" /> : null}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              collisionPadding={8}
              className={cx(MENU_SURFACE, "w-[212px]")}
            >
              <DropdownMenu.CheckboxItem checked={onlyFavourites} onCheckedChange={(checked) => setOnlyFavourites(checked === true)} onSelect={(e) => e.preventDefault()} className={MENU_ITEM}>
                <Star size={15} strokeWidth={1.7} className="text-[var(--om-icon-2)]" aria-hidden />
                <span className="flex-1">Favorites</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={2} aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.CheckboxItem>
              <DropdownMenu.Separator className="mx-[6px] my-[4px] h-px bg-[var(--om-border)]" />
              <DropdownMenu.Label className="px-[9px] pb-[2px] pt-[4px] text-[12px] leading-[16px] text-[var(--om-text-3)]">Sort by</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={sort} onValueChange={(value) => setSort(value as LibrarySort)}>
                {LIBRARY_SORTS.map((option) => (
                  <DropdownMenu.RadioItem key={option.id} value={option.id} onSelect={(e) => e.preventDefault()} className={MENU_ITEM}>
                    <span className="flex-1">{option.label}</span>
                    <DropdownMenu.ItemIndicator>
                      <Check size={14} strokeWidth={2} aria-hidden />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="mx-[6px] my-[4px] h-px bg-[var(--om-border)]" />
              <DropdownMenu.Item disabled={downloadable.length === 0} onSelect={() => downloadAll(downloadable)} className={MENU_ITEM}>
                <Download size={15} strokeWidth={1.7} className="text-[var(--om-icon-2)]" aria-hidden />
                Download all files
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <div role="group" aria-label="View" className="flex h-[32px] items-stretch rounded-[8px] border border-[var(--om-border)] bg-[var(--om-fill-sunken)] p-px">
            {(["grid", "list"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                aria-label={option === "grid" ? "Grid view" : "List view"}
                onClick={() => setView(option)}
                className={cx(
                  "flex shrink-0 cursor-pointer items-center justify-center rounded-[6px] px-[8px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
                  view === option ? "bg-[var(--om-fill-solid)] text-[var(--om-text-1)] shadow-[0_0.5px_3px_0_var(--om-shadow-sm)]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
                )}
              >
                {option === "grid" ? <LayoutGrid size={16} strokeWidth={2} aria-hidden /> : <List size={16} strokeWidth={2} aria-hidden />}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-[1008px] items-center gap-[12px] px-[20px] pb-[24px] pt-[8px] md:px-[24px]">
        <PillTabs tabs={TABS} value={filter} onChange={setFilter} label="File types" className="min-h-[32px] min-w-0 flex-1 flex-wrap" />
      </div>

      {!ready && files.length === 0 ? (
        <div className="flex-1" aria-busy="true" />
      ) : files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-[80px]">
          <Archive size={30} strokeWidth={1.6} color="var(--om-icon-2)" aria-hidden className="shrink-0" />
          <div className="pt-[12px] text-[14px] font-semibold leading-[20px] text-[var(--om-text-1)]">Your library is empty</div>
          <div className="pt-[2px] text-center text-[13px] leading-[18px] text-[var(--om-text-2)]">Everything your tasks produce, from documents to sites, collects here.</div>
          <Link
            href={NEW_TASK_HREF}
            className="mt-[12px] flex h-[32px] shrink-0 items-center gap-[7px] rounded-[9px] bg-[var(--om-btn-primary)] px-[13px] text-[14px] font-medium leading-[18px] text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90"
          >
            <SquarePen size={15} strokeWidth={1.8} aria-hidden />
            New task
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2px] pb-[80px] text-center">
          <div className="text-[14px] font-semibold leading-[20px] text-[var(--om-text-1)]">{onlyFavourites && !query && filter === "All" ? "No favorites yet" : "No files found"}</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-2)]">{filtering ? "Try a different search, type or filter." : "Files and creations from your tasks will appear here."}</div>
        </div>
      ) : view === "list" ? (
        <div className="mx-auto flex w-full max-w-[1008px] flex-1 flex-col gap-[40px] px-[20px] pb-[32px] md:px-[24px]">
          {byDay(visible).map((group) => (
            <section key={group.label} className="flex flex-col gap-[12px]">
              <h2 className="flex min-w-0 items-center gap-[4px] text-[14px] font-normal leading-[20px] text-[var(--om-text-1)]">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-[12px] leading-[16px] text-[var(--om-text-3)]">({group.files.length})</span>
              </h2>
              <ul className="flex flex-col">
                {group.files.map((file) => {
                  const Icon = ICONS[file.category];
                  return (
                    <li key={file.id} className="group relative flex items-center rounded-[8px] transition-colors hover:bg-[var(--om-fill-subtle)] md:-ms-[12px] md:w-[calc(100%+24px)] md:px-[12px]">
                      <div className="flex w-full items-center gap-[12px] border-b border-[var(--om-border)] py-[12px] sm:gap-[24px] md:ps-[8px]">
                        <div className="flex min-w-0 flex-1 items-center gap-[12px]">
                          <span className="flex size-[24px] shrink-0 items-center justify-center text-[var(--om-icon-2)]">
                            <Icon size={22} strokeWidth={1.5} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-[4px]">
                            {file.href ? (
                              <Link href={file.href} className="max-w-full truncate text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none hover:underline focus-visible:underline">
                                {file.name}
                              </Link>
                            ) : (
                              <button type="button" onClick={() => setPreviewing(file)} className="max-w-full truncate text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none hover:underline focus-visible:underline">
                                {file.name}
                              </button>
                            )}
                            <Link href={file.taskId ? taskHref(file.taskId) : (file.href ?? "#")} className="max-w-full truncate text-[13px] leading-[18px] text-[var(--om-text-3)] outline-none hover:text-[var(--om-text-2)] hover:underline focus-visible:underline">
                              {file.taskTitle}
                            </Link>
                          </span>
                        </div>
                        {formatSize(file.size) ? <span className="shrink-0 text-[12px] leading-[16px] text-[var(--om-text-3)] max-md:hidden">{formatSize(file.size)}</span> : null}
                        <time className="shrink-0 text-[12px] leading-[16px] text-[var(--om-text-3)]">{formatDate(file.createdAt)}</time>
                        <FileActions file={file} favourite={favourites.includes(file.id)} onFavourite={toggleFavourite} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="mx-auto grid w-full max-w-[1008px] grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[12px] px-[20px] pb-[32px] md:px-[24px]">
          {visible.map((file) => {
            const Icon = ICONS[file.category];
            return (
              <li key={file.id} className="flex min-w-0 flex-col overflow-clip rounded-[12px] border border-[var(--om-border)] bg-[var(--om-card)]">
                <button
                  type="button"
                  onClick={() => (file.href ? router.push(file.href) : setPreviewing(file))}
                  className="flex h-[96px] shrink-0 items-center justify-center overflow-hidden bg-[var(--om-fill)] text-[var(--om-icon-3)] outline-none"
                  aria-label={`Open ${file.name}`}
                >
                  {file.thumb || (file.category === "Images" && file.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumb ?? file.url} alt="" loading="lazy" className="size-full object-cover object-top" />
                  ) : (
                    <Icon size={28} strokeWidth={1.4} />
                  )}
                </button>
                <span className="flex items-center gap-[6px] py-[9px] pl-[12px] pr-[6px]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{file.name}</span>
                    <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{[file.category, formatDate(file.createdAt)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <FileActions file={file} favourite={favourites.includes(file.id)} onFavourite={toggleFavourite} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <FilePreview file={previewing} onClose={() => setPreviewing(null)} />
    </PageShell>
  );
}
