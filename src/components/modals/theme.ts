"use client";

/**
 * Theme plumbing for portalled UI.
 * Radix portals render into <body>, which may sit outside the element that carries the `dark` class.
 * `useThemeClass()` returns "dark" (or "") so portalled content can re-declare the dark tokens on itself.
 */
import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "auto";

let hostEl: Element | null = null;
let hostDark = true; // the logged-in app renders dark by default
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function refresh(): void {
  const next = hostEl ? hostEl.closest(".dark") !== null : hostDark;
  if (next !== hostDark) {
    hostDark = next;
    listeners.forEach((fn) => fn());
  }
}

/** Ref callback for a marker element inside the app tree; tells us whether the app is currently dark. */
export function registerThemeHost(el: Element | null): void {
  if (el) hostEl = el;
  refresh();
}

/** Re-read the app's theme (call when a modal opens, in case something else switched it). */
export function syncTheme(): void {
  refresh();
}

/** Apply a theme choice to the element that carries the `dark` class (falls back to <html>). */
export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = hostEl?.closest(".dark, [data-theme-root]") ?? document.documentElement;
  root.setAttribute("data-theme-root", "");
  root.classList.toggle("dark", dark);
  refresh();
}

export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hostDark,
    () => true,
  );
}

/** Class to put on any portalled Radix content (dialog, select, dropdown, popover, tooltip). */
export function useThemeClass(): string {
  return useIsDark() ? "dark" : "";
}
