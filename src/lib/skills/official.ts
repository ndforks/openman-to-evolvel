// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The official skill library: a curated set of skills Hermes and its community already ship, installed through
 * Hermes' own installer (`hermes skills install <identifier>`). Nothing here is hosted by us.
 *
 * Audit (2026-11-19, Hermes Agent v0.23.2 on the dev computer):
 * - Hermes bundled skills (~44, MIT, seeded into every profile): already on every computer, so they are listed
 *   from the computer itself, not from here.
 * - Hermes official optional skills (141, `optional-skills/` in NousResearch/hermes-agent, identifiers
 *   `official/<category>/<name>`): every one carries `license: MIT` or `license: Apache-2.0` in its front matter.
 *   Left out: offensive-security and jailbreak skills (godmode, obliteratus, web-pentest, sherlock, unbroker,
 *   osint-investigation), GPU training stacks (mlops/*), games, crypto wallets, and skills that only set up a
 *   third-party account.
 * - anthropics/skills on GitHub (Hermes' `github` source): only skills whose folder ships the Apache-2.0
 *   LICENSE.txt. The document skills (docx, pdf, pptx, xlsx) are source-available, not open, and are left out.
 * - skills.sh, ClawHub, LobeHub and other community hubs: licences vary per skill and are not recorded by the
 *   hub, so none are bundled here; users can still import any public repo through "Import from GitHub".
 */

export const OFFICIAL_CATEGORIES = ["Coding", "Data", "Automation", "Business", "Design", "Media", "Content", "Apps"] as const;
export type OfficialCategory = (typeof OFFICIAL_CATEGORIES)[number];

export interface OfficialSkill {
  /** Hermes' skill name once installed (its `/name` command). */
  name: string;
  /** Display title. */
  title: string;
  description: string;
  categories: OfficialCategory[];
  /** What `hermes skills install` takes. */
  identifier: string;
  /** Who publishes it. */
  publisher: "Nous Research" | "Anthropic";
  /** Where the source lives. */
  sourceUrl: string;
  license: "MIT" | "Apache-2.0";
  /** Two colours for the generated cover. */
  cover: [string, string];
}

const HERMES = "https://github.com/NousResearch/hermes-agent/tree/main/optional-skills";
const ANTHROPIC = "https://github.com/anthropics/skills/tree/main/skills";

function hermes(category: string, name: string, title: string, description: string, categories: OfficialCategory[], cover: [string, string], license: "MIT" | "Apache-2.0" = "MIT"): OfficialSkill {
  return { name, title, description, categories, identifier: `official/${category}/${name}`, publisher: "Nous Research", sourceUrl: `${HERMES}/${category}/${name}`, license, cover };
}

function anthropic(name: string, title: string, description: string, categories: OfficialCategory[], cover: [string, string]): OfficialSkill {
  return { name, title, description, categories, identifier: `anthropics/skills/skills/${name}`, publisher: "Anthropic", sourceUrl: `${ANTHROPIC}/${name}`, license: "Apache-2.0", cover };
}

export const OFFICIAL_SKILLS: OfficialSkill[] = [
  // Coding
  hermes("software-development", "code-wiki", "Code Wiki", "Generate wiki docs and Mermaid diagrams for any codebase.", ["Coding"], ["#1E2A44", "#0F1626"]),
  hermes("software-development", "ast-grep", "AST Grep", "Structural, syntax-aware code search and rewrite with ast-grep.", ["Coding"], ["#23324A", "#121A28"]),
  hermes("software-development", "grill-me", "Grill Me", "An adversarial interview of your plan before anyone writes code.", ["Coding"], ["#4A2323", "#261212"]),
  hermes("software-development", "rest-graphql-debug", "API Debugger", "Debug REST and GraphQL APIs: status codes, auth, schemas, minimal repros.", ["Coding"], ["#24433A", "#12261F"]),
  hermes("software-development", "subagent-driven-development", "Subagent Development", "Execute a plan through subagents with a two-stage review.", ["Coding", "Automation"], ["#2F2A4A", "#181526"]),
  hermes("mcp", "fastmcp", "FastMCP Builder", "Build, test and deploy Python MCP servers.", ["Coding"], ["#203A4A", "#101E26"]),
  hermes("web-development", "cloudflare-temporary-deploy", "Instant Worker Deploy", "Deploy a Cloudflare Worker live without an account, via wrangler --temporary.", ["Coding", "Apps"], ["#F2A14B", "#C9682A"]),
  anthropic("webapp-testing", "Web App Testing", "Test local web apps with Playwright: check behaviour, read logs, capture screenshots.", ["Coding"], ["#2B3A2B", "#151E15"]),
  anthropic("mcp-builder", "MCP Builder", "Guide for building high-quality MCP servers that connect models to outside services.", ["Coding"], ["#3A2B44", "#1E1526"]),

  // Data
  hermes("finance", "stocks", "Stock Analysis", "Stock quotes, history, search and comparisons, plus crypto, from Yahoo Finance.", ["Data", "Business"], ["#0B0B0B", "#1C2A1C"]),
  hermes("finance", "polymarket", "Polymarket", "Query Polymarket markets, prices, order books and history.", ["Data"], ["#1F3A73", "#0E1F44"]),
  hermes("data-science", "jupyter-notebook", "Jupyter Notebook", "Iterative Python analysis on a live Jupyter kernel.", ["Data", "Coding"], ["#F3E3CF", "#E9A86B"]),
  hermes("productivity", "live-dashboard", "Live Dashboard", "Build self-updating dashboards from live data sources.", ["Data", "Apps"], ["#13324A", "#0A1A26"]),
  hermes("research", "rss-feeds", "Feed Reader", "Read RSS, Atom and JSON feeds, and find the feeds behind a page.", ["Data", "Content"], ["#E9E2C9", "#C9B78A"]),
  hermes("social-media", "reddit-reading", "Reddit Research", "Read subreddits, searches, threads and users without a browser.", ["Data"], ["#FF6A3D", "#C2401E"]),
  hermes("research", "scrapling", "Web Scraper", "Scrape sites with stealth browsing that gets past bot walls.", ["Data", "Automation"], ["#2A2A2A", "#121212"]),

  // Automation
  hermes("devops", "watchers", "Watchers", "Poll RSS, JSON APIs and GitHub, and report only what is new.", ["Automation"], ["#2D3B2A", "#161E14"]),
  hermes("autonomous-ai-agents", "dynamic-workflow", "Dynamic Workflow", "Plan fan-outs in code, verify adversarially, run in waves.", ["Automation"], ["#3B2D4A", "#1D1626"]),
  hermes("web-development", "har-derived-api-client", "API From Any Site", "Record a site's network calls into a HAR and derive an HTTP client from it.", ["Automation", "Coding"], ["#29404A", "#142026"]),
  hermes("devops", "docker-management", "Docker Manager", "Manage Docker containers, images, volumes and Compose stacks.", ["Automation", "Coding"], ["#1D63ED", "#0E3A99"]),
  anthropic("skill-creator", "Skill Creator", "Create new skills, improve existing ones and measure how well they work.", ["Automation"], ["#D97757", "#A4502F"]),

  // Business
  hermes("finance", "dcf-model", "DCF Model", "Build discounted cash flow valuation workbooks in Excel.", ["Business", "Data"], ["#0F3B2A", "#082016"], "Apache-2.0"),
  hermes("finance", "3-statement-model", "3-Statement Model", "Build linked income statement, balance sheet and cash flow workbooks.", ["Business", "Data"], ["#1A2F4A", "#0D1826"], "Apache-2.0"),
  hermes("finance", "comps-analysis", "Comparable Companies", "Build comparable-company valuation workbooks in Excel.", ["Business", "Data"], ["#3A2F1A", "#1E180D"], "Apache-2.0"),
  hermes("communication", "one-three-one-rule", "1-3-1 Decision Brief", "Write decision briefs: the problem, three options, one recommendation.", ["Business"], ["#E8E4CF", "#CFC79F"]),
  hermes("productivity", "decision-questionnaire", "Decision Questionnaire", "Turn a decision you can't answer yet into a questionnaire document.", ["Business"], ["#EFE8D2", "#D9CBA0"]),
  anthropic("internal-comms", "Internal Comms", "Write status reports, updates, newsletters and FAQs in a house format.", ["Business", "Content"], ["#E6DCCB", "#C9B48E"]),

  // Design
  hermes("creative", "excalidraw", "Excalidraw Diagrams", "Hand-drawn Excalidraw diagrams: architecture, flows, sequences.", ["Design"], ["#F5F0E6", "#DCD3C0"]),
  hermes("creative", "concept-diagrams", "Concept Diagrams", "Flat, minimal educational SVG visuals as HTML.", ["Design", "Content"], ["#E3EEF5", "#B9D2E3"]),
  hermes("creative", "sketch", "UI Sketches", "Throwaway HTML mockups: two or three design variants to compare.", ["Design"], ["#F0E6F5", "#D5BDE3"]),
  hermes("creative", "design-md", "DESIGN.md Tokens", "Author, validate and export DESIGN.md design-token files.", ["Design"], ["#2A2A2A", "#151515"]),
  hermes("creative", "ip-as-logo", "Mascot Logo", "Design minimal mascot marks that read at 32 px.", ["Design"], ["#FFD84D", "#E5A800"]),
  hermes("creative", "impeccable", "Impeccable Frontend", "Frontend design guidance for polished, intentional interfaces.", ["Design", "Coding"], ["#141414", "#2A2A2A"], "Apache-2.0"),
  anthropic("frontend-design", "Frontend Design", "Distinctive visual direction when building or reshaping a UI.", ["Design", "Apps"], ["#F1E2C4", "#D9B98E"]),
  anthropic("canvas-design", "Canvas Design", "Create posters and visual art as PNG and PDF from a design philosophy.", ["Design", "Media"], ["#E6B347", "#C2553D"]),
  anthropic("theme-factory", "Theme Factory", "Style slides, documents and pages with a ready-made or new theme.", ["Design"], ["#3A6EA8", "#22446B"]),

  // Media
  hermes("creative", "hyperframes", "HTML to Video", "Render MP4 and WebM videos from HTML compositions.", ["Media"], ["#123A73", "#0C2550"], "Apache-2.0"),
  hermes("creative", "meme-generation", "Meme Generator", "Make meme images from templates with text overlays.", ["Media"], ["#FFF3B0", "#F2D04B"]),
  hermes("creative", "pixel-art", "Pixel Art", "Pixel art in era palettes: NES, Game Boy, PICO-8.", ["Media", "Design"], ["#2B1B4A", "#160D26"]),
  hermes("creative", "ascii-art", "ASCII Art", "Banners, cowsay, boxes and image-to-ASCII.", ["Media"], ["#0B0B0B", "#1A1A1A"]),
  hermes("media", "gif-search", "GIF Search", "Search and download GIFs from Tenor.", ["Media"], ["#7A3DF2", "#4A1EB0"]),
  anthropic("algorithmic-art", "Algorithmic Art", "Generative art in p5.js with seeded randomness and tunable parameters.", ["Media", "Design"], ["#4B2D6B", "#2E1D4A"]),

  // Content
  hermes("research", "research-paper-writing", "Research Paper Writing", "Write ML papers end to end, from study design to submission.", ["Content"], ["#E9E2C9", "#C9D7A7"]),
  hermes("creative", "simple-english", "Simple English", "Rewrite text into ASD-STE100 Simplified Technical English.", ["Content"], ["#F3F0E8", "#DAD3C2"]),
  hermes("creative", "baoyu-comic", "Knowledge Comics", "Educational, biographical and tutorial comics.", ["Content", "Media"], ["#F3E3CF", "#E9B9A1"]),
  hermes("creative", "baoyu-article-illustrator", "Article Illustrator", "Consistent illustrations for an article, by type, style and palette.", ["Content", "Design"], ["#E8E4CF", "#D6DCC0"]),
  hermes("creative", "creative-ideation", "Creative Ideation", "Generate ideas with named methods from creative practice.", ["Content"], ["#FFE1D6", "#F2A88A"]),
  hermes("creative", "social-media-content-calendar", "Content Calendar", "Plan multi-platform social campaigns, from brief to posting schedule.", ["Content", "Business"], ["#D6F0E4", "#9ED3B9"]),
  hermes("research", "llm-wiki", "LLM Wiki", "Build and query an interlinked markdown knowledge base.", ["Content", "Data"], ["#EFE8D2", "#D9E3C8"]),

  // Apps
  hermes("web-development", "publish-site", "Publish Site", "Versioned site deploys to GitHub, Cloudflare or Netlify Pages.", ["Apps"], ["#1C1C1C", "#333333"]),
  hermes("web-development", "scrollcraft", "Scrollcraft", "Scroll-driven landing pages where scrolling is the timeline.", ["Apps", "Design"], ["#0E0E2C", "#24245C"]),
  hermes("creative", "auteur", "Auteur", "Design and build cinematic, award-level web pages.", ["Apps", "Design"], ["#2C0E0E", "#5C2424"]),
  hermes("finance", "excel-author", "Excel Author", "Build auditable spreadsheets headless with openpyxl.", ["Apps", "Data"], ["#1F6B3A", "#0F3A1E"], "Apache-2.0"),
  hermes("finance", "pptx-author", "Slide Deck Author", "Build PowerPoint decks headless with python-pptx.", ["Apps", "Content"], ["#C0472E", "#7A2A1A"], "Apache-2.0"),
  anthropic("web-artifacts-builder", "Web Artifacts Builder", "Build multi-component HTML apps with React, Tailwind and shadcn/ui.", ["Apps", "Coding"], ["#24433A", "#12261F"]),
];

export function officialByName(name: string): OfficialSkill | undefined {
  return OFFICIAL_SKILLS.find((s) => s.name === name);
}
