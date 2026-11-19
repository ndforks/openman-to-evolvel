"use client";

/**
 * "Cloud" chip above the input. Opens the "Where it runs" menu and stores the chosen run target.
 * Only real choices: a temporary cloud computer (the agent's own computer, a fresh folder per task) or one of
 * the user's persistent cloud computers from `/api/computers`, with live status. Local computers need a
 * desktop app that does not exist, so they are not offered. The choice is remembered per project.
 */
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useComputers } from "@/components/pages/computers/useComputers";
import { cn } from "@/components/ui/cn";
import { CheckIcon, ChevronRightIcon, CloudIcon, ComputerIcon, PlusIcon, SlidersIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { PICKER_SURFACE } from "@/components/ui/theme";
import { useUI } from "@/lib/ui-store";
import type { RunTarget } from "@/lib/agent/types";
import { useComposerStore } from "./store";

/** Where the choice per project is kept (this browser). `none` is "no project". */
const PER_PROJECT_KEY = "om-target-by-project";

function readPerProject(): Record<string, RunTarget> {
  try {
    const raw = window.localStorage.getItem(PER_PROJECT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, RunTarget>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePerProject(project: string, target: RunTarget): void {
  try {
    window.localStorage.setItem(PER_PROJECT_KEY, JSON.stringify({ ...readPerProject(), [project]: target }));
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

/** Chip of the context bar above the input: a 32 px pill with a 16 px glyph and a 14 px label. */
export const CONTEXT_CHIP =
  "flex h-[32px] shrink-0 cursor-pointer select-none items-center gap-[6px] rounded-full pe-[12px] ps-[10px] text-[14px] font-normal leading-[20px] text-[var(--om-text-2)] outline-none transition-colors hover:bg-[var(--om-fill-sunken)] focus-visible:bg-[var(--om-fill-sunken)] data-[state=open]:bg-[var(--om-fill-sunken)]";

/** Picker: 240 px wide with 36 px rows; its submenus are 320 px wide. */
const ROOT = cn("w-[240px]", PICKER_SURFACE);
const SUB = cn("max-h-[calc(100dvh-16px)] w-[320px] overflow-y-auto", PICKER_SURFACE);
const DIVIDER = "mx-[12px] my-[4px] bg-[var(--om-border)]";

function Glyph({ children }: { children: ReactNode }) {
  return <span className="flex size-[20px] shrink-0 items-center justify-center text-[var(--om-icon-1)]">{children}</span>;
}

function SubRow({ icon, label, detail, checked = false, onSelect, className }: { icon: ReactNode; label: string; detail?: ReactNode; checked?: boolean; onSelect: () => void; className?: string }) {
  return (
    <MenuItem onSelect={onSelect} className={className}>
      <Glyph>{icon}</Glyph>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="flex shrink-0 items-center gap-[6px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{detail}</span> : null}
      {checked ? (
        <span className="flex size-[20px] shrink-0 items-center justify-center self-center">
          <CheckIcon size={16} />
        </span>
      ) : null}
    </MenuItem>
  );
}

const STATUS_DOT: Record<string, string> = { running: "var(--om-success)", error: "var(--om-danger)", sleeping: "var(--om-text-disabled)", stopped: "var(--om-text-disabled)", deleted: "var(--om-text-disabled)" };

export function TargetPicker() {
  const router = useRouter();
  const open = useUI((s) => s.open);
  const target = useComposerStore((s) => s.target);
  const setStoredTarget = useComposerStore((s) => s.setTarget);
  const projectKey = useComposerStore((s) => s.projectId) ?? "none";
  const manage = () => router.push("/app/computers");

  // Every choice is remembered for the project it was made in; switching projects brings that project's back.
  const setTarget = (next: RunTarget) => {
    setStoredTarget(next);
    writePerProject(projectKey, next);
  };
  useEffect(() => {
    const remembered = readPerProject()[projectKey];
    const current = useComposerStore.getState().target;
    if (remembered && JSON.stringify(remembered) !== JSON.stringify(current)) setStoredTarget(remembered);
    else if (!remembered && current.kind === "local") setStoredTarget({ kind: "cloud-temporary" });
  }, [projectKey, setStoredTarget]);

  // Real computers. Read once here and again each time the menu opens; the Computers page keeps them live.
  const { computers, loaded, notice, refresh } = useComputers({ live: false });
  // A computer with an end deletes itself, so only the ones that are kept count as persistent. The agent's own
  // computer is where every task runs anyway ("Fresh cloud computer"), so it is not listed again.
  const persistent = computers.filter((computer) => !computer.temporary && !computer.protected && computer.status !== "deleted");
  const chosen = target.kind === "cloud-persistent" ? persistent.find((computer) => computer.id === target.computerId) : undefined;
  const chosenId = target.kind === "cloud-persistent" ? target.computerId : null;

  // The stored target can outlive its computer (deleted here or on Orgo). Fall back to a temporary one.
  useEffect(() => {
    if (chosenId && loaded && !notice && !persistent.some((computer) => computer.id === chosenId)) setStoredTarget({ kind: "cloud-temporary" });
  }, [chosenId, loaded, notice, persistent, setStoredTarget]);

  const label = chosen ? chosen.name : "Cloud";

  return (
    <Menu
      onOpenChange={(isOpen) => {
        if (isOpen) void refresh();
      }}
    >
      <MenuTrigger asChild>
        <button type="button" aria-label={`Where it runs: ${label}`} className={CONTEXT_CHIP}>
          {chosen ? <ComputerIcon size={16} className="shrink-0 text-[var(--om-icon-2)]" /> : <CloudIcon size={16} className="shrink-0 text-[var(--om-icon-2)]" />}
          <span className="min-w-0 max-w-[220px] truncate">{label}</span>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" sideOffset={4} className={ROOT}>
        <MenuLabel className="px-[10px] pb-[4px] pt-[8px] text-[12px] font-medium leading-[16px]">Where it runs</MenuLabel>

        <MenuSub>
          <MenuSubTrigger chevron={false}>
            <Glyph>
              <CloudIcon size={16} />
            </Glyph>
            <span className="min-w-0 flex-1 truncate">Cloud</span>
            <CheckIcon size={16} className="shrink-0 text-[var(--om-icon-1)]" />
            <ChevronRightIcon size={16} className="shrink-0 text-[var(--om-icon-3)]" />
          </MenuSubTrigger>
          <MenuSubContent sideOffset={4} className={SUB}>
            <SubRow icon={<CloudIcon size={16} />} label="Fresh cloud computer" checked={target.kind === "cloud-temporary"} onSelect={() => setTarget({ kind: "cloud-temporary" })} />
            <MenuSeparator className={DIVIDER} />
            {persistent.length > 0 ? (
              <>
                {persistent.map((computer) => (
                  <SubRow
                    key={computer.id}
                    icon={<ComputerIcon size={16} />}
                    label={computer.name}
                    detail={
                      <>
                        <span aria-hidden="true" className="size-[6px] rounded-full" style={{ backgroundColor: STATUS_DOT[computer.status] ?? "var(--om-warning)" }} />
                        {computer.statusLabel}
                      </>
                    }
                    checked={chosenId === computer.id}
                    onSelect={() => setTarget({ kind: "cloud-persistent", computerId: computer.id })}
                  />
                ))}
                <MenuSeparator className={DIVIDER} />
                {/* Creating one from here selects it as the target (`selectTarget`, read by the create hook). */}
                <SubRow icon={<PlusIcon size={16} />} label="Add a kept computer" onSelect={() => open("create-computer", { selectTarget: true })} />
              </>
            ) : (
              <SubRow
                icon={<CloudIcon size={16} />}
                label="Kept cloud computer"
                detail={loaded ? (notice ? "Unavailable" : "Add one") : "Loading"}
                // A persistent target needs a computer: creating one selects it through `setTarget`.
                onSelect={() => open("create-computer", { selectTarget: true })}
              />
            )}
            <SubRow icon={<SlidersIcon size={16} strokeWidth={2} />} label="Manage computers" onSelect={manage} />
          </MenuSubContent>
        </MenuSub>

      </MenuContent>
    </Menu>
  );
}
