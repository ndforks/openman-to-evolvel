// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Artwork for the Websites page: the sample site in the preview card and the example thumbnails. */
import { Lock } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PUBLISH_DOMAIN, type WebsiteArt } from "../data/websites";

/** The browser window inside the preview card: a made-up bakery's pre-order page. */
export function SitePreview() {
  const loaf: CSSProperties = { width: 46, height: 30, borderRadius: "23px 23px 8px 8px", flexShrink: 0, backgroundImage: "linear-gradient(180deg, #E7A85C 0%, #B86B2B 100%)", boxShadow: "inset 0 -4px 0 #00000026" };
  return (
    <div aria-hidden className="flex min-h-0 flex-col overflow-clip rounded-[12px] border border-[var(--om-border-strong)]">
      <div className="relative flex h-[26px] shrink-0 items-center bg-[#262626] px-[10px]">
        <div className="flex gap-[5px]">
          <div className="h-[6px] w-[6px] rounded-[3px] bg-[#555555]" />
          <div className="h-[6px] w-[6px] rounded-[3px] bg-[#555555]" />
          <div className="h-[6px] w-[6px] rounded-[3px] bg-[#555555]" />
        </div>
        <div className="absolute left-[90px] top-[4px] flex h-[18px] w-[180px] items-center justify-center gap-[4px] rounded-[6px] bg-[#303030]">
          <Lock size={9} strokeWidth={2.4} color="#B3B3B3" className="shrink-0" />
          <div className="text-[10px] leading-[14px] text-[var(--om-text-2)]">fern-and-flour.{PUBLISH_DOMAIN}</div>
        </div>
      </div>
      <div className="relative flex h-[198px] min-h-0 shrink-0 flex-col overflow-clip bg-[#F6EFE4] px-[16px] pt-[12px]">
        <div className="flex items-center justify-between">
          <div style={{ color: "#3B2A1A", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em" }}>FERN &amp; FLOUR</div>
          <div className="flex gap-[8px]" style={{ color: "#6B5440", fontSize: 6, fontWeight: 600 }}>
            <span>MENU</span>
            <span>VISIT</span>
            <span>ORDER</span>
          </div>
        </div>
        <div className="mt-[18px] flex items-start justify-between gap-[12px]">
          <div className="flex min-w-0 flex-col gap-[6px]">
            <div style={{ color: "#3B2A1A", fontSize: 18, fontWeight: 800, lineHeight: "19px", letterSpacing: "-0.02em" }}>
              Tomorrow&apos;s bread,
              <br />
              saved for you.
            </div>
            <div style={{ color: "#6B5440", fontSize: 7, lineHeight: "10px", maxWidth: 150 }}>Reserve by 8 pm, collect warm from 7 am. Sourdough, rye and seeded loaves.</div>
            <div className="mt-[4px] flex h-[18px] w-fit items-center rounded-[9px] px-[10px]" style={{ backgroundColor: "#2F5D3A", color: "#FFFFFF", fontSize: 7, fontWeight: 700 }}>
              Reserve a loaf
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-[6px] pt-[4px]">
            <div className="flex gap-[6px]">
              <div style={loaf} />
              <div style={{ ...loaf, width: 38, height: 26, backgroundImage: "linear-gradient(180deg, #8C5A35 0%, #5E3A20 100%)" }} />
            </div>
            <div style={{ ...loaf, width: 72, height: 22, borderRadius: 11 }} />
          </div>
        </div>
        <div className="absolute inset-x-[16px] bottom-[12px] grid grid-cols-3 gap-[6px]">
          {["Sourdough", "Dark rye", "Seeded"].map((name) => (
            <div key={name} className="flex h-[30px] flex-col justify-center rounded-[6px] bg-white/80 px-[6px]">
              <div style={{ color: "#3B2A1A", fontSize: 6.5, fontWeight: 700 }}>{name}</div>
              <div style={{ color: "#8A7360", fontSize: 5.5 }}>12 left</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHADE_DARK = "linear-gradient(in oklab 180deg, #00000000 45%, #000000BF 100%)";
const SHADE = "linear-gradient(in oklab 180deg, #00000000 45%, #000000B3 100%)";

const bar = (width: number | string, height: number, color: string): CSSProperties => ({ width, height, flexShrink: 0, borderRadius: 2, backgroundColor: color });

const THUMBS: Record<WebsiteArt, { background: string; body: ReactNode }> = {
  bakery: {
    background: `${SHADE_DARK}, linear-gradient(in oklab 150deg, #6B4A2B 0%, #3B2A1A 100%)`,
    body: (
      <div className="flex flex-col gap-[5px]">
        <div style={bar(100, 12, "#FFFFFF8C")} />
        <div style={bar(80, 12, "#FFFFFF8C")} />
      </div>
    ),
  },
  portal: {
    background: `${SHADE}, linear-gradient(in oklab 180deg, #F3F2EE 0%, #E6E4DC 100%)`,
    body: (
      <div className="flex gap-[8px]">
        <div style={{ width: 70, height: 56, flexShrink: 0, borderRadius: 4, backgroundColor: "#1F4A3A" }} />
        <div className="flex flex-1 flex-col gap-[5px]">
          <div style={bar("100%", 5, "#C9C6BC")} />
          <div style={bar("70%", 5, "#C9C6BC")} />
          <div style={bar("85%", 5, "#C9C6BC")} />
        </div>
      </div>
    ),
  },
  board: {
    background: `${SHADE}, linear-gradient(in oklab 180deg, #FAFAFA 0%, #ECECEC 100%)`,
    body: (
      <div className="flex flex-col gap-[5px]">
        <div style={bar("100%", 5, "#D0D0D0")} />
        <div style={bar("80%", 5, "#D0D0D0")} />
        <div className="flex gap-[4px]">
          <div style={bar(22, 6, "#46A758")} />
          <div style={bar(22, 6, "#E5484D")} />
          <div style={bar(22, 6, "#1F2A44")} />
        </div>
      </div>
    ),
  },
  clinic: {
    background: `${SHADE}, linear-gradient(in oklab 170deg, #4F7C86 0%, #24434A 100%)`,
    body: (
      <div className="flex flex-col gap-[5px]">
        <div style={bar(120, 8, "#FFFFFFB3")} />
        <div style={bar(40, 8, "#F5B301")} />
      </div>
    ),
  },
  shop: {
    background: `${SHADE_DARK}, linear-gradient(in oklab 160deg, #3A3A3A 0%, #1C1C1C 100%)`,
    body: (
      <div className="flex flex-col gap-[5px]">
        <div style={bar(64, 10, "#FFFFFFA6")} />
        <div style={bar(36, 4, "#E0672B")} />
      </div>
    ),
  },
  photo: {
    background: `${SHADE}, linear-gradient(in oklab 180deg, #8F959A 0%, #4A4F53 100%)`,
    body: (
      <div className="flex items-start justify-between">
        <div style={bar(46, 6, "#FFFFFFCC")} />
        <div style={bar(22, 4, "#FFFFFF80")} />
      </div>
    ),
  },
  cards: {
    background: `${SHADE}, linear-gradient(in oklab 180deg, #F6EFE3 0%, #EAD9BF 100%)`,
    body: (
      <div className="flex flex-col gap-[5px]">
        <div style={bar(96, 7, "#5B4631")} />
        <div className="flex gap-[4px]">
          <div style={bar(40, 18, "#F2B68A")} />
          <div style={bar(40, 18, "#B9D7A8")} />
          <div style={bar(40, 18, "#A9C8E8")} />
        </div>
      </div>
    ),
  },
  quiz: {
    background: `${SHADE}, linear-gradient(in oklab 180deg, #F7F8F6 0%, #E8EFE3 100%)`,
    body: (
      <div className="flex items-start gap-[8px]">
        <div style={{ width: 64, height: 40, flexShrink: 0, borderRadius: 4, backgroundColor: "#46C24A" }} />
        <div className="flex flex-1 flex-col gap-[5px]">
          <div style={bar("90%", 5, "#C7CFC2")} />
          <div style={bar("60%", 5, "#C7CFC2")} />
        </div>
      </div>
    ),
  },
};

/** Background and sketch for a template thumbnail. */
export function templateThumb(art: WebsiteArt): { background: string; body: ReactNode } {
  return THUMBS[art];
}
