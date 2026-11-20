// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Keyboard shortcuts: the bindings model (stored in the synced `shortcuts.bindings` preference) and
 * `useAppShortcuts()`, the one global handler that honours them. Mount it once in the app shell.
 * A binding is a token list such as ["Mod", "Shift", "O"]; "Mod" is ⌘ on Apple devices and Ctrl elsewhere.
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUI } from "@/lib/ui-store";
import { usePref } from "./prefs";

export type ShortcutAction = "newTask" | "voiceInput" | "searchTask" | "toggleSidebar" | "copyTaskLink";
export type ShortcutCombo = string[];
export type ShortcutBindings = Record<ShortcutAction, ShortcutCombo | null>;

export const SHORTCUTS_PREF = "shortcuts.bindings";

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  newTask: ["Mod", "Shift", "O"],
  voiceInput: ["Ctrl", "D"],
  searchTask: ["Mod", "K"],
  toggleSidebar: ["Mod", "."],
  copyTaskLink: ["Mod", "Shift", "L"],
};

/** Fired on `window` when the voice-input shortcut is pressed; the composer listens for it. */
export const VOICE_INPUT_EVENT = "om:voice-input";

export function isApple(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

const CODE_LABELS: Record<string, string> = {
  Period: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
  Enter: "↵",
  Tab: "Tab",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "AltGraph", "Shift", "CapsLock", "Fn", "Dead", "Unidentified", "Process"]);

function mainKey(e: KeyboardEvent): string {
  if (e.code.startsWith("Key")) return e.code.slice(3);
  if (e.code.startsWith("Digit")) return e.code.slice(5);
  if (CODE_LABELS[e.code]) return CODE_LABELS[e.code];
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** Turn a keydown into a binding. Returns null while only modifiers are held or the combination is not usable. */
export function comboFromEvent(e: KeyboardEvent, apple = isApple()): ShortcutCombo | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const combo: ShortcutCombo = [];
  if (apple) {
    if (e.metaKey) combo.push("Mod");
    if (e.ctrlKey) combo.push("Ctrl");
  } else {
    if (e.ctrlKey) combo.push("Mod");
    if (e.metaKey) combo.push("Meta");
  }
  if (e.altKey) combo.push("Alt");
  const isFunctionKey = /^F\d{1,2}$/.test(e.key);
  // A bare letter (or Shift + letter) would fire while typing, so a real modifier is required.
  if (combo.length === 0 && !isFunctionKey) return null;
  if (e.shiftKey) combo.push("Shift");
  combo.push(mainKey(e));
  return combo;
}

export function sameCombo(a: ShortcutCombo | null, b: ShortcutCombo | null): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

/** Stored bindings merged over the defaults (an action missing from storage keeps its default). */
export function useShortcutBindings(): ShortcutBindings {
  const [stored] = usePref<Partial<ShortcutBindings>>(SHORTCUTS_PREF, DEFAULT_SHORTCUTS);
  return { ...DEFAULT_SHORTCUTS, ...(stored ?? {}) };
}

/**
 * The app's global shortcut handler: new task, search, toggle sidebar, copy task link and voice input,
 * each on the combination the user bound in Settings > Shortcuts.
 */
export function useAppShortcuts(homeHref = "/app"): void {
  const bindings = useShortcutBindings();
  const router = useRouter();
  const pathname = usePathname();
  const open = useUI((s) => s.open);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const key = JSON.stringify(bindings);

  useEffect(() => {
    const current: ShortcutBindings = JSON.parse(key) as ShortcutBindings;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const combo = comboFromEvent(event);
      if (!combo) return;
      const action = (Object.keys(current) as ShortcutAction[]).find((id) => sameCombo(current[id], combo));
      if (!action) return;
      if (action === "copyTaskLink" && !pathname.startsWith("/app/task/")) return;
      event.preventDefault();
      switch (action) {
        case "newTask":
          router.push(homeHref);
          break;
        case "searchTask":
          open("search");
          break;
        case "toggleSidebar":
          toggleSidebar();
          break;
        case "copyTaskLink":
          void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
          break;
        case "voiceInput":
          window.dispatchEvent(new CustomEvent(VOICE_INPUT_EVENT));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, pathname, router, open, toggleSidebar, homeHref]);
}
