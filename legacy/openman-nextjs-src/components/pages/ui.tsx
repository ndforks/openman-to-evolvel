// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Small building blocks shared by the pages reached from the sidebar. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

/** Page frame: a 48 px title row and the content below it, both centred in a
 *  column of at most 960 px with 24 px side padding (`--ui-page-max-width`). */
export function PageShell({
  title,
  actions,
  children,
  className,
  headerClassName,
  bare = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Classes for the content area. */
  className?: string;
  /** Classes for the title row. */
  headerClassName?: string;
  /** Drop the side padding and the 960 px column of the content area. */
  bare?: boolean;
}) {
  return (
    <div className="flex min-h-full w-full min-w-0 shrink-0 flex-col bg-[var(--om-bg)] text-[12px] leading-[16px] text-[var(--om-text-1)]">
      {title != null || actions ? (
        <header className={cx("sticky top-0 z-20 flex h-[48px] w-full shrink-0 items-center justify-between bg-[var(--om-bg)] py-[8px] pe-[20px] ps-[14px] md:px-[24px]", headerClassName)}>
          <div className="mx-auto flex w-full min-w-0 max-w-[960px] items-center justify-between gap-[8px]">
            <h1 className="min-w-0 shrink-0 truncate text-[18px] font-semibold leading-[24px] text-[var(--om-text-1)]">{title}</h1>
            {actions ? <div className="flex shrink-0 items-center gap-[8px]">{actions}</div> : null}
          </div>
        </header>
      ) : null}
      {bare ? (
        <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col", className)}>{children}</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-[24px] pb-[32px] pt-[12px]">
          <div className={cx("mx-auto flex w-full min-w-0 max-w-[960px] flex-1 flex-col", className)}>{children}</div>
        </div>
      )}
    </div>
  );
}

/** "Plugins & Skills" title with a Plugins | Skills segmented switch (each half is a link). */
export function PluginsSkillsTitle({ active }: { active: "plugins" | "skills" }) {
  const items = [
    { id: "plugins", label: "Plugins", href: "/app/plugins" },
    { id: "skills", label: "Skills", href: "/app/skills" },
  ] as const;
  return (
    <span className="flex min-w-0 items-center gap-[12px]">
      <span className="min-w-0 shrink-0 truncate">Plugins &amp; Skills</span>
      <span role="tablist" aria-label="Plugins or skills" className="flex h-[32px] shrink-0 items-stretch rounded-[8px] border border-[var(--om-border)] bg-[var(--om-fill-sunken)] p-px text-[13px] font-normal leading-[18px]">
        {items.map((item) => {
          const on = item.id === active;
          return (
            <Link
              key={item.id}
              href={item.href}
              role="tab"
              aria-selected={on}
              className={cx(
                "relative flex items-center justify-center whitespace-nowrap rounded-[6px] px-[16px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
                on ? "bg-[var(--om-fill-solid)] text-[var(--om-text-1)] shadow-[0_0.5px_3px_0_var(--om-shadow-sm)] [text-shadow:0_0_0.5px_currentColor]" : "text-[var(--om-text-3)] hover:text-[var(--om-text-2)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </span>
    </span>
  );
}

/** Outline button: 32 px, 8 px padding and radius, 14/18 medium, 1 px inset outline. */
export function OutlineButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex h-[32px] min-w-[64px] shrink-0 cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] hover:opacity-90 active:opacity-80 focus-visible:outline-[var(--om-border-focus)] data-[state=open]:bg-[var(--om-fill-subtle)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Solid light button ("Get started", "New task"). */
export function PrimaryButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center bg-[var(--om-btn-primary)] text-[14px] font-medium text-[var(--om-text-inverse)] outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90 active:opacity-80 disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface PillTab<T extends string> {
  id: T;
  label: string;
}

/** Row of pill tabs (filter chips: 32 px, 10 px padding, 8 px radius, active on `--om-fill-strong`). */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  height = 32,
  activePx = 10,
  px = 10,
  fontSize = 14,
  radius = 8,
  label,
}: {
  tabs: readonly PillTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  height?: number;
  activePx?: number;
  px?: number;
  fontSize?: number;
  radius?: number;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("flex shrink-0 items-center gap-[4px]", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            style={{ height, paddingInline: active ? activePx : px, fontSize, borderRadius: radius }}
            className={cx(
              "flex min-w-[48px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap leading-[20px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
              active
                ? "bg-[var(--om-fill-strong)] font-medium text-[var(--om-text-1)]"
                : "font-normal text-[var(--om-text-3)] hover:bg-[var(--om-fill-subtle)]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Bordered search box with a leading magnifier (36 px row, 8 px radius, 16 px glyph in a 20 px slot). */
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
  style,
  iconSize = 16,
  iconColor = "var(--om-icon-3)",
  fontSize = 14,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  iconSize?: number;
  iconColor?: string;
  fontSize?: number;
  ariaLabel?: string;
}) {
  return (
    <label
      style={style}
      className={cx(
        "flex h-[36px] shrink-0 cursor-text items-center gap-[6px] overflow-hidden rounded-[8px] border border-[var(--om-btn-border)] px-[8px] py-[4px] transition-colors hover:border-[var(--om-border-focus)] focus-within:border-[var(--om-border-focus)]",
        className,
      )}
    >
      <span className="flex size-[20px] shrink-0 items-center justify-center">
        <Search size={iconSize} strokeWidth={2} color={iconColor} aria-hidden />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        style={{ fontSize }}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent px-[4px] leading-[20px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  );
}

/**
 * A logo drawn from `public/brands`. Coloured marks are painted as-is;
 * `mono` paints the mark's silhouette in the current text colour.
 */
export function BrandLogo({ src, w, h, mono = false, className, label }: { src: string; w: number; h?: number; mono?: boolean; className?: string; label?: string }) {
  const height = h ?? w;
  const url = `url(${src})`;
  const style: CSSProperties = mono
    ? {
        width: w,
        height,
        backgroundColor: "currentColor",
        maskImage: url,
        WebkitMaskImage: url,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }
    : { width: w, height, backgroundImage: url, backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain" };
  return <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={style} className={cx("inline-block shrink-0", className)} />;
}

/** Surface shared by this area's dropdowns; same values as the shell's menus. */
export const MENU_SURFACE =
  "z-50 flex flex-col rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[5px] text-[var(--om-text-1)] shadow-[0_12px_32px_var(--om-shadow-md)] outline-none dark:bg-[#262626] dark:shadow-[0_12px_32px_#00000073]";

export interface MenuOption {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
}

/** Small dropdown menu. Rendered in place (no portal) so it keeps the app's theme tokens. */
export function MenuButton({
  trigger,
  options,
  onSelect,
  align = "end",
  side = "bottom",
  width,
}: {
  trigger: ReactNode;
  options: readonly MenuOption[];
  onSelect?: (id: string) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  width?: number;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Content
        align={align}
        side={side}
        sideOffset={6}
        collisionPadding={8}
        style={{ width, minWidth: width ? undefined : 200 }}
        className={MENU_SURFACE}
      >
        {options.map((option) => (
          <DropdownMenu.Item
            key={option.id}
            onSelect={() => onSelect?.(option.id)}
            className="flex cursor-pointer select-none items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] outline-none data-[highlighted]:bg-[var(--om-fill)]"
          >
            {option.icon ? <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center text-[var(--om-icon-2)]">{option.icon}</span> : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-[6px] text-[13px] leading-[18px]">
                {option.label}
                {option.badge ? (
                  <span className="rounded-[4px] bg-[var(--om-fill-strong)] px-[5px] text-[10px] font-normal leading-[16px] text-[var(--om-text-3)]">{option.badge}</span>
                ) : null}
              </span>
              {option.description ? <span className="text-[12px] leading-[16px] text-[var(--om-text-3)]">{option.description}</span> : null}
            </span>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

/** Header button with a trailing chevron that opens a `MenuButton`. */
export function CreateMenu({ options, onSelect, label = "Create", ariaLabel, chevron = 16, primary = false }: { options: readonly MenuOption[]; onSelect?: (id: string) => void; label?: string; ariaLabel?: string; chevron?: number; primary?: boolean }) {
  return (
    <MenuButton
      options={options}
      onSelect={onSelect}
      trigger={
        <OutlineButton aria-label={ariaLabel ?? label} className={primary ? "bg-[var(--om-btn-primary)] text-[var(--om-text-inverse)] outline-0 hover:bg-[var(--om-btn-primary)] data-[state=open]:bg-[var(--om-btn-primary)]" : undefined}>
          <span className="ps-[2px]">{label}</span>
          <ChevronDown size={chevron} strokeWidth={2} aria-hidden />
        </OutlineButton>
      }
    />
  );
}
