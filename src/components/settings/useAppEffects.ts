"use client";

/**
 * What the General and Shortcuts settings do outside the Settings dialog. Mount once in the app shell:
 * `useSettingsEffects()` runs the shortcut handler and the task-completion alerts.
 */
import { useEffect, useRef } from "react";
import { brand } from "@/config/brand";
import { useTasksStore } from "@/components/shell/tasks-store";
import { readPref } from "./prefs";
import { useAppShortcuts } from "./shortcuts";

const ACTIVE = new Set(["waking", "running"]);

function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.25);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // No audio: nothing to do.
  }
}

/** Browser notification and sound when a task completes while the user is away (`notify.browser`, `notify.sound`). */
export function useCompletionAlerts(): void {
  const tasks = useTasksStore((s) => s.tasks);
  const last = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const prev = last.current;
    last.current = new Map(tasks.map((t) => [t.id, t.status]));
    if (!prev) return; // First load: nothing "just" completed.
    const done = tasks.filter((t) => t.status === "completed" && ACTIVE.has(prev.get(t.id) ?? ""));
    if (done.length === 0) return;
    const away = document.hidden || !document.hasFocus();
    if (!away) return;
    if (readPref<boolean>("notify.sound", false)) beep();
    if (readPref<boolean>("notify.browser", false) && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const task of done.slice(0, 3)) {
        const n = new Notification(`${brand.name}: task completed`, { body: task.title, tag: `task-${task.id}` });
        n.onclick = () => {
          window.focus();
          // A full page load on purpose: it drops every in-memory store.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/app/task/${task.id}`);
        };
      }
    }
  }, [tasks]);
}

export function useSettingsEffects(): void {
  useAppShortcuts();
  useCompletionAlerts();
}
