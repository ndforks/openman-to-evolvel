/**
 * One row of the sidebar: 36 px tall, 10 px radius, 8 px start padding,
 * a 20 px icon box holding an 18 px glyph, an 8 px gap and a 14 px label. Used for links, buttons and menu triggers.
 */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { IconComponent } from "@/components/ui/icons";

const HOVER = "hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)] data-[state=open]:bg-[var(--om-fill-subtle)]";
const ACTIVE = "bg-[var(--om-fill)]";

export function sidebarRowClass({ active = false, collapsed = false }: { active?: boolean; collapsed?: boolean } = {}): string {
  return cn(
    "group/row flex h-[36px] w-full shrink-0 cursor-pointer select-none items-center gap-[8px] rounded-[10px] text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors",
    collapsed ? "justify-center px-0" : "pe-[2px] ps-[8px]",
    active && ACTIVE,
    HOVER,
  );
}

/** The 20 px box every sidebar glyph sits in. */
export function SidebarGlyph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative flex size-[20px] shrink-0 items-center justify-center", className)}>
      <span className="flex size-[18px] items-center justify-center">{children}</span>
    </span>
  );
}

export function SidebarRowContent({ icon: Icon, label, collapsed = false, trailing }: { icon: IconComponent; label: string; collapsed?: boolean; trailing?: ReactNode }) {
  return (
    <>
      <SidebarGlyph>
        <Icon size={18} className="text-[var(--om-icon-1)]" />
      </SidebarGlyph>
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        // The label inherits the body's 1.5 line height (21 px at 14 px).
        <span className="flex min-w-0 flex-1 items-center gap-[4px] leading-[21px]">
          <span className="truncate">{label}</span>
        </span>
      )}
      {collapsed ? null : trailing}
    </>
  );
}
