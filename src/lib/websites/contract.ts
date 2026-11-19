// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The site-building contract: instructions sent with every run of a website task (the same channel
 * as project instructions, `task.meta.instructions`), and the marker file the agent writes so the
 * server never has to parse prose.
 *
 * Marker: `<folder>/.openman/site.json`
 *   { "version": 1, "status": "ready", "template": "static" | "fullstack" | "vite-react", "title": "...",
 *     "port": <dev port>, "dev": "<command reading $PORT>", "build": "<command>" | null, "output": "<dir>",
 *     "features": ["database", "auth", "uploads", "ai"] }   (features: full-stack only)
 * Secrets the site needs: `<folder>/.openman/needs-secrets.json` = [{ "name": "STRIPE_KEY", "why": "..." }].
 */
import type { SiteTemplate } from "./types";

export const SITES_ROOT = "/root/sites";
export const MARKER = ".openman/site.json";

export interface SiteMarker {
  version?: number;
  status?: "building" | "ready" | string;
  template?: SiteTemplate | string;
  title?: string;
  port?: number;
  dev?: string;
  build?: string | null;
  output?: string;
  features?: string[];
}

/** Where the app installs its site kit on the computer (see kit-files.ts). */
export const KIT_DIR = "/root/.openman/site-kit";
export const NEEDS_SECRETS = ".openman/needs-secrets.json";

export const TEMPLATES: Record<SiteTemplate, { label: string; dev: string; build: string | null; output: string; when: string; scaffold: string }> = {
  static: {
    label: "Static HTML",
    dev: "python3 -m http.server $PORT --bind 0.0.0.0",
    build: null,
    output: ".",
    when: "landing pages, portfolios, event pages, simple multi-page sites",
    scaffold: "Write index.html, styles.css and script.js by hand (add more pages as .html files). Use no build step. Fonts and libraries only from public CDNs.",
  },
  fullstack: {
    label: "Full-stack (Node + SQLite)",
    dev: "node server.mjs",
    build: null,
    output: ".",
    when: "apps that store data, need sign-in or roles, file uploads, secrets (API keys) or AI features",
    scaffold:
      `Run \`cp -rn ${KIT_DIR}/fullstack/. <folder>/\`. It is a dependency-free Node server: server.mjs (do not edit) gives a SQLite database ` +
      "(`app.db` via node:sqlite, prepared statements with ? placeholders only), email+password sign-in with roles (POST /api/auth/signup|login|logout, GET /api/auth/me; " +
      "the first account is \"admin\"; use app.requireUser(req) / app.requireRole(req, \"admin\")), file uploads (POST /api/uploads?name=<file> with the raw body, served at /uploads/...), " +
      "secrets from process.env, and AI for signed-in users (POST /api/ai {prompt, system?} or app.askModel(prompt) in routes; works only after the owner turns AI on). " +
      "Put your tables and API in routes.mjs (it has an example), your pages in public/. Do not add npm packages unless truly needed; never put secrets in code.",
  },
  "vite-react": {
    label: "Vite + React + TypeScript",
    dev: "npx vite --host 0.0.0.0 --port $PORT --strictPort",
    build: "npm run build",
    output: "dist",
    when: "interactive apps, dashboards, tools, games, anything with real state",
    scaffold:
      "Run `npm create vite@latest . -- --template react-ts --no-interactive` (answer yes to using the non-empty folder), then `npm install`. " +
      "In vite.config.ts set `server: { allowedHosts: true }` and `preview: { allowedHosts: true }`, or the preview URL is refused. Use relative asset paths (`base: './'`).",
  },
};

export function siteFolder(slug: string): string {
  return `${SITES_ROOT}/${slug}`;
}

/** Instructions for a run that builds or edits one site. */
export function siteInstructions(site: { name: string; folder: string; devPort: number }): string {
  const t = TEMPLATES;
  return [
    `WEBSITE TASK. You are building the website "${site.name}". A live preview of it is shown to the user next to this chat, so follow this contract exactly.`,
    `1. Folder: work only in ${site.folder} (it exists and is a git repository). Never put the site anywhere else.`,
    `2. Template: pick one and scaffold it in that folder.`,
    `   - "static" (${t.static.when}): ${t.static.scaffold}`,
    `   - "fullstack" (${t.fullstack.when}): ${t.fullstack.scaffold.replace("<folder>", site.folder)}`,
    `   - "vite-react" (${t["vite-react"].when}): ${t["vite-react"].scaffold}`,
    `   Prefer "static" for content sites. Choose "fullstack" whenever the site must save data, sign people in, take uploads, use an API key or call AI. Use "vite-react" only for a client-side app with no server data.`,
    `3. Before writing much code, show the user a short plan as your first message: the pages or sections, the look (colours, fonts) and the template you chose.`,
    `4. Marker and preview: EARLY (as soon as an index page exists and, for vite-react, \`npm install\` has finished) write ${site.folder}/${MARKER} as JSON:`,
    `   {"version":1,"status":"ready","template":"<static|fullstack|vite-react>","title":"<site title>","port":${site.devPort},"dev":"<dev command>","build":<"npm run build" or null>,"output":<"dist" or ".">,"features":[<for fullstack: the ones you use of "database","auth","uploads","ai">]}`,
    `   Dev commands (they read $PORT): static = \`${t.static.dev}\`; fullstack = \`${t.fullstack.dev}\`; vite-react = \`${t["vite-react"].dev}\`.`,
    `   Do NOT start the dev server yourself: within a few seconds of the marker appearing, the app starts it on port ${site.devPort} (log in .openman/dev.log) and shows the preview. Check it with \`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${site.devPort}/\` (wait and retry up to 30 s).`,
    `   Rewrite the marker if anything in it changes. Do not publish the site and do not create public URLs; the app does that.`,
    `5. Use the same marker for every later change; never move the site to another port or folder.`,
    `6. Versions: after each finished change run \`cd ${site.folder} && git add -A && git commit -qm "<what changed, under 60 characters>"\`. Each commit is a version the user can roll back to. Never rewrite history.`,
    `7. Keep node_modules, dist and .openman out of git (a .gitignore is already there). Keep the site responsive (it is previewed at desktop and phone widths).`,
    `8. When the user asks for changes later, edit the same folder; the dev server hot-reloads or the user reloads the preview. If it stops answering, the app restarts it; read .openman/dev.log to find errors.`,
    `9. Secrets (API keys, tokens): never ask the user to paste one into the chat and never write one into a file. Read it from process.env (fullstack) and list what you need in ${site.folder}/${NEEDS_SECRETS} as [{"name":"UPPER_SNAKE_NAME","why":"<one line>"}]; the user gets a form to enter each one, the app writes them to the site's .env (never published, never committed) and they appear in process.env without a restart. Say in the chat which secrets you need and why.`,
    `10. The site's database lives in .openman/data/app.db and its page views, scheduled jobs and secrets are managed by the app's dashboard: do not build your own analytics, cron or .env handling.`,
    `11. Finish with a short summary of what you built (and the template you used). Do not paste the marker or long code into the chat.`,
  ].join("\n");
}

/** Words that mark a prompt as "build a website". Used by the composer to route to `/api/websites`. */
export const WEBSITE_PROMPT = /^\s*(please\s+)?(build|create|make|design|code)\s+(me\s+)?(a|an|my|the)?\s*(new\s+)?(website|web\s*site|site|landing\s*page|web\s*app|webpage|web\s*page|portfolio|homepage)\b/i;

export function isWebsitePrompt(prompt: string): boolean {
  return WEBSITE_PROMPT.test(prompt);
}

/** A name for a site from its prompt: "Build a website for Vert Club, ..." -> "Vert Club". */
export function nameFromPrompt(prompt: string): string {
  const rest = prompt.replace(WEBSITE_PROMPT, "").trim();
  const m = rest.match(/^(for|about|called|named)\s+(.+)$/i);
  let name = (m ? m[2] : rest).split(/[,.\n;:!?]| that | with | which | where /i)[0].trim();
  name = name.replace(/^(the|a|an|my)\s+/i, "").replace(/["'`]/g, "");
  if (!name) return "New website";
  if (name.length > 40) name = `${name.slice(0, 40).replace(/\s+\S*$/, "")}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** 2 to 16 chars of a-z0-9- for folder names and Orgo URL names. */
export function slugify(name: string, max = 16): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : `site-${s || "x"}`.slice(0, max);
}
