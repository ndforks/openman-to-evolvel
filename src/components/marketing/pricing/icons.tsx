/** Line icons for the pricing page (lucide-react). They inherit the text colour. */
import {
  Building2,
  CalendarClock,
  CircleHelp,
  Coins,
  Cpu,
  Database,
  FlaskConical,
  Globe,
  HardDrive,
  Layers,
  LayoutTemplate,
  LifeBuoy,
  MonitorCog,
  MonitorSmartphone,
  MousePointer2,
  Presentation,
  RefreshCw,
  Search,
  Telescope,
  Users,
  Link2,
  type LucideIcon,
} from "lucide-react";

export type PlanIconName =
  | "refresh"
  | "credits"
  | "research"
  | "website"
  | "slides"
  | "wide-research"
  | "beta"
  | "concurrent"
  | "scheduled"
  | "computers"
  | "cpu"
  | "storage"
  | "os"
  | "team"
  | "domain"
  | "collab"
  | "templates"
  | "data"
  | "support";

const planIcons: Record<PlanIconName, LucideIcon> = {
  refresh: RefreshCw,
  credits: Coins,
  research: Search,
  website: Globe,
  slides: Presentation,
  "wide-research": Telescope,
  beta: FlaskConical,
  concurrent: Layers,
  scheduled: CalendarClock,
  computers: MonitorCog,
  cpu: Cpu,
  storage: HardDrive,
  os: MonitorSmartphone,
  team: Users,
  domain: Link2,
  collab: MousePointer2,
  templates: LayoutTemplate,
  data: Database,
  support: LifeBuoy,
};

export function PlanIcon({ name, className }: { name: PlanIconName; className?: string }) {
  const Icon = planIcons[name];
  return <Icon aria-hidden size={16} strokeWidth={1.7} className={className} />;
}

/** Small "?" after a feature line that has more detail. */
export function HelpIcon({ className }: { className?: string }) {
  return <CircleHelp aria-hidden size={14} strokeWidth={1.8} className={className} />;
}

/** Shown in the Teams row under the plans. */
export function BuildingIcon({ className }: { className?: string }) {
  return <Building2 aria-hidden size={18} strokeWidth={1.7} className={className} />;
}
