# Third-party notices

OpenMan is licensed under the [MIT License](LICENSE). It uses, references or installs third-party software and content
that remain under their own licences, listed below. Third-party names and logos are trademarks of their respective
owners; see [NOTICE](NOTICE).

This file was generated on 2026-11-19 from the repository and `package-lock.json`. Regenerate the dependency section
after changing dependencies (command at the end).

## 1. Skills in the official skill library

`src/lib/skills/official.ts` lists skills that users can install on their own Orgo computer. OpenMan does not copy or
host these skills: it stores their names and source links, and the Hermes Agent installer
(`hermes skills install <identifier>`) downloads each one from its source on the user's computer. Each skill stays
under its own licence, recorded in its source folder.

Excluded on purpose: Anthropic's document skills (`docx`, `pdf`, `pptx`, `xlsx`), which are source-available rather
than open source, and community-hub skills whose licence is not recorded.

| Skill | Identifier | Publisher | Source | Licence |
|---|---|---|---|---|
| Code Wiki | `official/software-development/code-wiki` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/software-development/code-wiki) | MIT |
| AST Grep | `official/software-development/ast-grep` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/software-development/ast-grep) | MIT |
| Grill Me | `official/software-development/grill-me` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/software-development/grill-me) | MIT |
| API Debugger | `official/software-development/rest-graphql-debug` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/software-development/rest-graphql-debug) | MIT |
| Subagent Development | `official/software-development/subagent-driven-development` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/software-development/subagent-driven-development) | MIT |
| FastMCP Builder | `official/mcp/fastmcp` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/mcp/fastmcp) | MIT |
| Instant Worker Deploy | `official/web-development/cloudflare-temporary-deploy` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development/cloudflare-temporary-deploy) | MIT |
| Stock Analysis | `official/finance/stocks` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/stocks) | MIT |
| Polymarket | `official/finance/polymarket` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/polymarket) | MIT |
| Jupyter Notebook | `official/data-science/jupyter-notebook` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/data-science/jupyter-notebook) | MIT |
| Live Dashboard | `official/productivity/live-dashboard` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/productivity/live-dashboard) | MIT |
| Feed Reader | `official/research/rss-feeds` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/research/rss-feeds) | MIT |
| Reddit Research | `official/social-media/reddit-reading` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/social-media/reddit-reading) | MIT |
| Web Scraper | `official/research/scrapling` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/research/scrapling) | MIT |
| Watchers | `official/devops/watchers` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/devops/watchers) | MIT |
| Dynamic Workflow | `official/autonomous-ai-agents/dynamic-workflow` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/autonomous-ai-agents/dynamic-workflow) | MIT |
| API From Any Site | `official/web-development/har-derived-api-client` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development/har-derived-api-client) | MIT |
| Docker Manager | `official/devops/docker-management` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/devops/docker-management) | MIT |
| DCF Model | `official/finance/dcf-model` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/dcf-model) | Apache-2.0 |
| 3-Statement Model | `official/finance/3-statement-model` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/3-statement-model) | Apache-2.0 |
| Comparable Companies | `official/finance/comps-analysis` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/comps-analysis) | Apache-2.0 |
| 1-3-1 Decision Brief | `official/communication/one-three-one-rule` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/communication/one-three-one-rule) | MIT |
| Decision Questionnaire | `official/productivity/decision-questionnaire` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/productivity/decision-questionnaire) | MIT |
| Excalidraw Diagrams | `official/creative/excalidraw` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/excalidraw) | MIT |
| Concept Diagrams | `official/creative/concept-diagrams` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/concept-diagrams) | MIT |
| UI Sketches | `official/creative/sketch` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/sketch) | MIT |
| DESIGN.md Tokens | `official/creative/design-md` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/design-md) | MIT |
| Mascot Logo | `official/creative/ip-as-logo` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/ip-as-logo) | MIT |
| Impeccable Frontend | `official/creative/impeccable` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/impeccable) | Apache-2.0 |
| HTML to Video | `official/creative/hyperframes` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/hyperframes) | Apache-2.0 |
| Meme Generator | `official/creative/meme-generation` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/meme-generation) | MIT |
| Pixel Art | `official/creative/pixel-art` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/pixel-art) | MIT |
| ASCII Art | `official/creative/ascii-art` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/ascii-art) | MIT |
| GIF Search | `official/media/gif-search` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/media/gif-search) | MIT |
| Research Paper Writing | `official/research/research-paper-writing` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/research/research-paper-writing) | MIT |
| Simple English | `official/creative/simple-english` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/simple-english) | MIT |
| Knowledge Comics | `official/creative/baoyu-comic` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/baoyu-comic) | MIT |
| Article Illustrator | `official/creative/baoyu-article-illustrator` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/baoyu-article-illustrator) | MIT |
| Creative Ideation | `official/creative/creative-ideation` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/creative-ideation) | MIT |
| Content Calendar | `official/creative/social-media-content-calendar` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/social-media-content-calendar) | MIT |
| LLM Wiki | `official/research/llm-wiki` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/research/llm-wiki) | MIT |
| Publish Site | `official/web-development/publish-site` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development/publish-site) | MIT |
| Scrollcraft | `official/web-development/scrollcraft` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/web-development/scrollcraft) | MIT |
| Auteur | `official/creative/auteur` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/creative/auteur) | MIT |
| Excel Author | `official/finance/excel-author` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/excel-author) | Apache-2.0 |
| Slide Deck Author | `official/finance/pptx-author` | Nous Research | [source](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/finance/pptx-author) | Apache-2.0 |
| Web App Testing | `anthropics/skills/skills/webapp-testing` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Apache-2.0 |
| MCP Builder | `anthropics/skills/skills/mcp-builder` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/mcp-builder) | Apache-2.0 |
| Skill Creator | `anthropics/skills/skills/skill-creator` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/skill-creator) | Apache-2.0 |
| Internal Comms | `anthropics/skills/skills/internal-comms` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/internal-comms) | Apache-2.0 |
| Frontend Design | `anthropics/skills/skills/frontend-design` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Apache-2.0 |
| Canvas Design | `anthropics/skills/skills/canvas-design` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/canvas-design) | Apache-2.0 |
| Theme Factory | `anthropics/skills/skills/theme-factory` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/theme-factory) | Apache-2.0 |
| Algorithmic Art | `anthropics/skills/skills/algorithmic-art` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/algorithmic-art) | Apache-2.0 |
| Web Artifacts Builder | `anthropics/skills/skills/web-artifacts-builder` | Anthropic | [source](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) | Apache-2.0 |

Hermes Agent's bundled skills (seeded into every Hermes profile by Hermes itself, MIT) are read from the user's
computer and are not part of this repository.

## 2. Software OpenMan runs against (not included in this repository)

| Software | Use | Licence | Source |
|---|---|---|---|
| Hermes Agent (Nous Research) | The agent runtime on each user's Orgo computer, installed by Orgo's `system/hermes-agent` template | MIT | https://github.com/NousResearch/hermes-agent |
| Supabase / PostgreSQL | App database (a Supabase project the operator creates) | Apache-2.0 (Supabase), PostgreSQL License | https://github.com/supabase/supabase |

Hosted services OpenMan can call (Orgo, Anthropic models through Orgo's proxy, AgentMail, AgentPhone, ElevenLabs,
Composio-backed connectors and others) are governed by their own terms, not by a software licence in this repository.

## 3. Fonts

| Font | Where | Licence | Source |
|---|---|---|---|
| Libre Baskerville (Impallari Type) | Serif headings, loaded through `next/font/google` in `src/app/layout.tsx` and self-hosted by Next.js at build time | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Libre+Baskerville |

Body text uses the visitor's system font stack; no font file is included for it.

## 4. Vendored code

No third-party source code is copied into `src/`, `public/` or `scripts/`. All third-party code arrives through npm
(section 6). `src/lib/websites/kit/` (the website starter kit and click-to-edit inspector) is original to this
project.

## 5. Third-party logos in `public/brands/`

These files show the marks of third-party products and services so that users can recognise the integrations and
platforms OpenMan works with (connectors, chat channels, sign-in options, operating systems, download badges). Every
mark is a trademark of its owner, used only to identify that product. Their presence implies no endorsement,
sponsorship or affiliation. The trademark rights are not covered by OpenMan's MIT License or by any icon licence.

Files whose source is listed as **Simple Icons** are taken from the [Simple Icons](https://simpleicons.org) project
(the SVG path data is released under CC0-1.0; Simple Icons notes that the marks themselves remain subject to their
owners' brand guidelines). Variants with a different fill colour (`-c`, `-dl`, `-w`, `-o` suffixes, or a plain name
next to a `.raw.svg`) are the same path with a colour applied. Files listed as **project drawing** are simplified
shapes drawn for this project in the owner's brand colours; their exact origin was not recorded and should be checked
before release (see "Open items").

| Mark | Owner | Files | Source |
|---|---|---|---|
| Android | Google LLC | `android.svg`, `android-dl.svg` | Simple Icons |
| Apple | Apple Inc. | `apple.svg`, `apple.raw.svg`, `apple-dl.svg` | Simple Icons |
| App Store | Apple Inc. | `appstore.svg`, `appstore-dl.svg` | Simple Icons |
| Blender | Blender Foundation | `blender.svg`, `blender.raw.svg` | Simple Icons |
| Figma | Figma, Inc. | `figma.svg`, `figma.raw.svg`, `figma-c.svg` | Simple Icons |
| GitHub | GitHub, Inc. | `github.svg`, `github.raw.svg`, `github-c.svg` | Simple Icons |
| Gmail | Google LLC | `gmail.svg`, `gmail.raw.svg`, `gmail-c.svg` | Simple Icons |
| Gmail (colour) | Google LLC | `gmail-color.svg` | project drawing |
| Google Calendar | Google LLC | `googlecalendar.svg`, `googlecalendar.raw.svg` | Simple Icons |
| Google Calendar (colour) | Google LLC | `googlecalendar-color.svg` | project drawing |
| Google Chrome | Google LLC | `googlechrome.svg`, `googlechrome.raw.svg`, `googlechrome-c.svg` | Simple Icons |
| Google Drive | Google LLC | `googledrive.svg`, `googledrive.raw.svg`, `googledrive-c.svg` | Simple Icons |
| Google Drive (colour) | Google LLC | `googledrive-color.svg` | project drawing |
| Google Play | Google LLC | `googleplay.svg`, `googleplay-dl.svg` | Simple Icons |
| Google Sheets | Google LLC | `googlesheets.svg`, `googlesheets.raw.svg` | Simple Icons |
| Google Workspace | Google LLC | `googleworkspace-color.svg` | project drawing |
| HubSpot | HubSpot, Inc. | `hubspot.svg` | Simple Icons |
| iMessage | Apple Inc. | `imessage.svg`, `imessage-w.svg` | Simple Icons |
| Instagram | Meta Platforms, Inc. | `instagram.svg`, `instagram.raw.svg`, `instagram-c.svg` | Simple Icons |
| Instagram (colour) | Meta Platforms, Inc. | `instagram-color.svg` | project drawing |
| LINE | LY Corporation | `line.svg`, `line-w.svg` | Simple Icons |
| Linear | Linear Orbit, Inc. | `linear.svg` | Simple Icons |
| Linux (Tux) | Linus Torvalds (Linux mark); Tux by Larry Ewing | `linux.svg`, `linux.raw.svg` | Simple Icons |
| Tux | Larry Ewing (original Tux artwork) | `tux.svg` | project drawing |
| Meta | Meta Platforms, Inc. | `meta.svg`, `meta.raw.svg`, `meta-c.svg` | Simple Icons |
| Microsoft Outlook | Microsoft Corporation | `outlook-color.svg` | project drawing |
| Notion | Notion Labs, Inc. | `notion.svg`, `notion.raw.svg`, `notion-c.svg` | Simple Icons |
| OneDrive | Microsoft Corporation | `onedrive-c.svg` | project drawing |
| Shopify | Shopify Inc. | `shopify.svg`, `shopify.raw.svg` | Simple Icons |
| Similarweb | Similarweb Ltd. | `similarweb.svg`, `similarweb.raw.svg` | Simple Icons |
| Slack | Salesforce, Inc. | `slack.svg`, `slack.raw.svg` | Simple Icons |
| Slack (colour) | Salesforce, Inc. | `slack-color.svg` | project drawing |
| Telegram | Telegram FZ-LLC | `telegram.svg`, `telegram-w.svg` | Simple Icons |
| Windows | Microsoft Corporation | `windows-blue.svg`, `windows-color.svg` | project drawing |
| World Bank | International Bank for Reconstruction and Development | `worldbank.svg` | project drawing (generic globe in the owner's colour) |
| X | X Corp. | `x.svg`, `x.raw.svg` | Simple Icons |
| Xcode | Apple Inc. | `xcode.svg`, `xcode.raw.svg` | Simple Icons |
| Zapier | Zapier, Inc. | `zapier.svg`, `zapier-o.svg`, `zapier-w.svg` | Simple Icons |

`server.svg` is a generic illustration, not a third-party mark.

The OpenMan logos in `public/brand/` are trademarks of Organic Intelligence, Inc. and are not licensed under MIT; see
[TRADEMARKS.md](TRADEMARKS.md).

## 6. npm dependencies

Licences of the packages in `package-lock.json`, counted by
[license-checker-rseidelsohn](https://github.com/RSeidelsohn/license-checker-rseidelsohn) on 2026-11-19 (macOS
arm64 install, so platform-specific optional packages for other systems are not counted). The `openman` package itself
shows as UNLICENSED only because `package.json` has no `license` field yet.

**Production dependencies** (`--production`, 190 packages besides `openman` itself):

| Licence | Packages |
|---|---|
| MIT | 175 |
| Apache-2.0 | 5 |
| ISC | 4 |
| 0BSD | 2 |
| BSD-3-Clause | 1 |
| MPL-2.0 | 1 (`@novnc/novnc`) |
| LGPL-3.0-or-later | 1 (`@img/sharp-libvips-*`) |
| CC-BY-4.0 | 1 (`caniuse-lite`) |

**All dependencies including development tools** (515 packages besides `openman` itself): MIT 455, Apache-2.0 22, ISC 16, BSD-2-Clause 7,
MPL-2.0 4, BlueOak-1.0.0 3, BSD-3-Clause 2, 0BSD 2, LGPL-3.0-or-later 1, Python-2.0 1, CC-BY-4.0 1, CC0-1.0 1.

### Licences that need attention

None of these prevents distributing OpenMan's own source code under MIT, because this repository does not copy their
code; each package keeps its own licence when installed.

| Package | Licence | Where | What it means |
|---|---|---|---|
| `@novnc/novnc` | MPL-2.0 (file-level copyleft; it also bundles MIT code) | Runtime, browser bundle (live desktop view) | Compatible with MIT distribution. If you modify noVNC's own files and distribute them, those files must stay under MPL-2.0 and their source must be available. Using it unmodified, as this project does, needs only the notice to be preserved. |
| `@img/sharp-libvips-*` | LGPL-3.0-or-later | Optional native dependency of `sharp`, pulled in by Next.js for image optimisation | Installed from npm as a separate, dynamically loaded library; nothing is copied into this repository. Relevant only if you redistribute built artefacts (for example a container image): then keep the libvips licence and notice with it and allow it to be replaced. |
| `caniuse-lite` | CC-BY-4.0 | Build-time browser data used by Next.js | Data, not code. Attribution is kept in the package. |
| `lightningcss`, `lightningcss-*` | MPL-2.0 | Development only (Tailwind CSS build) | Not shipped in the app; unmodified use. |
| `axe-core` | MPL-2.0 | Development only (ESLint accessibility rules) | Not shipped in the app. |
| `minimatch`, `graceful-fs`, `@isaacs/nonrecursive-glob-match` | BlueOak-1.0.0 | Development only | Permissive. |
| `argparse` | Python-2.0 | Development only | Permissive. |

No dependency is under GPL, AGPL, SSPL or another licence that would conflict with MIT distribution of this
repository.

To regenerate:

```bash
npx --yes license-checker-rseidelsohn --production --summary
npx --yes license-checker-rseidelsohn --summary
```

## Open items for the owner

- Confirm the origin of the files marked "project drawing" in section 5, or replace them with Simple Icons versions
  or the owners' official press-kit assets used within their brand guidelines.
- `public/brands/microsoftoutlook.raw.svg` is not an image (it holds an error message from a failed download) and
  should be deleted.
- Add `"license": "MIT"` to `package.json`.
