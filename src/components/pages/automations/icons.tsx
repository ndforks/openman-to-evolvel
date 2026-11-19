/** Icons shared by the two Automations screens (lucide glyphs). */
import { CalendarClock, ChevronsDown, Waypoints, Zap } from "lucide-react";
import type { AutomationStart } from "../data/automations";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ScheduleIcon({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return <CalendarClock size={size} strokeWidth={strokeWidth} className={className} aria-hidden style={{ flexShrink: 0 }} />;
}

/** The lightning bolt used for triggers. */
export function TriggerIcon({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return <Zap size={size} strokeWidth={strokeWidth} className={className} aria-hidden style={{ flexShrink: 0 }} />;
}

export function AdvancedIcon({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return <Waypoints size={size} strokeWidth={strokeWidth} className={className} aria-hidden style={{ flexShrink: 0 }} />;
}

export function StartIcon({ start, ...props }: IconProps & { start: AutomationStart }) {
  if (start === "schedule") return <ScheduleIcon {...props} />;
  if (start === "trigger") return <TriggerIcon {...props} />;
  return <AdvancedIcon {...props} />;
}

/** Double chevron pointing down, drawn between two stacked cards. */
export function FlowChevrons() {
  return <ChevronsDown size={13} strokeWidth={2} color="#6A6A6A" aria-hidden style={{ flexShrink: 0 }} />;
}
