import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto";
// Run: node src/lib/websites/kit/generate.mjs (after editing any kit file).
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const k = path.join(root, "kit");
const read = (p) => fs.readFileSync(path.join(k, p), "utf8");
const files = {
  "om-runtime.mjs": read("om-runtime.mjs"),
  "static-serve.mjs": read("static-serve.mjs"),
  "inspector.js": read("inspector.js"),
  "dbtool.py": read("dbtool.py"),
  "fullstack/server.mjs": read("fullstack/server.mjs"),
  "fullstack/om-runtime.mjs": read("om-runtime.mjs"),
  "fullstack/routes.mjs": read("fullstack/routes.mjs"),
  "fullstack/public/index.html": read("fullstack/public/index.html"),
  "fullstack/.gitignore": "node_modules/\ndist/\n.openman/\n.env\n.env.*\n",
};
const version = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 12);
const out = `/**\n * GENERATED from ./kit (do not edit by hand). The site kit installed on the user's computer at /root/.openman/site-kit:\n * the runtime (static/preview server, analytics, scheduled jobs, inspector), the database helper and the full-stack template.\n */\nexport const KIT_VERSION = ${JSON.stringify(version)};\n\nexport const KIT_FILES: Record<string, string> = ${JSON.stringify(files, null, 0)};\n`;
fs.writeFileSync(path.join(root, "kit-files.ts"), out);
console.log("kit", version, out.length);
