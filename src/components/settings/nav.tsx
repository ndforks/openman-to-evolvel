/** The Settings tab list: ids, labels, groups and icons (lucide). */
import type { ReactNode } from "react";
import {
  Blocks,
  CodeXml,
  Database,
  Keyboard,
  Mail,
  Monitor,
  Plug,
  Puzzle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  User,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { brand } from "@/config/brand";

export type SettingsTabId =
  | "account"
  | "security"
  | "billing"
  | "general"
  | "shortcuts"
  | "personalization"
  | "connectors"
  | "skills"
  | "mail"
  | "computers"
  | "email"
  | "phone"
  | "data-controls"
  | "integrations"
  | "developers";

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "general";

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: ReactNode;
  /** Other names callers may pass to `open("settings", { tab })`. */
  aliases?: string[];
}

export interface SettingsGroup {
  label: string;
  tabs: SettingsTab[];
}

const icon = (Glyph: LucideIcon) => <Glyph size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />;

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Account",
    tabs: [
      { id: "account", label: "Account", aliases: ["profile"], icon: icon(User) },
      { id: "security", label: "Sign-in & security", aliases: ["sign-in-security", "signin-security", "sign-in", "signin"], icon: icon(ShieldCheck) },
      { id: "billing", label: "Usage & Billing", aliases: ["usage", "usage-billing", "usage-and-billing", "credits", "plan", "wallet"], icon: icon(Sparkles) },
    ],
  },
  {
    label: "Settings",
    tabs: [
      { id: "general", label: "General", aliases: ["settings", "appearance", "preferences"], icon: icon(SlidersHorizontal) },
      { id: "shortcuts", label: "Shortcuts", aliases: ["keyboard", "keyboard-shortcuts"], icon: icon(Keyboard) },
    ],
  },
  {
    label: "Capabilities",
    tabs: [
      { id: "personalization", label: "Personalization", aliases: ["personalisation", "knowledge", "memory"], icon: icon(UserCog) },
      { id: "connectors", label: "Connectors", aliases: ["connector", "apps"], icon: icon(Plug) },
      { id: "skills", label: "Skills", aliases: ["skill"], icon: icon(Puzzle) },
      { id: "mail", label: `Mail ${brand.name}`, aliases: ["mail-agent", `mail-${brand.name.toLowerCase()}`], icon: icon(Send) },
      { id: "computers", label: "Computers", aliases: ["computer", "cloud-computers"], icon: icon(Monitor) },
    ],
  },
  {
    label: "Assets",
    tabs: [
      { id: "email", label: "Email", aliases: ["emails", "mailboxes"], icon: icon(Mail) },
      { id: "phone", label: "Phone", aliases: ["phones", "phone-numbers"], icon: icon(Smartphone) },
    ],
  },
  {
    label: "Data & Integrations",
    tabs: [
      { id: "data-controls", label: "Data controls", aliases: ["data", "datacontrols", "privacy"], icon: icon(Database) },
      { id: "integrations", label: "Integrations", aliases: ["integration"], icon: icon(Blocks) },
      { id: "developers", label: "Developers", aliases: ["developer", "api", "api-keys"], icon: icon(CodeXml) },
    ],
  },
];

const slug = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Accepts a tab id, a label ("Usage & Billing") or an alias, in any casing. Returns null for anything else. */
export function normalizeSettingsTab(input: unknown): SettingsTabId | null {
  if (typeof input !== "string") return null;
  const wanted = slug(input);
  if (!wanted) return null;
  for (const group of SETTINGS_GROUPS) {
    for (const tab of group.tabs) {
      if (tab.id === wanted || slug(tab.label) === wanted || tab.aliases?.some((alias) => slug(alias) === wanted)) return tab.id;
    }
  }
  return null;
}
