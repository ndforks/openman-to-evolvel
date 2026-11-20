// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Radix portals render into <body>, outside the element that carries the `dark` class,
 * so portalled content has to re-declare the theme on itself.
 * The app layout marks its wrapper with `data-app-root`; this hook mirrors that wrapper's theme.
 */
import { useSyncExternalStore } from "react";

export const APP_ROOT_ATTR = "data-app-root";

function appRoot(): Element | null {
  return document.querySelector(`[${APP_ROOT_ATTR}]`);
}

function subscribe(onChange: () => void): () => void {
  const root = appRoot();
  if (!root) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDark(): boolean {
  const root = appRoot();
  return root ? root.classList.contains("dark") : true;
}

/** "dark" or "": put it on any portalled content (menu, popover, tooltip). */
export function usePortalThemeClass(): string {
  const dark = useSyncExternalStore(subscribe, isDark, () => true);
  return dark ? "dark" : "";
}

/** Menu shadow: a highlight ring, a hairline and three soft drops. */
export const SHADOW_MENU =
  "shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_1px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)]";

/** Layer shadow (cards that lift on hover). */
export const SHADOW_LAYER =
  "shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_.5px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)]";

/** Menu and popover surface: the menu fill and the menu shadow (the ring is part of the shadow). */
export const MENU_SURFACE = `bg-[var(--om-surface)] text-[var(--om-text-1)] ${SHADOW_MENU}`;

/** The other floating surface (pickers above the input): a half-pixel border and a short drop. */
export const PICKER_SURFACE = "border-[0.5px] border-[var(--om-border-strong)] bg-[var(--om-surface)] text-[var(--om-text-1)] shadow-[0_4px_11px_0_var(--om-shadow-sm)]";

/** Highlight used by hovered and active rows. */
export const ROW_HIGHLIGHT = "bg-[var(--om-fill)]";
