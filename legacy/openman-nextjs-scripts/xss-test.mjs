// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Links and images in agent-written content, and the pages that show it (review: XSS in Markdown, previews, share, docs).
//   node scripts/xss-test.mjs
import path from "node:path";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { safeHref } = await jiti.import(path.join(root, "src/lib/net/safe-href.ts"));
let failures = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); if (!c) failures++; };

for (const bad of ["javascript:alert(1)", "java\tscript:alert(1)", " javascript:x", "JAVASCRIPT:x", "java\nscript:x", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd", "//evil.example/x", "\\\\evil.example"])
  ok(safeHref(bad) === undefined, `link refused: ${JSON.stringify(bad)}`);
for (const good of ["https://example.com/a?b#c", "http://example.com", "/app/task/1", "#section", "mailto:a@example.com", "report/chart.png"]) ok(safeHref(good) === good, `link kept: ${good}`);
ok(safeHref("data:image/png;base64,AAAA", "image") === "data:image/png;base64,AAAA", "data:image kept for images");
ok(safeHref("data:image/png;base64,AAAA", "link") === undefined, "data: refused for links");

const src = (f) => readFileSync(path.join(root, f), "utf8");
const all = ["src/app/share/[token]/shared-view.tsx", "src/components/artifacts/basic-viewers.tsx", "src/app/docs/_components/markdown.tsx", "src/app/app/agents/AgentsView.tsx"];
for (const f of all) {
  const s = src(f);
  ok(!/dangerouslySetInnerHTML|rehype-raw|rehypeRaw|skipHtml=\{false\}|urlTransform=\{\(?[a-z]*\)? *=> *[a-z]*\}/.test(s), `${f}: no raw HTML and no permissive urlTransform`);
}
ok(/safeHref/.test(src("src/components/artifacts/basic-viewers.tsx")), "artifact Markdown links go through safeHref");
ok(/sandbox="/.test(src("src/components/pages/websites/SiteDashboard.tsx")), "site dashboard preview iframe is sandboxed");
ok(!/allow-top-navigation/.test(src("src/components/pages/websites/SiteDashboard.tsx")), "preview cannot navigate the top window");

const BASE = (process.env.BASE_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const res = await fetch(`${BASE}/`);
const csp = res.headers.get("content-security-policy") ?? "";
ok(/frame-ancestors 'none'/.test(csp) && res.headers.get("x-frame-options") === "DENY", "pages cannot be framed");
ok(/object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), "CSP blocks plugins and base-tag hijack");
ok(res.headers.get("x-content-type-options") === "nosniff", "nosniff");
ok(/strict-origin-when-cross-origin/.test(res.headers.get("referrer-policy") ?? ""), "referrer policy");
ok(/max-age=\d+/.test(res.headers.get("strict-transport-security") ?? ""), "HSTS");
ok(/microphone=\(\)/.test(res.headers.get("permissions-policy") ?? ""), "no microphone on the marketing site");
const app = await fetch(`${BASE}/app`, { redirect: "manual" });
ok(/microphone=\(self\)/.test(app.headers.get("permissions-policy") ?? ""), "microphone allowed in /app");
const share = await fetch(`${BASE}/share/does-not-exist-${Date.now()}`, { redirect: "manual" });
ok(/frame-ancestors 'none'/.test(share.headers.get("content-security-policy") ?? ""), "share pages carry the CSP too");
const api = await fetch(`${BASE}/api/me`);
ok(api.headers.get("x-content-type-options") === "nosniff", "API responses carry the headers");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
