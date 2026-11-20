// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Site header: logo, navigation with three dropdown menus, and the sign-in buttons.
 * `variant="landing"` shows "Sign in" and "Sign up" to signed-out visitors; subpages, and the landing page
 * once signed in, show "Get started" instead. Only English ships, so there is no language selector.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { useSession } from "@/lib/supabase/client";
import { BrandLogo } from "./brand-logo";
import { navLinks, navMenus, type NavMenu, type NavMenuItem } from "./nav-data";
import { SignInTrigger } from "./sign-in-trigger";

export type HeaderVariant = "landing" | "site";

const navItemClass =
  "block cursor-pointer select-none rounded-[8px] px-3 py-1.5 text-[14px] font-medium leading-[20px] text-[var(--om-text-2)] transition-colors hover:bg-[var(--om-fill)]";

const CLOSE_DELAY_MS = 140;
const PANEL_WIDTH = 600;
const VIEWPORT_MARGIN = 16;

const menuItemClass =
  "flex items-start gap-[12px] rounded-[10px] px-[12px] py-[10px] text-[#1A1A1A] outline-none transition-colors hover:bg-[#F5F5F4] focus-visible:bg-[#F5F5F4]";

function MenuItemLink({ item, onNavigate }: { item: NavMenuItem; onNavigate: () => void }) {
  const content = (
    <>
      {item.icon}
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[14px] font-medium leading-[20px] text-[#1A1A1A]">{item.title}</span>
        <span className="text-[13px] leading-[18px] text-[#737373]">{item.description}</span>
      </span>
    </>
  );
  // Destinations that have no page yet stay inert instead of jumping to the top of the page.
  if (item.href === "#") {
    return (
      <a
        href="#"
        role="menuitem"
        className={menuItemClass}
        onClick={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} role="menuitem" onClick={onNavigate} className={menuItemClass}>
      {content}
    </Link>
  );
}

function DesktopMenu({
  menu,
  open,
  onOpen,
  onClose,
  onToggle,
  onScheduleClose,
}: {
  menu: NavMenu;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  onScheduleClose: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<string>("");

  // Keep the 600px panel inside the viewport on narrow desktop widths.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!open || !wrapper || !panel) return;
    const left = wrapper.getBoundingClientRect().left;
    const overflow = left + PANEL_WIDTH - (window.innerWidth - VIEWPORT_MARGIN);
    panel.style.left = `${-Math.max(0, Math.min(overflow, left - VIEWPORT_MARGIN))}px`;
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onOpen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onScheduleClose();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`nav-menu-${menu.id}`}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onClick={(event) => {
          // A mouse has already opened the menu by hovering, so its click must not close it again.
          const byMouse = event.detail !== 0 && lastPointer.current === "mouse";
          if (byMouse) onOpen();
          else onToggle();
        }}
        className={`${navItemClass} ${open ? "bg-[var(--om-fill)]" : ""}`}
      >
        {menu.label}
      </button>
      {open ? (
        // The 6px of top padding bridges the gap so the pointer can travel from the label to the panel.
        <div ref={panelRef} className="absolute left-0 top-full z-50 pt-[6px]">
          <div
            id={`nav-menu-${menu.id}`}
            role="menu"
            aria-label={menu.label}
            className="flex w-[600px] max-w-[calc(100vw-32px)] gap-[4px] rounded-[16px] border border-[#0000000F] bg-white p-[8px] shadow-[0px_16px_40px_#0000001A]"
          >
            {menu.columns.map((column, index) => (
              <div key={index} className="flex min-w-0 flex-1 basis-0 flex-col">
                {column.map((item) => (
                  <MenuItemLink key={item.title} item={item} onNavigate={onClose} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const signInButtonClass =
  "inline-flex h-[32px] min-w-[64px] cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] bg-[var(--om-btn-primary)] px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-inverse)] transition-colors hover:opacity-90 active:opacity-80";
const signUpButtonClass =
  "inline-flex h-[32px] min-w-[64px] cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-[8px] bg-transparent px-[8px] text-[14px] font-medium leading-[18px] text-[var(--om-text-1)] outline outline-1 -outline-offset-1 outline-[var(--om-btn-border)] transition-colors hover:bg-[var(--om-fill-subtle)] active:opacity-80";
const getStartedButtonClass =
  "inline-flex h-[32px] min-w-[64px] cursor-pointer items-center justify-center gap-[4px] whitespace-nowrap rounded-full bg-[var(--om-btn-primary)] px-[12px] text-[14px] font-medium leading-[18px] text-[var(--om-text-inverse)] transition-colors hover:opacity-90 active:opacity-80";

function AuthButtons({ showGetStarted, signedIn }: { showGetStarted: boolean; signedIn: boolean }) {
  if (showGetStarted) {
    return (
      <>
        {/* Signed-out visitors on subpages can still sign in to an existing account. */}
        {signedIn ? null : <SignInTrigger className={signUpButtonClass}>Sign in</SignInTrigger>}
        <SignInTrigger className={getStartedButtonClass}>Get started</SignInTrigger>
      </>
    );
  }
  return (
    <>
      <SignInTrigger className={signInButtonClass}>Sign in</SignInTrigger>
      <SignInTrigger className={signUpButtonClass}>Sign up</SignInTrigger>
    </>
  );
}

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav
      aria-label="Main"
      className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-56px)] overflow-y-auto border-t border-[var(--om-border)] bg-[var(--om-bg)] px-4 pb-6 pt-2 shadow-[0px_16px_40px_#0000001A] lg:hidden"
    >
      {navMenus.map((menu) => (
        <details key={menu.id} className="group border-b border-[var(--om-border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-3 text-[15px] font-medium leading-[22px] text-[var(--om-text-1)] [&::-webkit-details-marker]:hidden">
            {menu.label}
            <ChevronDown aria-hidden size={16} strokeWidth={2} className="text-[var(--om-icon-3)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-2">
            {menu.columns.flat().map((item) => (
              <MenuItemLink key={item.title} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </details>
      ))}
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="block border-b border-[var(--om-border)] px-2 py-3 text-[15px] font-medium leading-[22px] text-[var(--om-text-1)]"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteHeader({ variant = "site" }: { variant?: HeaderVariant }) {
  const { session } = useSession();
  const [openMenu, setOpenMenu] = useState<NavMenu["id"] | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closeMenus = useCallback(() => {
    cancelClose();
    setOpenMenu(null);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenMenu(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Escape and clicks outside close whichever menu is open.
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenus();
        setMobileOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (openMenu && navRef.current && !navRef.current.contains(event.target as Node)) closeMenus();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openMenu, mobileOpen, closeMenus]);

  const showGetStarted = variant === "site" || Boolean(session);

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--om-bg)]">
      <div className="mx-auto grid h-[56px] w-full max-w-[1080px] grid-cols-[auto_1fr] items-center px-6 py-3 lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="Home" className="w-fit">
          <BrandLogo />
        </Link>

        <nav
          ref={navRef}
          aria-label="Main"
          className="hidden items-center gap-2 justify-self-center lg:flex"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenus();
          }}
        >
          {navMenus.map((menu) => (
            <DesktopMenu
              key={menu.id}
              menu={menu}
              open={openMenu === menu.id}
              onOpen={() => {
                cancelClose();
                setOpenMenu(menu.id);
              }}
              onClose={closeMenus}
              onToggle={() => {
                cancelClose();
                setOpenMenu((current) => (current === menu.id ? null : menu.id));
              }}
              onScheduleClose={scheduleClose}
            />
          ))}
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={navItemClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 justify-self-end lg:flex">
          <AuthButtons showGetStarted={showGetStarted} signedIn={Boolean(session)} />
        </div>

        <div className="flex items-center gap-3 justify-self-end lg:hidden">
          <div className="flex items-center gap-2">
            <AuthButtons showGetStarted={showGetStarted} signedIn={Boolean(session)} />
          </div>
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
            className="flex size-[28px] cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-1)] transition-colors hover:bg-[var(--om-fill)]"
          >
            {mobileOpen ? <X aria-hidden size={20} strokeWidth={1.8} /> : <Menu aria-hidden size={20} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
      {mobileOpen ? <MobileMenu onNavigate={() => setMobileOpen(false)} /> : null}
    </header>
  );
}
