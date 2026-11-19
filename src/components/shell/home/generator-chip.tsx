/** The picked generator, shown just above the Home composer: its name, a remove button, and for slides the theme picker. */
import { cn } from "@/components/ui/cn";
import { CloseIcon } from "@/components/ui/icons";
import type { HomeEntry } from "@/lib/generators/registry";
import { SLIDE_THEMES } from "@/lib/generators/themes";

export function GeneratorChip({ entry, theme, onTheme, onClear }: { entry: HomeEntry; theme: string; onTheme: (id: string) => void; onClear: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-[8px]">
      <span className="flex h-[32px] items-center gap-[6px] rounded-full border border-[var(--om-border)] bg-[var(--om-surface)] ps-[12px] pe-[4px] text-[13px] font-medium text-[var(--om-text-1)]">
        {entry.label}
        <button type="button" aria-label={`Stop using ${entry.label}`} onClick={onClear} className="flex size-[24px] cursor-pointer items-center justify-center rounded-full text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
          <CloseIcon size={12} />
        </button>
      </span>
      {entry.kind === "slides" ? (
        <div role="radiogroup" aria-label="Slide theme" className="flex items-center gap-[6px]">
          {SLIDE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={t.id === theme}
              onClick={() => onTheme(t.id)}
              className={cn(
                "flex h-[32px] cursor-pointer items-center gap-[6px] rounded-full border bg-[var(--om-surface)] ps-[6px] pe-[10px] text-[12.5px] text-[var(--om-text-2)] hover:text-[var(--om-text-1)]",
                t.id === theme ? "border-[var(--om-border-focus)] text-[var(--om-text-1)]" : "border-[var(--om-border)]",
              )}
            >
              <span className="flex h-[20px] w-[30px] items-center justify-center gap-[2px] rounded-[5px] border border-black/10" style={{ background: t.swatch[0] }}>
                <span className="h-[8px] w-[10px] rounded-[2px]" style={{ background: t.swatch[1] }} />
                <span className="h-[8px] w-[5px] rounded-[2px]" style={{ background: t.swatch[2] }} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
