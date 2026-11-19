"use client";

/**
 * Notifications popover opened by the bell in the sidebar's user row, on `/api/notifications`.
 * Opening it marks everything read (`POST /api/notifications/read`); the bell shows a dot while something is unread.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { cn } from "@/components/ui/cn";
import { BellIcon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { taskTime } from "./task-list";

type Tab = "all" | "updates" | "messages";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "updates", label: "Updates" },
  { id: "messages", label: "Messages" },
];

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Kinds that are messages (mail, texts, calls); everything else is an update. */
const MESSAGE_KINDS = new Set(["message", "mail", "email", "sms", "phone", "call"]);

interface NotificationsState {
  items: AppNotification[];
  unread: number;
  status: "idle" | "ready" | "error";
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  unread: 0,
  status: "idle",
  refresh: async () => {
    try {
      const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { notifications: AppNotification[]; unread: number };
      set({ items: body.notifications ?? [], unread: body.unread ?? 0, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
  markAllRead: async () => {
    if (get().unread === 0) return;
    set((s) => ({ unread: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  },
}));

const POLL_MS = 60_000;

/** Loads the list on mount and once a minute while the tab is visible. */
export function useNotificationsSync(): number {
  const unread = useNotifications((s) => s.unread);
  useEffect(() => {
    const load = () => {
      if (document.visibilityState === "visible") void useNotifications.getState().refresh();
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
  return unread;
}

function NoticeItem({ notice, onOpen }: { notice: AppNotification; onOpen: (n: AppNotification) => void }) {
  const inner = (
    <>
      <div className="flex items-start gap-[8px]">
        <h3 className="min-w-0 flex-1 pb-[4px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{notice.title}</h3>
        {notice.read ? null : <span aria-label="Unread" className="mt-[7px] size-[6px] shrink-0 rounded-full bg-[var(--om-icon-accent)]" />}
      </div>
      {notice.body ? <p className="w-full text-[14px] leading-[20px] text-[var(--om-text-3)]">{notice.body}</p> : null}
      <time dateTime={notice.createdAt} className="block pt-[12px] text-[13px] leading-[18px] text-[var(--om-text-3)]">
        {taskTime(notice.createdAt)}
      </time>
    </>
  );
  return (
    <article className="border-b border-[var(--om-border)] last:border-b-0">
      {notice.link ? (
        <button type="button" onClick={() => onOpen(notice)} className="-mx-[8px] my-[8px] block w-[calc(100%+16px)] cursor-pointer rounded-[10px] px-[8px] py-[8px] text-left outline-none hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]">
          {inner}
        </button>
      ) : (
        <div className="py-[16px]">{inner}</div>
      )}
    </article>
  );
}

export function NotificationsPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState(false);
  const items = useNotifications((s) => s.items);
  const status = useNotifications((s) => s.status);
  const shown = items.filter((n) => tab === "all" || (tab === "messages") === MESSAGE_KINDS.has(n.kind));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void useNotifications.getState().refresh().then(() => useNotifications.getState().markAllRead());
  };
  const openNotice = (n: AppNotification) => {
    setOpen(false);
    if (n.link?.startsWith("/")) router.push(n.link);
    else if (n.link) window.open(n.link, "_blank", "noopener");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* Panel: 400 x 600, 12 px radius, half-pixel border, opening beside the bell with its bottom aligned. */}
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Notifications"
        className="flex h-[600px] max-h-[calc(100vh-32px)] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[12px] border-[0.5px] border-[var(--om-border-strong)] shadow-[0px_0px_0px_1px_var(--om-shadow-xs),0px_4px_32px_0px_var(--om-shadow-sm)] backdrop-blur-[40px]"
      >
        <div className="shrink-0 space-y-[12px] overflow-hidden px-[16px] pb-[8px] pt-[16px]">
          <h2 className="shrink-0 whitespace-nowrap text-[18px] font-medium leading-[24px] text-[var(--om-text-1)]">Notifications</h2>
          <div role="tablist" className="flex min-h-[32px] flex-wrap items-center gap-[4px] overflow-hidden">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex h-[32px] min-w-[48px] cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none transition-colors",
                  tab === id ? "bg-[var(--om-fill-strong)] font-medium text-[var(--om-text-1)]" : "font-normal text-[var(--om-text-3)] hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]",
                )}
              >
                {/* The bold label reserves the width, so the tab does not shift when it becomes active. */}
                <span className="relative">
                  <span className="absolute inset-0 flex items-center justify-center">{label}</span>
                  <span aria-hidden="true" className="invisible font-medium">
                    {label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[16px] [scrollbar-width:thin]">
          {status === "idle" ? (
            <div aria-busy="true" className="flex flex-col gap-[12px] py-[16px]">
              {[0, 1].map((i) => (
                <div key={i} className="flex flex-col gap-[8px]">
                  <div className="h-[16px] w-2/3 animate-pulse rounded-[4px] bg-[var(--om-fill)]" />
                  <div className="h-[14px] w-full animate-pulse rounded-[4px] bg-[var(--om-fill)]" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex h-full w-full flex-1 items-center justify-center text-[var(--om-text-3)]">
              <div className="space-y-[8px] pb-[142px] text-center">
                <BellIcon size={32} className="mx-auto" />
                <p className="text-[14px] leading-[20px]">{status === "error" ? "Could not load notifications" : tab === "updates" ? "You are all caught up" : "Your inbox is empty"}</p>
              </div>
            </div>
          ) : (
            shown.map((notice) => <NoticeItem key={notice.id} notice={notice} onOpen={openNotice} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
