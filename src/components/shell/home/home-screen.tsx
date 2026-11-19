"use client";

/**
 * Home ("new task"): a 768 px column (800 px with its 16 px gutters);
 * the headline and entry cards centred in what is left above the input; the input docked 32 px above the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Composer, type ComposerHandle } from "@/components/composer";
import { takeStashedPrompt } from "@/components/composer/handoff";
import { cn } from "@/components/ui/cn";
import { PROMPT_STASHED } from "../task-menu";
import { TopBar } from "../top-bar";
import type { CreateTaskInput } from "@/lib/agent/types";
import { startGenerator, useGeneratorAvailability } from "@/lib/generators/client";
import type { HomeEntry } from "@/lib/generators/registry";
import { DEFAULT_THEME } from "@/lib/generators/themes";
import { GeneratorChip } from "./generator-chip";
import { ExploreMore, QuickActions, homeActions, type Action } from "./quick-actions";

export function HomeScreen() {
  const [prompt, setPrompt] = useState("");
  const [exploring, setExploring] = useState(false);
  const [picked, setPicked] = useState<HomeEntry | null>(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const composer = useRef<ComposerHandle>(null);
  const router = useRouter();
  const { quick, more } = homeActions(useGeneratorAvailability());

  const pick = (action: Action) => {
    setPrompt(action.prompt);
    setPicked(action.entry ?? null);
    setExploring(false);
    composer.current?.focus();
  };

  const onValueChange = (text: string) => {
    setPrompt(text);
    // Clearing the input drops the picked generator, as removing its chip does.
    if (text.trim() === "") setPicked(null);
  };

  // A picked generator starts its own kind of task (its contract, folder and viewer); otherwise the composer's default.
  const submitGenerator = picked
    ? async (input: CreateTaskInput) => {
        const { task } = await startGenerator({ ...input, kind: picked.kind, variant: picked.variant, ...(picked.kind === "slides" ? { theme } : {}) });
        setPicked(null);
        router.push(`/app/task/${encodeURIComponent(task.id)}`);
      }
    : undefined;

  // A prompt handed over by another page (the landing page's composer, a website template, ...).
  // Reading it also clears it, so the second effect run of development mode finds nothing.
  useEffect(() => {
    const take = () => {
      const stashed = takeStashedPrompt();
      if (!stashed) return;
      composer.current?.setText(stashed.text);
      if (stashed.send) composer.current?.submit(stashed.text);
    };
    take();
    window.addEventListener(PROMPT_STASHED, take);
    return () => window.removeEventListener(PROMPT_STASHED, take);
  }, []);

  useEffect(() => {
    if (!exploring) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setExploring(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exploring]);

  return (
    <div className="@container relative isolate flex min-h-full w-full min-w-0 max-w-full flex-1 shrink-0 flex-col items-stretch self-stretch bg-[var(--om-bg)] text-[14px] leading-[20px] text-[var(--om-text-1)]">
      <TopBar />
      <div className="relative mx-auto flex w-full max-w-full flex-1 flex-col px-[16px] sm:min-w-[360px] sm:max-w-[800px]">
        {/* The hero stays in the layout while "More ideas" is open (only hidden), so the composer does not jump. */}
        <div inert={exploring} className={cn("relative flex min-h-[160px] flex-1 justify-center py-[81px]", exploring && "pointer-events-none invisible")}>
          <div className="relative isolate mx-auto my-auto flex w-full max-w-[768px] flex-col items-center gap-[40px]">
            <div className="flex w-full flex-col items-center gap-[40px]">
              <h1 className="text-center font-serif text-[32px] font-normal leading-[40px] text-[var(--om-text-1)]">What should we get done?</h1>
              <div className="flex w-full flex-col gap-[12px]">
                <QuickActions actions={quick} onPick={pick} onExplore={() => setExploring(true)} />
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 z-20 mt-auto bg-[linear-gradient(to_bottom,var(--om-bg-clear),var(--om-bg)_28%,var(--om-bg))] pt-[48px]">
          <div className="pointer-events-auto relative">
            <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-[12px]">{exploring ? <ExploreMore actions={more} onPick={pick} onClose={() => setExploring(false)} /> : picked ? <GeneratorChip entry={picked} theme={theme} onTheme={setTheme} onClear={() => setPicked(null)} /> : null}</div>
            <Composer ref={composer} value={prompt} onValueChange={onValueChange} onSubmit={submitGenerator} placeholder={picked?.placeholder} autoFocus />
          </div>
        </div>
      </div>
    </div>
  );
}
