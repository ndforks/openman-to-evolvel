// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The connector catalog and API shapes. Client-safe (no secrets, no server imports).
 *
 * Slugs are Composio toolkit slugs, as Orgo's per-computer apps use them (`/api/computers/{id}/agent/apps`).
 * The curated list mirrors Orgo's own (orgo-web `lib/computer-agent/app-catalog.ts`); the rest of Composio's
 * catalog arrives from Orgo's `/api/apps/catalog` when the user's key is account-wide.
 */

export const CONNECTOR_CATEGORIES = ["Productivity", "Communication", "CRM", "Developer", "Finance", "Marketing", "Design", "Social", "Analytics", "Other"] as const;
export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export type ConnectorType = "app" | "mcp" | "api";

export interface ConnectorApp {
  slug: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  logo: string;
  /** Signs in with a key typed into a form, not OAuth. */
  key?: boolean;
  featured?: boolean;
}

/** One row of `GET /api/connectors`. */
export interface ConnectorView extends ConnectorApp {
  type: ConnectorType;
  connected: boolean;
  /** Custom connectors: their row id. */
  id?: string;
  /** Custom connectors: the URL or command, and tool count / status. */
  detail?: string;
  tools?: { name: string; description?: string }[];
  status?: string;
}

export interface ConnectorsResponse {
  connectors: ConnectorView[];
  /** False when the user has no home computer yet: apps can't be connected. */
  configured: boolean;
  computerId: string | null;
  /** True when the full Composio catalog was loaded; otherwise only the curated apps. */
  fullCatalog: boolean;
  error?: string;
}

export interface ConnectStart {
  /** URL to open in a popup. Null when connected at once (key app) or already connected. */
  url: string | null;
  alreadyConnected?: boolean;
  /** Key apps: the fields to ask for first. */
  needs?: boolean;
  asks?: { name: string; label: string; secret?: boolean; where?: string }[];
  error?: string;
}

export const logoFor = (slug: string) => `https://logos.composio.dev/api/${encodeURIComponent(slug)}`;

const a = (slug: string, name: string, description: string, category: ConnectorCategory, extra: Partial<ConnectorApp> = {}): ConnectorApp => ({ slug, name, description, category, logo: logoFor(slug), ...extra });

export const CURATED_APPS: ConnectorApp[] = [
  a("gmail", "Gmail", "Search, read, draft and send email", "Communication", { featured: true, logo: "/brands/gmail-color.svg" }),
  a("googlecalendar", "Google Calendar", "Read your schedule and manage events", "Productivity", { featured: true, logo: "/brands/googlecalendar-color.svg" }),
  a("googledrive", "Google Drive", "Find, read and organize your files", "Productivity", { featured: true, logo: "/brands/googledrive-color.svg" }),
  a("notion", "Notion", "Search and update pages and databases", "Productivity", { featured: true }),
  a("slack", "Slack", "Read channels and send messages", "Communication", { featured: true, logo: "/brands/slack-color.svg" }),
  a("github", "GitHub", "Work with repositories, issues and pull requests", "Developer", { featured: true, logo: "/brands/github-c.svg" }),
  a("airtable", "Airtable", "Read and update bases, tables and records", "Productivity"),
  a("apollo", "Apollo", "Search people and companies, enrich leads", "CRM", { key: true }),
  a("asana", "Asana", "Create and track tasks and projects", "Productivity"),
  a("attio", "Attio", "Look up and update CRM records", "CRM"),
  a("box", "Box", "Find and share files in Box", "Productivity"),
  a("calendly", "Calendly", "See event types and scheduled meetings", "Productivity"),
  a("canva", "Canva", "Find and create designs", "Design"),
  a("clickup", "ClickUp", "Manage tasks, lists and docs", "Productivity"),
  a("close", "Close", "Work with leads, calls and opportunities", "CRM", { key: true }),
  a("googledocs", "Google Docs", "Create, read and edit documents", "Productivity"),
  a("dropbox", "Dropbox", "Find, upload and share files", "Productivity"),
  a("excel", "Excel", "Read and update workbooks", "Productivity"),
  a("facebook", "Facebook", "Manage pages and posts", "Social"),
  a("figma", "Figma", "Read designs, comments and components", "Design"),
  a("hubspot", "HubSpot", "Look up contacts, companies and deals", "CRM"),
  a("instagram", "Instagram", "Read insights and publish posts", "Social", { logo: "/brands/instagram-color.svg" }),
  a("linear", "Linear", "Create and track issues and projects", "Developer"),
  a("linkedin", "LinkedIn", "Share posts and read your profile", "Social"),
  a("mailchimp", "Mailchimp", "Manage audiences and campaigns", "Marketing"),
  a("monday", "Monday", "Manage boards and items", "Productivity"),
  a("outlook", "Outlook", "Search, read and send email; manage calendar", "Communication", { logo: "/brands/outlook-color.svg" }),
  a("pipedrive", "Pipedrive", "Work with deals, people and pipelines", "CRM", { key: true }),
  a("salesforce", "Salesforce", "Query and update Salesforce records", "CRM"),
  a("googlesheets", "Google Sheets", "Read, write and analyze spreadsheets", "Productivity"),
  a("googleslides", "Google Slides", "Create and edit presentations", "Productivity"),
  a("stripe", "Stripe", "Look up customers, payments and invoices", "Finance"),
  a("microsoft_teams", "Microsoft Teams", "Read chats and send messages", "Communication"),
  a("todoist", "Todoist", "Add and complete tasks", "Productivity"),
  a("youtube", "YouTube", "Search videos and manage your channel", "Social"),
  a("zoho", "Zoho CRM", "Look up and update CRM records", "CRM"),
  a("zoom", "Zoom", "Schedule meetings and read recordings", "Communication"),
];

export const CURATED_BY_SLUG = new Map(CURATED_APPS.map((app) => [app.slug, app]));

/** Prefix for custom connector ids in selections: `custom:<uuid>`. */
export const CUSTOM_PREFIX = "custom:";
