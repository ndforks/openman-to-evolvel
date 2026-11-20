// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Sign-in modal. Opens whenever `useUI().open("sign-in")` is called.
 * Optional props passed to `open`: `source` ("composer" shows the "message is saved" subtitle),
 * `next` (same-site path to land on afterwards) and `error` (message to show on open).
 *
 * The panel is `OrgoSignIn` (also on the `/signin` page): one primary "Continue with Orgo", "Use an API key instead",
 * and, on a server on this machine with local sign-in on, "Sign in with this computer's Orgo key".
 */
import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { safeNextPath } from "@/lib/supabase/config";
import { BrandMark } from "./brand-logo";
import { libreBaskerville } from "./fonts";
import { OrgoSignIn } from "./orgo-sign-in";

/* ------------------------------------------------------------------ showcase */

interface Slide {
  id: string;
  caption: string;
  /** Six abstract tiles: three in the left column, three in the right. */
  tiles: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode, ReactNode];
}

function Tile({ background, children }: { background: string; children?: ReactNode }) {
  return (
    <div className="flex h-[102px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[8px]" style={{ background }}>
      {children}
    </div>
  );
}

const slides: Slide[] = [
  {
    id: "website",
    caption: "Describe a site; get it built, hosted and live.",
    tiles: [
      <Tile key="a" background="linear-gradient(135deg in oklab, #F4F1EA 0%, #DAD3C3 100%)" />,
      <Tile key="b" background="linear-gradient(160deg in oklab, #1F2937 0%, #0B1220 100%)" />,
      <Tile key="c" background="linear-gradient(180deg in oklab, #CFE3FF 0%, #7FA8F5 100%)" />,
      <Tile key="d" background="linear-gradient(160deg in oklab, #FFD9B8 0%, #F08A5D 60%, #B83B5E 100%)" />,
      <Tile key="e" background="repeating-linear-gradient(90deg, #EDEDEC 0px, #EDEDEC 22px, #E2E2E0 22px, #E2E2E0 23px)" />,
      <Tile key="f" background="#14261C">
        <div className="h-[44px] w-[96px] rounded-[6px] border-2 border-[#7CF03A]" />
      </Tile>,
    ],
  },
  {
    id: "files",
    caption: "Go from a rough brief to a finished file.",
    tiles: [
      <Tile key="a" background="linear-gradient(135deg in oklab, #D4FF3A 0%, #A6E01A 100%)" />,
      <Tile key="b" background="radial-gradient(ellipse 60% 80% at 50% 50% in oklab, #0F3B2E 0%, #050A08 100%)" />,
      <Tile key="c" background="linear-gradient(180deg in oklab, #8A8F94 0%, #5B5348 100%)" />,
      <Tile key="d" background="linear-gradient(160deg in oklab, #F28B1E 0%, #A3341B 60%, #3B2A4A 100%)" />,
      <Tile
        key="e"
        background="repeating-conic-gradient(at 50% 60%, rgb(34,36,90) 0deg, rgb(34,36,90) 8deg, rgb(26,28,72) 8deg, rgb(26,28,72) 16deg)"
      />,
      <Tile key="f" background="#11143A">
        <div className="size-[64px] shrink-0 rounded-[32px] border-4 border-[#E94DD2] shadow-[0px_0px_0px_4px_#3AD1FF,0px_0px_0px_8px_#7CF03A]" />
      </Tile>,
    ],
  },
  {
    id: "research",
    caption: "Hand off the hours of digging through sources.",
    tiles: [
      <Tile key="a" background="linear-gradient(180deg in oklab, #FBFAF7 0%, #E9E5DA 100%)" />,
      <Tile key="b" background="repeating-linear-gradient(0deg, #1B2A5A 0px, #1B2A5A 11px, #223470 11px, #223470 12px)" />,
      <Tile key="c" background="linear-gradient(135deg in oklab, #C7DCF0 0%, #7896C8 100%)" />,
      <Tile key="d" background="linear-gradient(160deg in oklab, #2E2A25 0%, #5B5348 100%)" />,
      <Tile key="e" background="linear-gradient(135deg in oklab, #F6E7A6 0%, #E3B95B 100%)" />,
      <Tile key="f" background="#F0F0EF">
        <div className="flex h-[52px] items-end gap-[8px]">
          <div className="h-[20px] w-[14px] rounded-[2px] bg-[#4D4D4D]" />
          <div className="h-[34px] w-[14px] rounded-[2px] bg-[#4D4D4D]" />
          <div className="h-[26px] w-[14px] rounded-[2px] bg-[#4D4D4D]" />
          <div className="h-[52px] w-[14px] rounded-[2px] bg-[#0081F2]" />
        </div>
      </Tile>,
    ],
  },
  {
    id: "automation",
    caption: "Set recurring jobs that start on a timer or an event.",
    tiles: [
      <Tile key="a" background="linear-gradient(135deg in oklab, #1A1A19 0%, #34322D 100%)" />,
      <Tile key="b" background="linear-gradient(160deg in oklab, #7F86E0 0%, #3C4FA8 100%)" />,
      <Tile key="c" background="linear-gradient(180deg in oklab, #E8F6EC 0%, #A9DDB8 100%)" />,
      <Tile key="d" background="radial-gradient(ellipse 70% 90% at 50% 100% in oklab, #F28B1E 0%, #3B2A4A 100%)" />,
      <Tile key="e" background="#FFFFFF">
        <div className="flex items-center gap-[6px]">
          <div className="size-[18px] rounded-full bg-[#1A1A19]" />
          <div className="h-[2px] w-[22px] bg-[#C9C9C7]" />
          <div className="size-[18px] rounded-[5px] bg-[#0081F2]" />
          <div className="h-[2px] w-[22px] bg-[#C9C9C7]" />
          <div className="size-[18px] rounded-full bg-[#3DA546]" />
        </div>
      </Tile>,
      <Tile key="f" background="linear-gradient(135deg in oklab, #2B2B2B 0%, #6A6A6A 100%)" />,
    ],
  },
];

const SLIDE_SECONDS = 5;

function Showcase() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return (
    <div className="hidden w-[401px] shrink-0 flex-col justify-between bg-[#F0F0EF] px-[15px] pb-[25px] pt-[21px] md:flex">
      <style>{"@keyframes signin-progress-fill{from{width:0}to{width:100%}}"}</style>
      <div key={slide.id} className="flex gap-[8px]">
        <div className="flex w-[182px] shrink-0 flex-col gap-[8px]">{slide.tiles.slice(0, 3)}</div>
        <div className="flex w-[182px] shrink-0 flex-col gap-[8px] pt-[36px]">{slide.tiles.slice(3)}</div>
      </div>
      <div className="flex flex-col gap-[20px] px-[7px]">
        <p className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{slide.caption}</p>
        <div className="flex gap-[8px]">
          {slides.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.caption}
              aria-current={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
              className="flex h-[11px] min-w-0 flex-1 cursor-pointer items-center"
            >
              <span className={`block h-[3px] w-full overflow-hidden rounded-[2px] ${itemIndex < index ? "bg-[#4D4D4D]" : "bg-[#DEDEDD]"}`}>
                {itemIndex === index ? (
                  <span
                    key={index}
                    className="block h-full rounded-[2px] bg-[#4D4D4D]"
                    style={{ animation: `signin-progress-fill ${SLIDE_SECONDS}s linear forwards` }}
                    onAnimationEnd={() => setIndex((current) => (current + 1) % slides.length)}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ auth panel */

function AuthPanel({ source, next, initialError }: { source?: string; next: string; initialError?: string }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-y-auto bg-[var(--om-bg)] px-[24px] pb-[16px] pt-[38px] sm:px-[46px]">
      <Dialog.Close
        aria-label="Close"
        className="absolute right-[22px] top-[20px] flex size-[24px] cursor-pointer items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--om-fill)]"
      >
        <X aria-hidden size={18} strokeWidth={1.8} className="text-[#4D4D4D]" />
      </Dialog.Close>
      <BrandMark width={40} height={40} className="shrink-0" />
      <OrgoSignIn next={next} source={source} initialError={initialError} Title={Dialog.Title} Description={Dialog.Description} />
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function SignInModal() {
  const modal = useUI((state) => state.modal);
  const close = useUI((state) => state.close);
  const open = modal?.name === "sign-in";
  const props = open ? (modal?.props ?? {}) : {};
  const source = typeof props.source === "string" ? props.source : undefined;
  const initialError = typeof props.error === "string" ? props.error : undefined;
  const next = safeNextPath(typeof props.next === "string" ? props.next : null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[#00000052]" />
        <Dialog.Content
          // Keep focus on the dialog itself instead of ringing the first carousel bar.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          className={`${libreBaskerville.variable} fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-32px)] min-h-[min(520px,calc(100dvh-32px))] w-[802px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-clip rounded-[20px] font-sans text-[var(--om-text-1)] antialiased shadow-[0px_24px_64px_#0000002E] outline-none`}
        >
          <Showcase />
          <AuthPanel source={source} next={next} initialError={initialError} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default SignInModal;
