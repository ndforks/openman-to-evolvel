#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
//
// Adds a two-line SPDX licence header to OpenMan's own source files. Safe to re-run: a file that already has an
// `SPDX-License-Identifier` line near the top is left alone.
//   node scripts/add-spdx.mjs            add the header where it is missing
//   node scripts/add-spdx.mjs --dry-run  list the files that would change, change nothing
//   node scripts/add-spdx.mjs --check    exit 1 if any file lacks the header (for CI)
//
// Header (comment syntax follows the file type):
//   // SPDX-License-Identifier: MIT
//   // Copyright (c) 2026 Organic Intelligence, Inc.
//
// Placement: after a `#!` line if there is one, otherwise at the very top. A comment before "use client" /
// "use server" is allowed (directives only have to be the first statement), so those files work unchanged.
//
// Not touched: node_modules, .next, generated files (next-env.d.ts, src/lib/websites/kit-files.ts), and the website
// starter kit in src/lib/websites/kit/, whose files are copied into users' own websites (kit-files.ts is generated
// from them, so changing them also means re-running src/lib/websites/kit/generate.mjs).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");

const LICENSE = "SPDX-License-Identifier: MIT";
const COPYRIGHT = "Copyright (c) 2026 Organic Intelligence, Inc.";

const ROOTS = ["src", "scripts", "next.config.ts", "eslint.config.mjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".data"]);
const SKIP_FILES = new Set(["next-env.d.ts", "src/lib/websites/kit-files.ts"]);
const SKIP_PREFIXES = ["src/lib/websites/kit/"];

const STYLES = {
  line: (text) => `// ${text}`,
  hash: (text) => `# ${text}`,
  block: (text) => `/* ${text} */`,
};
const STYLE_BY_EXT = {
  ".ts": "line", ".tsx": "line", ".js": "line", ".jsx": "line", ".mjs": "line", ".cjs": "line",
  ".css": "block",
  ".sh": "hash", ".py": "hash",
};

function* walk(rel) {
  const abs = path.join(root, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(path.posix.join(rel, name));
    }
  } else if (st.isFile()) {
    yield rel;
  }
}

function eligible(rel) {
  if (SKIP_FILES.has(rel) || SKIP_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (/\.d\.ts$/.test(rel)) return false;
  return path.extname(rel) in STYLE_BY_EXT;
}

const missing = [];
let changed = 0;
for (const top of ROOTS) {
  for (const rel of walk(top)) {
    if (!eligible(rel)) continue;
    const abs = path.join(root, rel);
    const src = readFileSync(abs, "utf8");
    const head = src.split("\n").slice(0, 6).join("\n");
    if (head.includes("SPDX-License-Identifier")) continue;
    missing.push(rel);
    if (check || dryRun) continue;

    const style = STYLES[STYLE_BY_EXT[path.extname(rel)]];
    const header = `${style(LICENSE)}\n${style(COPYRIGHT)}\n`;
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    let out;
    if (src.startsWith("#!")) {
      const nl = src.indexOf("\n");
      const first = nl === -1 ? `${src}${eol}` : src.slice(0, nl + 1);
      out = first + header.replaceAll("\n", eol) + (nl === -1 ? "" : src.slice(nl + 1));
    } else {
      out = header.replaceAll("\n", eol) + src;
    }
    writeFileSync(abs, out);
    changed++;
  }
}

if (check) {
  if (missing.length) {
    console.error(`${missing.length} file(s) lack the SPDX header:`);
    for (const f of missing) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("Every source file has the SPDX header.");
} else if (dryRun) {
  for (const f of missing) console.log(f);
  console.log(`${missing.length} file(s) would get the header.`);
} else {
  console.log(`Added the SPDX header to ${changed} file(s).`);
}
