"use client";

/**
 * Settings → Shortcuts.
 * Bindings live in the synced `shortcuts.bindings` preference (see `../shortcuts.ts`); `useAppShortcuts()`
 * in the shell honours them.
 */
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePref } from "@/components/settings/prefs";
import { DEFAULT_SHORTCUTS, SHORTCUTS_PREF, comboFromEvent, isApple, sameCombo, useShortcutBindings, type ShortcutAction, type ShortcutBindings } from "@/components/settings/shortcuts";
import { Button, DIVIDER, cn } from "@/components/settings/ui";

const ACTIONS: { id: ShortcutAction; label: string; hint?: string }[] = [
  { id: "newTask", label: "New task" },
  { id: "voiceInput", label: "Voice input" },
  { id: "searchTask", label: "Find a task" },
  { id: "toggleSidebar", label: "Toggle sidebar" },
  { id: "copyTaskLink", label: "Copy task link", hint: "Works inside an open task" },
];

function keyLabel(token: string, apple: boolean): string {
  switch (token) {
    case "Mod":
      return apple ? "⌘" : "Ctrl";
    case "Meta":
      return apple ? "⌘" : "Win";
    case "Ctrl":
      return apple ? "⌃" : "Ctrl";
    case "Alt":
      return apple ? "⌥" : "Alt";
    case "Shift":
      return "⇧";
    default:
      return token;
  }
}

function Keycap({ label }: { label: string }) {
  return (
    <span className={cn("flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-[6px] border border-[var(--om-border)] bg-[var(--om-card)] px-[6px] text-[13px] leading-[19.5px] text-[var(--om-text-2)]")}>
      {label}
    </span>
  );
}

export default function ShortcutsTab() {
  const bindings = useShortcutBindings();
  const [, setStored] = usePref<ShortcutBindings>(SHORTCUTS_PREF, DEFAULT_SHORTCUTS);
  const setBindings = useCallback(
    (next: ShortcutBindings | ((prev: ShortcutBindings) => ShortcutBindings)) => setStored((prev) => (typeof next === "function" ? next({ ...DEFAULT_SHORTCUTS, ...prev }) : next)),
    [setStored],
  );
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const apple = isApple();

  useEffect(() => {
    if (!recording) return;
    // Capture on window so the key never reaches the dialog (Escape) or the app's own shortcut handlers.
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (bare && (e.key === "Backspace" || e.key === "Delete")) {
        setBindings((prev) => ({ ...prev, [recording]: null }));
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e, isApple());
      if (!combo) return;
      setBindings((prev) => {
        const next: ShortcutBindings = { ...prev };
        // One combination, one action: take it away from whichever action had it.
        (Object.keys(next) as ShortcutAction[]).forEach((id) => {
          if (id !== recording && sameCombo(next[id], combo)) next[id] = null;
        });
        next[recording] = combo;
        return next;
      });
      setRecording(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest(`[data-shortcut-box="${recording}"]`)) setRecording(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [recording, setBindings]);

  return (
    <div className="flex flex-col">
      <div className={cn("flex flex-col gap-[4px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
        <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">Keyboard shortcuts</h2>
        <p className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Click a key combo, then press the keys you want instead.</p>
      </div>
      <div className="pt-[24px]" />

      {ACTIONS.map((action) => {
        const combo = bindings[action.id] ?? null;
        const active = recording === action.id;
        return (
          <div key={action.id} className="flex shrink-0 items-center justify-between gap-[16px] border-b border-[var(--om-border)] py-[16px]">
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{action.label}</span>
              {action.hint ? <span className="block truncate pt-[4px] text-[12px] leading-[16px] text-[var(--om-text-3)]">{action.hint}</span> : null}
            </div>
            <div
              role="button"
              tabIndex={0}
              data-shortcut-box={action.id}
              aria-label={`Change the shortcut for ${action.label}`}
              aria-pressed={active}
              onClick={() => setRecording(action.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setRecording(action.id);
                }
              }}
              className={cn(
                "flex h-[36px] w-[230px] shrink-0 cursor-pointer items-center gap-[4px] rounded-[8px] border pl-[6px] pr-[4px] outline-none transition-colors",
                active ? "border-[var(--om-border-focus)] bg-[var(--om-fill-subtle)]" : "border-[var(--om-border-strong)] hover:bg-[var(--om-fill-subtle)] focus-visible:border-[var(--om-border-focus)]",
              )}
            >
              {active ? (
                <span className="pl-[4px] text-[13px] leading-[18px] text-[var(--om-text-3)]">Press keys…</span>
              ) : combo ? (
                combo.map((token, i) => <Keycap key={`${token}-${i}`} label={keyLabel(token, apple)} />)
              ) : (
                <span className="pl-[4px] text-[13px] leading-[18px] text-[var(--om-text-4)]">Not set</span>
              )}
              <span className="flex-1" />
              {combo && !active ? (
                <button
                  type="button"
                  aria-label={`Clear the shortcut for ${action.label}`}
                  title="Clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBindings((prev) => ({ ...prev, [action.id]: null }));
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-3)] outline-none transition-colors hover:text-[var(--om-text-1)] focus-visible:text-[var(--om-text-1)]"
                >
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end pb-[16px] pt-[24px]">
        <Button
          onClick={() => {
            setRecording(null);
            setBindings(DEFAULT_SHORTCUTS);
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
