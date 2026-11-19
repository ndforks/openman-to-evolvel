"use client";

/**
 * Short messages that appear at the top of the window and leave by themselves.
 * Call `toast("Copied")` from anywhere; mount `<Toaster />` once per layout.
 */
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "./cn";

export type ToastTone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, tone: ToastTone) => number;
  dismiss: (id: number) => void;
}

const VISIBLE_MS = 2600;
const MAX_VISIBLE = 3;
let nextId = 1;

const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (message, tone) => {
    const id = nextId++;
    // The same message twice in a row replaces the first, so repeated clicks do not stack copies.
    set((state) => ({ items: [...state.items.filter((item) => item.message !== message), { id, message, tone }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

/** Show a message. Safe to call outside React. */
export function toast(message: string, tone: ToastTone = "info"): void {
  useToasts.getState().push(message, tone);
}

/** For controls whose feature is not built yet. */
export function comingSoon(feature: string): void {
  toast(`${feature} is coming soon`);
}

const KEYFRAMES = `@keyframes om-toast-in { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }`;

function ToneGlyph({ tone }: { tone: ToastTone }) {
  const color = tone === "success" ? "#61AA64" : tone === "error" ? "#E1474B" : "#1A93FE";
  const Glyph = tone === "success" ? CircleCheck : tone === "error" ? CircleAlert : Info;
  return <Glyph size={16} color={color} strokeWidth={2} aria-hidden="true" className="shrink-0" />;
}

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, dismiss]);

  return (
    <div
      data-toast=""
      role={item.tone === "error" ? "alert" : "status"}
      // Click-through (the container sets pointer-events: none), so a toast never blocks the control underneath it.
      className="flex max-w-[420px] items-center gap-2 rounded-[10px] border border-[#FFFFFF1F] bg-[#2E2E2E] py-2 pl-[10px] pr-3 text-[14px] leading-5 text-[#E6E6E6] shadow-[0_8px_28px_#00000066] [animation:om-toast-in_160ms_ease-out]"
    >
      <ToneGlyph tone={item.tone} />
      <span className="min-w-0 break-words">{item.message}</span>
    </div>
  );
}

/** Stack of current messages. Sits above dialogs so a toast raised from a modal is still visible. */
export function Toaster({ className }: { className?: string }) {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className={cn("pointer-events-none fixed inset-x-0 top-4 z-[300] flex flex-col items-center gap-2 px-4 font-sans antialiased", className)}>
      <style>{KEYFRAMES}</style>
      {items.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </div>
  );
}
