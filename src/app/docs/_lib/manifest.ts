/** The docs table of contents: every page, in sidebar order. Each page's text lives in `content/docs/<slug>.md`. */

export interface DocPage {
  /** URL segment under `/docs`, and the Markdown file name. `""` is the docs home (`content/docs/index.md`). */
  slug: string;
  title: string;
  /** One line for the page's meta description and the docs home. */
  description: string;
}

export interface DocGroup {
  title: string;
  pages: DocPage[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Basics",
    pages: [
      { slug: "", title: "Overview", description: "What the agent does, what powers it, and where to begin." },
      { slug: "getting-started", title: "Sign in with Orgo", description: "Link or create an Orgo account, then run a first task." },
      { slug: "tasks", title: "Tasks and the computer", description: "Hand over a job, watch the computer, steer, stop or take control." },
      { slug: "modes-and-models", title: "Modes and models", description: "The Claude model behind each mode, and the effort setting." },
    ],
  },
  {
    title: "Organizing work",
    pages: [
      { slug: "projects", title: "Projects", description: "Keep tasks together under shared instructions, files, skills and connectors." },
      { slug: "knowledge-and-personalization", title: "Knowledge and personalization", description: "Facts and preferences the agent carries into every task." },
      { slug: "sharing", title: "Sharing and replay", description: "Send a read-only link to a task and play it back." },
    ],
  },
  {
    title: "Extending the agent",
    pages: [
      { slug: "skills", title: "Skills", description: "Install from the official library, write your own, or import from GitHub." },
      { slug: "connectors", title: "Connectors", description: "Link apps through Orgo and Composio, or add your own MCP servers and APIs." },
      { slug: "automations", title: "Automations", description: "Start tasks on a timetable or from a webhook, feed or email." },
      { slug: "websites", title: "Websites", description: "Have the agent build a site, preview it and put it online." },
      { slug: "email-and-phone", title: "Email and phone", description: "An inbox and a phone number for the agent (coming soon)." },
      { slug: "chat-channels", title: "Chat channels", description: "The places you can reach the agent right now." },
    ],
  },
  {
    title: "Account and computers",
    pages: [
      { slug: "cloud-computers", title: "Cloud computers", description: "Operating systems, sizes, prices, terminal access, backups and resizing." },
      { slug: "credits-and-billing", title: "Credits and billing", description: "How Orgo credits, plans and top-ups work, and what spends credit." },
      { slug: "security", title: "Security and data", description: "What is kept, where it lives, and how secrets are protected." },
    ],
  },
  {
    // These pages live in `content/docs/api/`; `api` itself is `content/docs/api/index.md`.
    title: "Developer API",
    pages: [
      { slug: "api", title: "API overview", description: "Launch tasks, follow them and fetch results from your own code." },
      { slug: "api/authentication", title: "Authentication", description: "API keys, the Authorization header, and which account a key acts for." },
      { slug: "api/tasks", title: "Tasks", description: "Create, list, follow, steer, stop and delete tasks, plus messages, events, streams and files." },
      { slug: "api/projects", title: "Projects", description: "Bundle tasks under shared instructions." },
      { slug: "api/skills-and-connectors", title: "Skills and connectors", description: "Read the skills and connectors available to tasks." },
      { slug: "api/websites", title: "Websites", description: "Sites built by your tasks: previews and publishing." },
      { slug: "api/automations", title: "Automations", description: "Scheduled and event-driven tasks, with their run history." },
      { slug: "api/webhooks", title: "Webhooks", description: "Signed notifications when a task starts, finishes, fails, stops or needs input." },
      { slug: "api/account", title: "Account and usage", description: "Who the key acts for, its rate limit, and credit usage." },
      { slug: "api/errors", title: "Errors", description: "How errors are shaped, with their types and codes." },
      { slug: "api/rate-limits", title: "Rate limits", description: "Limits per key, the headers that report them, and retrying." },
    ],
  },
];

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((group) => group.pages);

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}
