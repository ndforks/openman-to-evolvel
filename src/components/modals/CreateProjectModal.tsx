"use client";

/**
 * "Create project": a name, the computer it lives on and a working folder. Saved with `POST /api/projects`;
 * then the project's page opens with the "Project created" add-ons dialog.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, ChevronDown, FolderKanban, FolderOpen, Laptop } from "lucide-react";
import { ModalShell, cn } from "@/components/modals/ModalShell";
import { useThemeClass } from "@/components/modals/theme";
import { createProject, projectHref } from "@/components/shell/projects-store";
import { toast } from "@/components/ui/toast";
import { useUI } from "@/lib/ui-store";

export interface ProjectDraft {
  id: string;
  name: string;
  /** Kept for the projects contract; this dialog has no instructions field, so it is always empty here. */
  instructions: string;
  /** Working folder: a picked folder's name or a typed path. Empty when none was chosen. */
  folder?: string;
  /** Where the folder lives. */
  computer?: ComputerId;
}

type ComputerId = "local" | "cloud";

const COMPUTERS: { id: ComputerId; label: string }[] = [
  { id: "local", label: "This computer" },
  { id: "cloud", label: "Cloud computer" },
];

type DirectoryPicker = () => Promise<{ name: string }>;

// Layout:
// 400 px wide, 20 px padding, 48 px icon tile, 36 px field and buttons, 40 px folder row, 14 px text.
const FIELD_LABEL = "text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]";
const ACTION = "flex h-[36px] min-w-0 flex-1 basis-0 items-center justify-center rounded-[8px] text-[14px] font-medium leading-[20px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]";

export function CreateProjectModal({ onCreated, stay = false }: { onCreated?: (project: { id: string; name: string; instructions: string }) => void; stay?: boolean }) {
  const close = useUI((s) => s.close);
  const router = useRouter();
  const themeClass = useThemeClass();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [computer, setComputer] = useState<ComputerId | null>(null);
  const [folder, setFolder] = useState("");
  /** True once the folder row has turned into a path field (no native picker, or a cloud computer). */
  const [typingFolder, setTypingFolder] = useState(false);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !saving;
  const computerLabel = COMPUTERS.find((c) => c.id === computer)?.label ?? "Choose a computer";

  const pickFolder = async () => {
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    if (computer === "cloud" || typeof picker !== "function") {
      setTypingFolder(true);
      return;
    }
    try {
      const handle = await picker.call(window);
      setFolder(handle.name);
      setComputer("local");
      setTypingFolder(true);
    } catch (error) {
      // Dismissing the picker is not an error; anything else falls back to typing a path.
      if (!(error instanceof DOMException && error.name === "AbortError")) setTypingFolder(true);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const project = await createProject({ name: trimmed, folder: folder.trim(), computer });
      const draft: ProjectDraft = { id: project.id, name: project.name, instructions: project.instructions, folder: project.folder, computer: project.computer ?? undefined };
      onCreated?.(draft);
      window.dispatchEvent(new CustomEvent("openman:project-created", { detail: draft }));
      close();
      if (stay) toast(`Project “${project.name}” created`, "success");
      else router.push(`${projectHref(project.id)}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be created.");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Create project"
      closeSize={16}
      closeClassName="right-[17px] top-[22px]"
      className="max-h-[calc(100vh-40px)] w-[400px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[16px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] px-[20px] pb-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] [scrollbar-width:none] dark:bg-[#1A1A1A]"
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col items-center">
        <div className="mt-[48px] flex size-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--om-fill)] text-[var(--om-icon-1)] dark:bg-[#272727]">
          <FolderKanban size={22} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h2 className="pt-[8px] text-[18px] font-semibold leading-[24px] text-[var(--om-text-1)]">Create project</h2>

        <div className="flex w-full flex-col gap-[7px] pt-[24px]">
          <label htmlFor="create-project-name" className={FIELD_LABEL}>
            Project name
          </label>
          <input
            id="create-project-name"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name, e.g. Q3 launch"
            maxLength={120}
            className="h-[37px] w-full shrink-0 rounded-[8px] border border-[#00000033] bg-transparent px-[12px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)] dark:border-[#FFFFFF33] dark:focus:border-[#FFFFFF73]"
          />
        </div>

        <div className="flex w-full flex-col gap-[7px] pt-[24px]">
          <div className="flex h-[20px] shrink-0 items-center justify-between gap-[12px]">
            <label htmlFor={typingFolder ? "create-project-folder" : undefined} className={FIELD_LABEL}>
              Working folder
            </label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="mr-[7px] flex cursor-pointer items-center gap-[7px] rounded-[8px] text-[13px] leading-[18px] text-[var(--om-text-2)] outline-none transition-colors hover:text-[var(--om-text-1)] focus-visible:text-[var(--om-text-1)] data-[state=open]:text-[var(--om-text-1)]">
                <Laptop size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                <span>{computerLabel}</span>
                <ChevronDown size={11} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className={cn(
                    themeClass,
                    "z-[120] min-w-[170px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]",
                  )}
                >
                  <DropdownMenu.RadioGroup
                    value={computer ?? ""}
                    onValueChange={(next) => {
                      setComputer(next as ComputerId);
                      // A cloud computer has no native folder picker, so go straight to typing a path.
                      if (next === "cloud") setTypingFolder(true);
                    }}
                  >
                    {COMPUTERS.map((option) => (
                      <DropdownMenu.RadioItem
                        key={option.id}
                        value={option.id}
                        className="relative flex h-[31px] cursor-pointer select-none items-center rounded-[8px] pl-[10px] pr-[34px] text-[13px] leading-[18px] outline-none data-[highlighted]:bg-[var(--om-fill)]"
                      >
                        {option.label}
                        <DropdownMenu.ItemIndicator className="absolute right-[10px] flex items-center text-[var(--om-icon-1)]">
                          <Check size={14} strokeWidth={2} aria-hidden="true" />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <div className="flex h-[40px] shrink-0 items-center gap-[8px] rounded-[8px] bg-[var(--om-fill-subtle)] px-[12px] transition-colors focus-within:bg-[var(--om-fill)] hover:bg-[var(--om-fill)] dark:bg-[#232323] dark:focus-within:bg-[#292929] dark:hover:bg-[#292929]">
            <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
            {typingFolder ? (
              <input
                id="create-project-folder"
                autoFocus
                autoComplete="off"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Select a folder"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-3)]"
              />
            ) : (
              <button type="button" onClick={pickFolder} className="h-full min-w-0 flex-1 cursor-pointer text-left text-[14px] leading-[20px] text-[var(--om-text-3)] outline-none">
                Select a folder
              </button>
            )}
          </div>
        </div>

        {error ? (
          <p role="alert" className="w-full pt-[12px] text-[13px] leading-[18px] text-[var(--om-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex w-full gap-[8px] pt-[20px]">
          <button type="button" onClick={close} className={cn(ACTION, "cursor-pointer border border-[var(--om-border-strong)] text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]")}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate}
            className={cn(ACTION, canCreate ? "cursor-pointer bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90" : "cursor-not-allowed bg-[var(--om-btn-primary-disabled)] text-[var(--om-text-inverse)] dark:bg-[#8A8A8A] dark:text-[#2A2A2A]")}
          >
            Create
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
