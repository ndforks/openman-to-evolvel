"use client";

/** Building blocks shared by every Settings tab. Colours come from the `--om-*` tokens. */
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight as LucideChevronRight, CircleHelp, Search, UserRound } from "lucide-react";
import { cn } from "@/components/modals/ModalShell";
import { useThemeClass } from "@/components/modals/theme";

export { cn };

/** Hairline used between sections (`--om-border`). */
export const DIVIDER = "border-[var(--om-border)]";

/* ---------- layout ---------- */

/** A tab's content: the title bar (34px above, 16px below, hairline) followed by its sections. */
export function Pane({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className={cn("flex shrink-0 items-center justify-between gap-[4px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
        <div className="min-w-0 max-w-full flex-1">
          <h2 className="flex max-w-full items-center gap-[8px] text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">{title}</h2>
          {subtitle ? <p className="mt-[4px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-[8px]">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A block of rows closed by a hairline. Pass `last` to drop the hairline. */
export function Section({ children, className, last }: { children: ReactNode; className?: string; last?: boolean }) {
  return <section className={cn("flex flex-col py-[24px]", !last && "border-b", !last && DIVIDER, className)}>{children}</section>;
}

/** 16px section heading ("Appearance", "Notifications"). */
export function SectionHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]", className)}>{children}</h3>;
}

/** 16px label above a control ("Language", "Theme"). */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[16px] leading-[24px] text-[var(--om-text-1)]", className)}>{children}</div>;
}

/** Title + description on the left, a control on the right. */
export function Row({ title, description, children, align = "center", className, textClassName }: { title: ReactNode; description?: ReactNode; children?: ReactNode; align?: "center" | "start"; className?: string; textClassName?: string }) {
  return (
    <div className={cn("flex flex-wrap justify-between gap-[16px]", align === "start" ? "items-start" : "items-center", className)}>
      <div className={cn("flex min-w-0 flex-1 flex-col items-start justify-center", textClassName)}>
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
        {description ? <div className="w-full text-[13px] leading-[18px] text-[var(--om-text-3)]">{description}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Rounded card (12px radius, `--om-card` fill, `--om-border` hairline, 16px side padding). */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[12px] border bg-[var(--om-card)] px-[16px]", DIVIDER, className)}>{children}</div>;
}

/* ---------- controls ---------- */

/** Switch: 26x16 track (22x14 with `size="sm"`), 1px inset, white knob; `--om-icon-disabled` off, `--om-icon-accent` on. */
export function Toggle({ checked, onCheckedChange, label, disabled, size = "md" }: { checked: boolean; onCheckedChange: (next: boolean) => void; label: string; disabled?: boolean; size?: "md" | "sm" }) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "flex shrink-0 cursor-pointer rounded-[16px] bg-[var(--om-icon-disabled)] px-[1px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--om-icon-accent)]",
        size === "sm" ? "h-[14px] w-[22px]" : "h-[16px] w-[26px]",
      )}
    >
      <Switch.Thumb className={cn("pointer-events-none block translate-y-[1px] rounded-full bg-[var(--om-icon-on-accent)] transition-transform", size === "sm" ? "size-[12px] data-[state=checked]:translate-x-[8px]" : "size-[14px] data-[state=checked]:translate-x-[10px]")} />
    </Switch.Root>
  );
}

export type ButtonVariant = "primary" | "outline" | "danger" | "ghost" | "blue";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] hover:opacity-90",
  outline: "outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] bg-transparent text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)] hover:opacity-90",
  danger: "min-w-[72px] gap-[6px] px-[12px] leading-[20px] outline outline-1 -outline-offset-1 outline-[var(--om-danger)] bg-transparent text-[var(--om-danger)] hover:bg-[var(--om-fill-subtle)] hover:opacity-90",
  ghost: "text-[var(--om-text-1)] hover:bg-[var(--om-fill-subtle)]",
  blue: "bg-[var(--om-btn-accent)] text-white hover:opacity-90",
};

/** Button: 32px tall, 8px padding, 14/18 medium, 8px radius, 1px inset outline. */
export function Button({ variant = "outline", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-[32px] min-w-[64px] shrink-0 cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] transition-colors active:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)] disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Underlined tab strip (24px apart, 10px vertical padding, 2px `--om-btn-primary` underline on the hairline). */
export const TAB_LIST = "flex flex-wrap gap-x-[24px] border-b border-[var(--om-border)]";
export function tabClass(active: boolean): string {
  return cn(
    "-mb-px cursor-pointer whitespace-nowrap border-b-2 py-[10px] text-[14px] leading-[20px] outline-none transition-colors duration-200",
    active ? "border-[var(--om-btn-primary)] font-medium text-[var(--om-text-1)]" : "border-transparent text-[var(--om-text-3)] hover:text-[var(--om-text-2)] focus-visible:text-[var(--om-text-2)]",
  );
}

/** Class list for an `<a>` drawn as the outline button (external "… in Orgo" links). */
export const LINK_BUTTON =
  "inline-flex h-[32px] min-w-[64px] shrink-0 items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] hover:opacity-90 active:opacity-80";

/** Toolbar search box (200px x 32px, 8px radius, 16px glyph in a 20px slot, 14/20 text). */
export function SearchField({ value, onChange, placeholder, className }: { value: string; onChange: (next: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={cn("flex h-[32px] w-[200px] shrink-0 cursor-text items-center overflow-hidden rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[8px] py-[4px] text-[14px] leading-[20px] text-[var(--om-text-1)] transition-colors focus-within:border-[var(--om-border-focus)] hover:border-[var(--om-border-focus)]", className)}>
      <span className="me-[6px] flex size-[20px] shrink-0 items-center justify-center text-[var(--om-icon-3)]">
        <Search size={16} strokeWidth={2} aria-hidden="true" />
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-full min-w-px flex-1 bg-transparent px-[4px] outline-none placeholder:text-[var(--om-text-disabled)]" />
    </label>
  );
}

/** 32px square bordered icon button. */
export function IconButton({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--om-btn-border)] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
        className,
      )}
      {...props}
    />
  );
}

/** 36px bordered text field (row height). */
export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-[36px] min-w-0 rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[12px] text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors placeholder:text-[var(--om-text-disabled)] hover:border-[var(--om-border-focus)] focus:border-[var(--om-border-focus)]",
        className,
      )}
      {...props}
    />
  );
}

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

/** 36px bordered select (8px radius, 4/8 padding, 14/20). Give it a width through `className` (208px or 230px). */
export function SelectBox<T extends string>({ value, onValueChange, options, className, ariaLabel, align = "start" }: { value: T; onValueChange: (next: T) => void; options: readonly Option<T>[]; className?: string; ariaLabel: string; align?: "start" | "end" }) {
  const themeClass = useThemeClass();
  return (
    <Select.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group flex h-[36px] shrink-0 cursor-pointer items-center justify-between overflow-hidden rounded-[8px] border border-[var(--om-btn-border)] bg-transparent px-[8px] py-[4px] text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:border-[var(--om-border-focus)] focus-visible:border-[var(--om-border-focus)] data-[state=open]:border-[var(--om-border-focus)]",
          className,
        )}
      >
        <span className="min-w-px flex-1 truncate px-[4px]">
          <Select.Value />
        </span>
        <Select.Icon className="ms-[6px] flex size-[20px] shrink-0 items-center justify-center text-[var(--om-icon-3)] transition-transform duration-150 group-data-[state=open]:rotate-180">
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          align={align}
          className={cn(
            themeClass,
            "z-[120] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]",
          )}
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="relative flex h-[36px] cursor-pointer select-none items-center rounded-[8px] pl-[10px] pr-[32px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-[10px] flex items-center text-[var(--om-icon-1)]">
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/* ---------- small glyphs ---------- */

/** Chevron pointing right (row that opens a sub-page). */
export function ChevronRight({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <LucideChevronRight size={size} strokeWidth={2} aria-hidden="true" className={cn("shrink-0 text-[var(--om-icon-2)]", className)} />
  );
}

/** Circled question mark shown next to labels. */
export function HelpGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <CircleHelp size={size} strokeWidth={2} aria-hidden="true" className={cn("shrink-0 text-[var(--om-icon-3)]", className)} />
  );
}

/** Generic person avatar: a person glyph on a blue disc. `size` is the diameter in px. */
export function Avatar({ size = 27, src, name }: { size?: number; src?: string | null; name?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ""} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#5B8DEF] text-[#E3ECFF]" style={{ width: size, height: size }}>
      <UserRound size={Math.round(size * 0.6)} strokeWidth={2} aria-hidden="true" />
    </div>
  );
}

/* ---------- helpers ---------- */

/** Copy text to the clipboard. `copied` flips true for 1.5s after a successful copy. */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback((text: string) => {
    const done = () => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => undefined);
      return;
    }
    // Older browsers / insecure contexts.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      if (document.execCommand("copy")) done();
    } finally {
      area.remove();
    }
  }, []);
  return [copied, copy];
}
