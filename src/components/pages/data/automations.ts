/** Static content of the Automations pages: the three ways an automation can start and the example ideas. */
import { brand } from "@/config/brand";

export type AutomationStart = "schedule" | "trigger" | "advanced";

export interface AutomationKind {
  id: AutomationStart;
  /** Card title on the empty state. */
  title: string;
  /** Card copy on the empty state. */
  description: string;
  /** Label in the Create menu and on the "Choose how it starts" cards. */
  startTitle: string;
  startDescription: string;
  beta?: boolean;
}

export const AUTOMATION_KINDS: AutomationKind[] = [
  {
    id: "schedule",
    title: "Schedule",
    description: `Pick a time and a repeat, and ${brand.agentNoun} does the job on that rhythm.`,
    startTitle: "Schedule",
    startDescription: "Runs on a clock you set",
  },
  {
    id: "trigger",
    title: "Trigger",
    description: `Name something that happens in an app, then say how ${brand.agentNoun} should respond.`,
    startTitle: "Triggered task",
    startDescription: "Starts when something happens in an app",
  },
  {
    id: "advanced",
    title: "Advanced automation",
    description: `Write the rule in plain language: the moment to act and the work to do.`,
    startTitle: "Advanced automation",
    startDescription: "Write the rule in plain language",
    beta: true,
  },
];

export interface AutomationSuggestion {
  id: string;
  /** App whose activity starts the automation. */
  app: { name: string; logo: string; w: number; h: number };
  when: string;
  then: string;
  start: AutomationStart;
}

export const AUTOMATION_SUGGESTIONS: AutomationSuggestion[] = [
  {
    id: "invoice-log",
    app: { name: "Gmail", logo: "/brands/gmail-color.svg", w: 16, h: 16 },
    when: "An invoice or receipt lands in your inbox",
    then: "Add a row to a spreadsheet and file the PDF in Drive",
    start: "trigger",
  },
  {
    id: "refund-follow-up",
    app: { name: "Shopify", logo: "/brands/shopify.svg", w: 16, h: 16 },
    when: "An order is refunded",
    then: "Check why and write the customer a short, friendly note",
    start: "trigger",
  },
  {
    id: "winning-ads",
    app: { name: "Meta", logo: "/brands/meta-c.svg", w: 18, h: 16 },
    when: "Fresh ad results come in",
    then: "Rank the ads by return and suggest what to try next",
    start: "trigger",
  },
  {
    id: "weekly-report",
    app: { name: "Google Calendar", logo: "/brands/googlecalendar-color.svg", w: 16, h: 16 },
    when: "Mondays at 9:00 AM",
    then: "Pull the past week’s figures into a one-page summary",
    start: "schedule",
  },
  {
    id: "new-lead",
    app: { name: "HubSpot", logo: "/brands/hubspot.svg", w: 16, h: 16 },
    when: "A lead shows up in the CRM",
    then: "Look up the company and draft a tailored intro",
    start: "trigger",
  },
  {
    id: "pull-request",
    app: { name: "GitHub", logo: "/brands/github-c.svg", w: 16, h: 16 },
    when: "Someone opens a pull request",
    then: "Read the diff and share a plain-English recap",
    start: "trigger",
  },
];

