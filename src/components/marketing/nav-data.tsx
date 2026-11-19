/**
 * Header navigation: the dropdown menus and the plain links. Every item points at a real page about something
 * the product does today (no placeholders, no "coming soon"). Icons are lucide-react.
 */
import type { ReactNode } from "react";
import {
  AppWindow,
  BookOpen,
  CircleDollarSign,
  Code,
  FolderOpen,
  LayoutGrid,
  Lock,
  Monitor,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Timer,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { brand } from "@/config/brand";

export interface NavMenuItem {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
}

export interface NavMenu {
  id: "features" | "resources";
  label: string;
  /** Two columns. */
  columns: [NavMenuItem[], NavMenuItem[]];
}

export interface NavLink {
  label: string;
  href: string;
}

/** 18px lucide icon in the menu's ink colour. */
function glyph(Icon: LucideIcon): ReactNode {
  return <Icon aria-hidden size={18} strokeWidth={1.7} className="mt-px shrink-0" />;
}

const featuresMenu: NavMenu = {
  id: "features",
  label: "Features",
  columns: [
    [
      {
        title: "Tasks",
        description: "Follow each step live and jump in when you want",
        href: "/docs/tasks",
        icon: glyph(AppWindow),
      },
      {
        title: "Websites",
        description: "Have sites made, check them, put them online",
        href: "/docs/websites",
        icon: glyph(WandSparkles),
      },
      {
        title: "Projects",
        description: "Keep related work under one set of notes and files",
        href: "/docs/projects",
        icon: glyph(FolderOpen),
      },
      {
        title: "Cloud computers",
        description: "Linux, Windows and Mac machines from Orgo",
        href: "/docs/cloud-computers",
        icon: glyph(Monitor),
      },
    ],
    [
      {
        title: "Automations",
        description: "Start work on a timer, a webhook, a feed or an email",
        href: "/docs/automations",
        icon: glyph(Timer),
      },
      {
        title: "Skills",
        description: "Teach it a procedure once, reuse it forever",
        href: "/docs/skills",
        icon: glyph(Sparkles),
      },
      {
        title: "Connectors",
        description: "Give it access to the tools you already use",
        href: "/docs/connectors",
        icon: glyph(Plug),
      },
      {
        title: "Everything else",
        description: `The full list of what ${brand.name} does`,
        href: "/features",
        icon: glyph(LayoutGrid),
      },
    ],
  ],
};

const resourcesMenu: NavMenu = {
  id: "resources",
  label: "Resources",
  columns: [
    [
      {
        title: "Docs",
        description: `Guides for setting up and using ${brand.name}`,
        href: "/docs",
        icon: glyph(BookOpen),
      },
      {
        title: "Developer API",
        description: "Drive tasks from your own code",
        href: "/docs/api",
        icon: glyph(Code),
      },
      {
        title: "Security and data",
        description: "Where your data lives and who sees it",
        href: "/docs/security",
        icon: glyph(ShieldCheck),
      },
    ],
    [
      {
        title: "Pricing",
        description: "What computers and model use cost on Orgo",
        href: "/pricing",
        icon: glyph(CircleDollarSign),
      },
      {
        title: "Terms of service",
        description: "The agreement that covers your use",
        href: "/terms",
        icon: glyph(ScrollText),
      },
      {
        title: "Privacy policy",
        description: "What gets collected, and the reasons",
        href: "/privacy",
        icon: glyph(Lock),
      },
    ],
  ],
};

export const navMenus: NavMenu[] = [featuresMenu, resourcesMenu];

export const navLinks: NavLink[] = [
  { label: "Teams", href: "/team" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
];
