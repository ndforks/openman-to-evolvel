"use client";

/**
 * Catches links that lead nowhere yet and answers them with a short toast:
 * `href="#"` placeholders, and links to the brand's own site (help centre, docs, trust centre),
 * which is not online yet and would open a browser error page.
 * Mount once per layout, next to `<Toaster />`. Set NEXT_PUBLIC_BRAND_SITE_LIVE=1 once the site exists.
 */
import { useEffect } from "react";
import { brand } from "@/config/brand";
import { toast } from "./toast";

const MAX_LABEL = 40;
const BRAND_SITE_LIVE = process.env.NEXT_PUBLIC_BRAND_SITE_LIVE === "1";

function leadsNowhere(link: HTMLAnchorElement): boolean {
  const href = link.getAttribute("href") ?? "";
  if (href === "#" || href === "") return true;
  if (BRAND_SITE_LIVE) return false;
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname !== window.location.hostname && (url.hostname === brand.host || url.hostname.endsWith(`.${brand.host}`));
  } catch {
    return false;
  }
}

export function LinkGuard() {
  useEffect(() => {
    /** Message for the click in progress, worked out while the link is still on screen. */
    let pending: string | null = null;

    // Capture phase: read the link's name before any handler closes the menu it sits in.
    const onCapture = (event: MouseEvent) => {
      pending = null;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !leadsNowhere(link)) return;
      // Menu entries carry a title and a description: the first line is the name.
      const label = (link.getAttribute("aria-label") ?? link.innerText ?? "").trim().split("\n")[0].replace(/\s+/g, " ").trim();
      pending = label !== "" && label.length <= MAX_LABEL ? `${label}: coming soon` : "Coming soon";
    };
    // Bubble phase at the document: menus and other handlers have already reacted (a menu item closes its menu),
    // and the browser has not followed the link yet, so cancelling here still stops the navigation.
    const onBubble = (event: MouseEvent) => {
      if (pending === null) return;
      event.preventDefault();
      toast(pending);
      pending = null;
    };
    document.addEventListener("click", onCapture, true);
    document.addEventListener("click", onBubble);
    return () => {
      document.removeEventListener("click", onCapture, true);
      document.removeEventListener("click", onBubble);
    };
  }, []);

  return null;
}
