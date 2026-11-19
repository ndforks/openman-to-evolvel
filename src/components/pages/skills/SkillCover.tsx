/** The little book cover drawn on skill cards: two colours and the title, generated from the skill. */
import { cx } from "../cx";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PALETTES: [string, string, string][] = [
  ["#E9E2C9", "#C9D7A7", "#3D2F6B"],
  ["#123A73", "#0C2550", "#FFFFFF"],
  ["#0B0B0B", "#1C1C1C", "#FFFFFF"],
  ["#F3E3CF", "#E9B9A1", "#C0472E"],
  ["#F1E2C4", "#D9B98E", "#4B3A2A"],
  ["#4B2D6B", "#2E1D4A", "#F2C86B"],
  ["#1F6B3A", "#0F3A1E", "#F3F0E8"],
  ["#E3EEF5", "#B9D2E3", "#1E3A5C"],
];

/** Dark backgrounds get light text. */
function textOn(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 140 ? "#FFFFFF" : "#2A2A2A";
}

export function coverFor(name: string, colors?: [string, string]): { background: string; color: string } {
  if (colors) return { background: `linear-gradient(180deg, ${colors[0]} 0%, ${colors[1]} 100%)`, color: textOn(colors[0]) };
  const [a, b, c] = PALETTES[hash(name) % PALETTES.length];
  return { background: `linear-gradient(180deg, ${a} 0%, ${b} 100%)`, color: c };
}

export function prettyName(name: string): string {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function SkillCover({ name, title, colors, size = "card", className }: { name: string; title?: string; colors?: [string, string]; size?: "card" | "detail"; className?: string }) {
  const { background, color } = coverFor(name, colors);
  const big = size === "detail";
  return (
    <div
      aria-hidden
      className={cx("flex shrink-0 overflow-hidden rounded-t-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.25)]", big ? "h-[156px] w-[132px] rotate-[4deg] p-[12px]" : "h-[160px] w-[120px] rounded-[2px] p-[10px] shadow-[2px_24px_60px_-20px_rgba(0,0,0,0.12)]", className)}
      style={{ backgroundImage: background }}
    >
      <div className="font-serif" style={{ color, fontSize: big ? 15 : 13, lineHeight: big ? "18px" : "16px", fontWeight: 600 }}>
        {title ?? prettyName(name)}
      </div>
    </div>
  );
}
