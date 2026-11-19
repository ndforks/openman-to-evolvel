/**
 * The four illustrations in "What sets … apart", drawn with CSS and lucide icons.
 * Each fills a 451 x 392 stage; `Stage` centres it and shrinks it where the column is narrower.
 */
import type { ReactNode } from "react";
import { ArrowRight, Check, CircleDashed, Ellipsis, FileText, Hexagon, Presentation, Send, Settings, Sparkle } from "lucide-react";
import { brand } from "@/config/brand";

function Stage({ background, children }: { background: string; children: ReactNode }) {
  return (
    <div
      className="flex h-[300px] w-full items-center justify-center overflow-hidden min-[500px]:h-[392px] md:h-full"
      style={{ backgroundColor: background }}
    >
      <div className="relative h-[392px] w-[451px] shrink-0 max-[499px]:scale-[0.72] min-[768px]:max-[859px]:scale-[0.78] min-[860px]:max-[949px]:scale-[0.88]">
        {children}
      </div>
    </div>
  );
}

const ROUTES = [
  { task: "Lite", model: "Claude Haiku 5.5", active: false },
  { task: "Standard", model: "Claude Sonnet 5.5", active: true },
  { task: "Max", model: "Claude Opus 5.5", active: false },
];

export function ModelRoutingIllustration() {
  return (
    <Stage background="#B8C6CC">
      <div className="flex size-full items-center justify-center">
        <div className="flex w-[332px] shrink-0 flex-col gap-[8px] rounded-[14px] bg-white p-[12px] shadow-[0px_8px_24px_#00000014]">
          <div className="flex items-center justify-between pt-[2px] pb-[4px]">
            <div className="text-[13px] leading-[16px] font-semibold text-[#1A1A1A]">Modes</div>
            <Ellipsis size={16} strokeWidth={3} className="text-[#737373]" aria-hidden />
          </div>
          {ROUTES.map((route) => (
            <div
              key={route.task}
              className="flex h-[44px] shrink-0 items-center gap-[10px] rounded-[10px] border border-black/8 px-[10px]"
            >
              <div className="w-[70px] shrink-0 text-[12px] leading-[16px] text-[#1A1A1A]">{route.task}</div>
              <ArrowRight size={12} className="shrink-0 text-[#A6A6A6]" aria-hidden />
              <div
                className={`flex items-center gap-[4px] rounded-[6px] px-[10px] py-[5px] text-[12px] leading-[16px] text-[#1A1A1A] ${route.active ? "bg-[#EAF3FE]" : "bg-[#F3F3F2]"}`}
              >
                <Hexagon size={11} aria-hidden />
                {route.model}
              </div>
              <div className="grow basis-0" />
              <div
                className={`size-[14px] shrink-0 rounded-full border-[1.5px] border-solid ${route.active ? "border-[#0081F2]" : "border-[#8C8C8C]"}`}
              />
            </div>
          ))}
          <div className="flex justify-center pt-[4px]">
            <div className="flex items-center gap-[4px] rounded-full border border-black/10 px-[12px] py-[6px] text-[11px] leading-[14px] font-medium text-[#4D4D4D]">
              <Settings size={11} aria-hidden />
              Billed to your Orgo credits
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
}

const REPORT_BARS = [16, 28, 22, 40, 32, 52];

export function OutputsIllustration() {
  return (
    <Stage background="#D6D0C8">
      <div className="absolute top-[30px] left-[210px] flex h-[180px] w-[190px] origin-top-left rotate-[6deg] flex-col gap-[8px] rounded-[12px] bg-white p-[12px] shadow-[0px_8px_24px_#00000014]">
        <div className="flex justify-between">
          <div className="flex items-center gap-[3px] text-[9px] leading-[12px] text-[#737373]">
            <FileText size={9} aria-hidden />
            Budget sheet
          </div>
          <div className="rounded-[6px] bg-[#E3F5EA] px-[6px] py-px text-[9px] leading-[12px] text-[#2F9E5C]">Ready</div>
        </div>
        <div className="h-[12px] shrink-0 rounded-[3px] bg-[#E8EEF9]" />
        <div className="h-[12px] shrink-0 rounded-[3px] bg-[#F1F1F0]" />
        <div className="h-[12px] shrink-0 rounded-[3px] bg-[#F1F1F0]" />
      </div>
      <div className="absolute top-[250px] left-[12px] flex h-[150px] w-[200px] origin-top-left rotate-[-4deg] flex-col gap-[8px] rounded-[12px] bg-white p-[10px] shadow-[0px_8px_24px_#00000014]">
        <div className="flex items-center gap-[3px] text-[9px] leading-[12px] text-[#737373]">
          <Presentation size={9} aria-hidden />
          Board update
        </div>
        <div className="flex h-[90px] shrink-0 items-end rounded-[6px] bg-[#3B2F63] p-[10px]">
          <div className="text-[12px] leading-[16px] font-semibold text-white">Where we landed</div>
        </div>
      </div>
      <div className="absolute top-[84px] left-[120px] flex h-[270px] w-[210px] flex-col gap-[10px] rounded-[12px] bg-white p-[14px] shadow-[0px_12px_32px_#0000001F]">
        <div className="flex justify-between">
          <div className="flex items-center gap-[3px] text-[9px] leading-[12px] text-[#4D4D4D]">
            <FileText size={9} aria-hidden />
            Findings
          </div>
          <Check size={10} strokeWidth={3} className="text-[#2F9E5C]" aria-hidden />
        </div>
        <div className="text-[16px] leading-[19px] font-bold tracking-[-0.03em] text-[#1A1A1A]">
          What the sources say
        </div>
        <div className="h-[3px] w-[170px] shrink-0 bg-[#E6E6E6]" />
        <div className="h-[3px] w-[130px] shrink-0 bg-[#E6E6E6]" />
        <div className="flex grow basis-0 items-end justify-around rounded-[8px] border border-black/6 p-[10px]">
          {REPORT_BARS.map((height, index) => (
            <div key={index} className="w-[10px] shrink-0 bg-[#6B8CF0]" style={{ height }} />
          ))}
        </div>
      </div>
    </Stage>
  );
}

const STATS = [
  { label: "Active users", value: "12,480", delta: "+12.4%" },
  { label: "Conversion", value: "8.6%", delta: "+1.8%" },
  { label: "Revenue", value: "$34.8k", delta: "+9.2%" },
];

export function PrototypeIllustration() {
  return (
    <Stage background="#C9D3D1">
      <div className="flex size-full items-center justify-center">
        <div className="flex h-[266px] w-[354px] shrink-0 flex-col overflow-hidden rounded-[12px] bg-white shadow-[0px_10px_28px_#00000014]">
          <div className="flex h-[30px] shrink-0 items-center gap-[4px] border-b border-black/6 px-[10px]">
            <div className="size-[6px] shrink-0 rounded-full bg-[#EF6A5E]" />
            <div className="size-[6px] shrink-0 rounded-full bg-[#F4BF4F]" />
            <div className="size-[6px] shrink-0 rounded-full bg-[#61C554]" />
            <div className="flex grow basis-0 justify-center">
              <div className="rounded-[5px] border border-black/8 px-[30px] py-[3px] text-[8px] leading-[10px] text-[#737373]">
                app.{brand.wordmark}
              </div>
            </div>
          </div>
          <div className="flex grow basis-0">
            <div className="flex w-[40px] shrink-0 flex-col items-center gap-[12px] border-r border-black/6 pt-[14px]">
              <div className="size-[12px] shrink-0 rounded-[3px] bg-[#6B8CF0]" />
              <div className="size-[12px] shrink-0 rounded-[3px] bg-[#E6E6E6]" />
              <div className="size-[12px] shrink-0 rounded-[3px] bg-[#E6E6E6]" />
            </div>
            <div className="flex grow basis-0 flex-col gap-[10px] px-[14px] py-[12px]">
              <div className="flex justify-between">
                <div className="flex flex-col">
                  <div className="text-[8px] leading-[10px] text-[#8C8C8C]">Overview</div>
                  <div className="text-[12px] leading-[16px] font-semibold text-[#1A1A1A]">Team dashboard</div>
                </div>
                <div className="flex h-[16px] items-center gap-[3px] rounded-[8px] bg-[#E3F5EA] px-[6px] text-[8px] leading-[16px] text-[#2F9E5C]">
                  <span className="size-[4px] rounded-full bg-[#2F9E5C]" />
                  Live
                </div>
              </div>
              <div className="flex gap-[6px]">
                {STATS.map((stat) => (
                  <div key={stat.label} className="flex grow basis-0 flex-col rounded-[6px] border border-black/6 p-[6px]">
                    <div className="text-[7px] leading-[10px] text-[#737373]">{stat.label}</div>
                    <div className="text-[11px] leading-[14px] font-semibold text-[#1A1A1A]">{stat.value}</div>
                    <div className="text-[7px] leading-[10px] text-[#2F9E5C]">{stat.delta}</div>
                  </div>
                ))}
              </div>
              <div className="flex grow basis-0 flex-col rounded-[6px] border border-black/6 p-[6px]">
                <div className="text-[8px] leading-[10px] font-semibold text-[#1A1A1A]">Growth</div>
                <svg width="240" height="60" viewBox="0 0 240 60" className="shrink-0" aria-hidden>
                  <path d="M10 55 C40 50, 50 40, 80 44 S120 25, 140 30 S180 12, 230 8 L230 60 L10 60 Z" fill="#EEF2FD" />
                  <path
                    d="M10 55 C40 50, 50 40, 80 44 S120 25, 140 30 S180 12, 230 8"
                    fill="none"
                    stroke="#6B8CF0"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
}

const TOOLS = [
  { name: "Browser", detail: "Reading pages", done: true },
  { name: "Terminal", detail: "Running checks", done: true },
  { name: "Files", detail: "Writing the deck", done: false },
];

export function ComputerIllustration() {
  return (
    <Stage background="#D9D0CC">
      <div className="flex size-full flex-col items-center justify-center gap-[28px]">
        <div className="flex h-[36px] shrink-0 items-center gap-[30px] rounded-[10px] bg-white px-[12px] shadow-[0px_6px_18px_#00000014]">
          <div className="flex items-center gap-[4px] text-[12px] leading-[16px] font-semibold text-[#1A1A1A]">
            <Sparkle size={11} fill="currentColor" aria-hidden />
            Plan a product launch
          </div>
          <Send size={14} strokeWidth={2} className="shrink-0 text-[#6B8CF0]" aria-hidden />
        </div>
        <div className="h-px w-[360px] shrink-0 border-t border-dashed border-black/15" />
        <div className="flex gap-[10px]">
          {TOOLS.map((agent) => (
            <div
              key={agent.name}
              className="flex w-[120px] shrink-0 flex-col gap-[6px] rounded-[10px] bg-white p-[10px] shadow-[0px_6px_18px_#0000000F]"
            >
              <div className="flex items-center gap-[6px]">
                <div className="size-[20px] shrink-0 rounded-[5px] bg-[#EEF0FB]" />
                <div className="flex flex-col">
                  <div className="text-[10px] leading-[12px] font-semibold text-[#1A1A1A]">{agent.name}</div>
                  <div className="text-[8px] leading-[10px] text-[#8C8C8C]">{agent.detail}</div>
                </div>
              </div>
              {agent.done ? (
                <div className="flex items-center gap-[3px] text-[8px] leading-[10px] font-semibold text-[#2F9E5C]">
                  <Check size={8} strokeWidth={3} aria-hidden />
                  Done
                </div>
              ) : (
                <div className="flex items-center gap-[3px] text-[8px] leading-[10px] font-semibold text-[#8C8C8C]">
                  <CircleDashed size={8} strokeWidth={3} aria-hidden />
                  Running
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
}
