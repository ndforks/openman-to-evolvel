/** Small illustrations at the bottom of each Features card, built from CSS shapes and lucide icons. Decorative only. */
import type { ReactNode } from "react";
import {
  AppWindow,
  ArrowRight,
  BookOpen,
  CircleCheck,
  Clock,
  Code,
  FileText,
  Folder,
  Globe,
  Monitor,
  MousePointer2,
  PenTool,
  Presentation,
  Search,
  Sheet,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { FeatureArtId } from "./data";

const PANEL = "rounded-[10px] bg-white shadow-[0px_6px_16px_#0000000F]";

function Line({ width, tone = "#ECECEA" }: { width: number | string; tone?: string }) {
  return <div className="h-[7px] shrink-0 rounded-full" style={{ width, backgroundColor: tone }} />;
}

/** A rounded square holding one icon. */
function Badge({ icon: Icon, bg, fg, size = 44 }: { icon: LucideIcon; bg: string; fg: string; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: size, height: size, backgroundColor: bg }}>
      <Icon aria-hidden size={Math.round(size * 0.5)} strokeWidth={1.8} color={fg} />
    </div>
  );
}

const art: Record<FeatureArtId, () => ReactNode> = {
  websites: () => (
    <div className={`flex h-[112px] w-[180px] shrink-0 flex-col gap-[8px] p-[10px] ${PANEL}`}>
      <div className="flex items-center gap-[6px] rounded-full bg-[#F3F3F1] px-[8px] py-[3px]">
        <Globe aria-hidden size={10} color="#8A8A86" />
        <Line width={70} tone="#DCDCD8" />
      </div>
      <div className="h-[30px] shrink-0 rounded-[6px] bg-[#DCE8F7]" />
      <div className="flex gap-[6px]">
        <div className="h-[22px] flex-1 rounded-[5px] bg-[#F3EDE4]" />
        <div className="h-[22px] flex-1 rounded-[5px] bg-[#E7F2E8]" />
        <div className="h-[22px] flex-1 rounded-[5px] bg-[#F1E7F4]" />
      </div>
    </div>
  ),

  publishing: () => (
    <div className="relative h-[110px] w-[180px] shrink-0">
      <div className={`absolute left-[24px] top-0 h-[70px] w-[140px] opacity-50 ${PANEL}`} />
      <div className={`absolute left-[12px] top-[12px] h-[70px] w-[150px] opacity-75 ${PANEL}`} />
      <div className={`absolute left-0 top-[26px] flex h-[76px] w-[164px] flex-col justify-between p-[10px] ${PANEL}`}>
        <div className="flex items-center gap-[6px]">
          <span className="size-[7px] rounded-full bg-[#2FB35A]" />
          <span className="text-[10px] font-semibold leading-[12px] text-[#2B2B2B]">Live</span>
        </div>
        <Line width="80%" />
        <div className="flex justify-end text-[9px] leading-[12px] text-[#8A8A86]">version 3</div>
      </div>
    </div>
  ),

  computers: () => (
    <div className="flex items-end gap-[10px] pb-[6px]">
      {[
        { icon: Terminal, label: "Linux", bg: "#EDF3E9", fg: "#3F7A3A" },
        { icon: AppWindow, label: "Windows", bg: "#E6EEF9", fg: "#2F63B5" },
        { icon: Monitor, label: "macOS", bg: "#F0EEEA", fg: "#4D4A44" },
      ].map(({ icon, label, bg, fg }) => (
        <div key={label} className="flex flex-col items-center gap-[6px]">
          <Badge icon={icon} bg={bg} fg={fg} size={48} />
          <span className="text-[9px] font-medium leading-[12px] text-[#5E5E5B]">{label}</span>
        </div>
      ))}
    </div>
  ),

  files: () => (
    <div className="flex items-end gap-[8px] pb-[6px]">
      {[
        { icon: FileText, bg: "#FFFFFF", fg: "#3D6FD1", h: 78 },
        { icon: Presentation, bg: "#FFFFFF", fg: "#D9822B", h: 92 },
        { icon: Sheet, bg: "#FFFFFF", fg: "#2F8F55", h: 70 },
      ].map(({ icon: Icon, fg, h }, i) => (
        <div key={i} className={`flex w-[54px] flex-col items-start gap-[6px] p-[8px] ${PANEL}`} style={{ height: h }}>
          <Icon aria-hidden size={16} strokeWidth={1.8} color={fg} />
          <Line width="100%" />
          <Line width="70%" />
        </div>
      ))}
    </div>
  ),

  library: () => (
    <div className={`grid h-[104px] w-[164px] shrink-0 grid-cols-3 gap-[6px] p-[10px] ${PANEL}`}>
      {["#E6EEF9", "#F3EDE4", "#E7F2E8", "#F1E7F4", "#FBF0D9", "#E9ECEF"].map((tone) => (
        <div key={tone} className="rounded-[5px]" style={{ backgroundColor: tone }} />
      ))}
    </div>
  ),

  research: () => (
    <div className="relative h-[108px] w-[180px] shrink-0">
      <div className={`absolute left-0 top-[8px] flex h-[88px] w-[140px] flex-col gap-[8px] p-[12px] ${PANEL}`}>
        <Line width="90%" />
        <Line width="75%" />
        <Line width="85%" />
        <div className="flex gap-[4px] pt-[2px]">
          {[1, 2, 3].map((n) => (
            <span key={n} className="rounded-full bg-[#EEF3FB] px-[6px] text-[8px] leading-[12px] text-[#3D6FD1]">
              {n}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 right-[6px] flex size-[52px] items-center justify-center rounded-full bg-[#1A1A1A] shadow-[0px_6px_16px_#00000026]">
        <Search aria-hidden size={24} strokeWidth={2} color="#FFFFFF" />
      </div>
    </div>
  ),

  "live-view": () => (
    <div className={`relative flex h-[96px] w-[180px] shrink-0 flex-col gap-[8px] p-[10px] ${PANEL}`}>
      <div className="h-[46px] shrink-0 rounded-[6px] bg-[#23272E]" />
      <div className="flex items-center justify-between">
        <Line width={60} />
        <span className="rounded-[5px] bg-[#1A1A1A] px-[7px] py-[2px] text-[9px] leading-[12px] text-white">Take over</span>
      </div>
      <MousePointer2 aria-hidden size={18} strokeWidth={1.8} fill="#FFFFFF" color="#1A1A1A" className="absolute left-[92px] top-[30px]" />
    </div>
  ),

  automations: () => (
    <div className="flex items-center gap-[8px]">
      <Badge icon={Clock} bg="#FFFFFF" fg="#4D4A44" />
      <ArrowRight aria-hidden size={16} color="#A3A3A0" />
      <Badge icon={Sparkles} bg="#1A1A1A" fg="#FFFFFF" />
      <ArrowRight aria-hidden size={16} color="#A3A3A0" />
      <Badge icon={CircleCheck} bg="#E7F2E8" fg="#2F8F55" />
    </div>
  ),

  skills: () => (
    <div className={`flex h-[100px] w-[170px] shrink-0 flex-col gap-[9px] p-[12px] ${PANEL}`}>
      <div className="flex items-center gap-[6px]">
        <Sparkles aria-hidden size={14} strokeWidth={1.8} color="#C27A1F" />
        <Line width={70} tone="#DCDCD8" />
      </div>
      {[90, 110, 80].map((w) => (
        <div key={w} className="flex items-center gap-[6px]">
          <CircleCheck aria-hidden size={10} strokeWidth={2} color="#2F8F55" />
          <Line width={w} />
        </div>
      ))}
    </div>
  ),

  "skill-library": () => (
    <div className="flex items-end gap-[10px] pb-[8px]">
      <Badge icon={BookOpen} bg="#F1E7F4" fg="#7A4D99" size={52} />
      <Badge icon={Code} bg="#E6EEF9" fg="#2F63B5" size={52} />
      <Badge icon={PenTool} bg="#FBF0D9" fg="#B07A12" size={52} />
    </div>
  ),

  projects: () => (
    <div className={`flex h-[100px] w-[170px] shrink-0 flex-col gap-[8px] p-[12px] ${PANEL}`}>
      <div className="flex items-center gap-[6px]">
        <Folder aria-hidden size={14} strokeWidth={1.8} color="#4D4A44" />
        <Line width={64} tone="#DCDCD8" />
      </div>
      <Line width="85%" />
      <div className="flex gap-[5px] pt-[4px]">
        <div className="h-[24px] flex-1 rounded-[5px] bg-[#F3EDE4]" />
        <div className="h-[24px] flex-1 rounded-[5px] bg-[#E6EEF9]" />
        <div className="h-[24px] flex-1 rounded-[5px] bg-[#E7F2E8]" />
      </div>
    </div>
  ),
};

/** The illustration at the bottom of a feature card. */
export function FeatureArt({ id }: { id: FeatureArtId }) {
  return <>{art[id]()}</>;
}
