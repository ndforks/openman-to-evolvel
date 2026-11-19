/** Every card on the Features page, grouped by category. The search field filters this list. */

export type CategoryId = "build" | "create" | "research" | "automate" | "connectors";

/** Names of the card illustrations in `art.tsx`. */
export type FeatureArtId =
  | "websites"
  | "publishing"
  | "computers"
  | "files"
  | "library"
  | "research"
  | "live-view"
  | "automations"
  | "skills"
  | "skill-library"
  | "projects";

export interface FeatureCardData {
  kind: "feature";
  id: string;
  title: string;
  description: string;
  art: FeatureArtId;
}

export interface ConnectorCardData {
  kind: "connector";
  id: string;
  title: string;
  description: string;
  /** Path of the app logo under `public/brands`. Omitted for the generic "add your own" card. */
  logo?: string;
}

export type CardData = FeatureCardData | ConnectorCardData;

export interface FeatureSectionData {
  id: CategoryId;
  /** Label in the category navigation. */
  nav: string;
  heading: string;
  cards: CardData[];
}

function feature(id: FeatureArtId, title: string, description: string): FeatureCardData {
  return { kind: "feature", id, title, description, art: id };
}

function connector(id: string, title: string, description: string, logo?: string): ConnectorCardData {
  return { kind: "connector", id, title, description, logo };
}

export const featureSections: FeatureSectionData[] = [
  {
    id: "build",
    nav: "Build",
    heading: "Make things and ship them",
    cards: [
      feature("websites", "Websites", "The agent builds the site on its computer while you watch the preview"),
      feature("publishing", "Publishing", "Put a site on a public URL and go back to any earlier version"),
      feature("computers", "Cloud computers", "Pick a Linux, Windows or Mac machine from Orgo"),
    ],
  },
  {
    id: "create",
    nav: "Create",
    heading: "Get real files back",
    cards: [
      feature("files", "Documents, decks, sheets", "Reports, presentations and spreadsheets you can download"),
      feature("library", "Library", "One shelf for everything your tasks have produced"),
    ],
  },
  {
    id: "research",
    nav: "Research",
    heading: "Look things up properly",
    cards: [
      feature("research", "Research", "Reads sources in a real browser and writes up what it found"),
      feature("live-view", "Live view", "See the agent's screen as it works, and grab the controls"),
    ],
  },
  {
    id: "automate",
    nav: "Automate",
    heading: "Repeat work without repeating yourself",
    cards: [
      feature("automations", "Automations", "Kick off tasks from a schedule, a webhook or a feed"),
      feature("skills", "Skills", "Save a way of working once and let the agent reuse it"),
      feature("skill-library", "Skill library", `55 ready-made skills from Nous Research and Anthropic`),
      feature("projects", "Projects", "Group related tasks under the same notes and files"),
    ],
  },
  {
    id: "connectors",
    nav: "Connectors",
    heading: "Plug in your tools",
    cards: [
      connector("gmail", "Gmail", "Triage mail, write replies, get ready for calls", "/brands/gmail.svg"),
      connector("google-drive", "Google Drive", "Locate documents, read them, tidy folders", "/brands/googledrive.svg"),
      connector("google-sheets", "Google Sheets", "Pull numbers out of sheets and write them back", "/brands/googlesheets.svg"),
      connector("google-calendar", "Google Calendar", "Check availability, book time, brief you before calls", "/brands/googlecalendar.svg"),
      connector("slack", "Slack", "Find threads, catch up on channels, post updates", "/brands/slack.svg"),
      connector("notion", "Notion", "Use your pages as input and write results back", "/brands/notion.svg"),
      connector("github", "GitHub", "Read repos, open fixes, review pull requests", "/brands/github.svg"),
      connector("linear", "Linear", "Sort incoming issues and summarise project status", "/brands/linear.svg"),
      connector("hubspot", "HubSpot", "Keep deals current and summarise the pipeline", "/brands/hubspot.svg"),
      connector("mcp", "Custom MCP and APIs", "Bring any MCP server or HTTP API you run"),
    ],
  },
];

/** Sections that still have cards after filtering by title and description. An empty query keeps everything. */
export function filterSections(query: string): FeatureSectionData[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return featureSections;
  return featureSections
    .map((section) => ({
      ...section,
      cards: section.cards.filter((card) => {
        const haystack = `${card.title} ${card.description}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      }),
    }))
    .filter((section) => section.cards.length > 0);
}
