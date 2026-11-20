#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
//
// First-time setup for a self-hosted OpenMan.
//   node scripts/setup.mjs                 create .env.local from .env.example if missing, generate the app secrets that
//                                          are missing, print the SQL that registers the database secret, check values
//   node scripts/setup.mjs --check         only check; change nothing
//   node scripts/setup.mjs --env FILE      use FILE instead of .env.local (for example .env.production)
//   node scripts/setup.mjs --sql-out FILE  also write the SQL to FILE (mode 0600) instead of only printing it
//
// Never overwrites a value that is already set, and never prints a secret. It prints only the SHA-256 of
// APP_DB_SECRET, which is what the database stores.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const checkOnly = flag("--check");
const envFile = path.resolve(root, option("--env") ?? ".env.local");
const sqlOut = option("--sql-out");
const exampleFile = path.join(root, ".env.example");

const SECRETS = ["APP_DB_SECRET", "SESSION_SECRET", "APP_ENCRYPTION_KEY", "CRON_SECRET"];
const REQUIRED = ["APP_PUBLIC_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ...SECRETS];
const PLACEHOLDER = /your-project-ref|replace_me|^changeme$/i;
const HEX64 = /^[0-9a-f]{64}$/i;

const rel = (p) => path.relative(root, p) || p;
const problems = [];
const warnings = [];

// ------------------------------------------------------------------ read or create the env file
let text;
if (existsSync(envFile)) {
  text = readFileSync(envFile, "utf8");
} else if (checkOnly) {
  console.error(`${rel(envFile)} does not exist. Run without --check to create it from .env.example.`);
  process.exit(1);
} else {
  text = existsSync(exampleFile) ? readFileSync(exampleFile, "utf8") : "";
  console.log(`Created ${rel(envFile)} from .env.example.`);
}

/** Last assignment of each name (the way dotenv loaders read it). Quotes around a value are removed. */
function parse(src) {
  const out = {};
  for (const line of src.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Sets NAME=value: fills an existing empty `NAME=` line, else appends. Never touches a line that has a value. */
function setValue(src, name, value) {
  const re = new RegExp(`^(\\s*(?:export\\s+)?${name}\\s*=)\\s*(?:""|'')?\\s*$`, "m");
  if (re.test(src)) return src.replace(re, `$1${value}`);
  return `${src.replace(/\n*$/, "\n")}${name}=${value}\n`;
}

let env = parse(text);

// ------------------------------------------------------------------ generate missing secrets
const generated = [];
for (const name of SECRETS) {
  if (env[name]) continue;
  if (checkOnly) continue;
  text = setValue(text, name, randomBytes(32).toString("hex"));
  generated.push(name);
}

if (!checkOnly && (generated.length || !existsSync(envFile))) {
  writeFileSync(envFile, text, { mode: 0o600 });
}
if (existsSync(envFile)) {
  try {
    chmodSync(envFile, 0o600);
  } catch {
    warnings.push(`Could not set ${rel(envFile)} to mode 0600; make sure only you can read it.`);
  }
}
if (generated.length) console.log(`Generated ${generated.join(", ")} in ${rel(envFile)} (values not shown).`);
env = parse(text);

// ------------------------------------------------------------------ check values
for (const name of REQUIRED) {
  const v = env[name];
  if (!v) problems.push(`${name} is not set.`);
  else if (PLACEHOLDER.test(v)) problems.push(`${name} still has the placeholder from .env.example.`);
}
for (const name of SECRETS) {
  const v = env[name];
  if (v && !HEX64.test(v)) warnings.push(`${name} is not 64 hex characters. It works, but a random 32-byte hex value is recommended.`);
}
const distinct = new Set(SECRETS.map((n) => env[n]).filter(Boolean));
if (distinct.size < SECRETS.filter((n) => env[n]).length) problems.push("Two or more of the app secrets have the same value. Give each its own.");

for (const name of ["APP_PUBLIC_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const v = env[name];
  if (!v || PLACEHOLDER.test(v)) continue;
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) problems.push(`${name} must be an http(s) URL.`);
    if (/\/$/.test(v)) warnings.push(`${name} should not end with a slash.`);
  } catch {
    problems.push(`${name} is not a valid URL.`);
  }
}
if (env.APP_PUBLIC_URL?.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.APP_PUBLIC_URL)) {
  warnings.push("APP_PUBLIC_URL uses http on a non-local host. Serve the app over https in production.");
}
if (env.NEXT_PUBLIC_AUTH_DISABLED) {
  warnings.push("NEXT_PUBLIC_AUTH_DISABLED is no longer read. Use OPENMAN_DEV_BYPASS=1 for the development bypass.");
}
if (/^(1|true|yes|on)$/i.test(env.OPENMAN_DEV_BYPASS ?? "")) {
  warnings.push("OPENMAN_DEV_BYPASS=1: sign-in is skipped under `npm run dev`. A production server with it set refuses to start.");
  for (const name of ["ORGO_API_KEY", "ORGO_COMPUTER_ID", "HERMES_BASE_URL", "HERMES_API_KEY"]) {
    if (!env[name]) warnings.push(`${name} is not set; the local development user needs it (see .env.example).`);
  }
}
if (env.SUPABASE_SERVICE_ROLE_KEY || /service_role|sb_secret_/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "")) {
  problems.push("Do not use the Supabase service-role or secret key. OpenMan needs only the publishable key.");
}
const pairs = [
  ["AGENTMAIL_API_KEY", "AGENTMAIL_WEBHOOK_SECRET", "agent email"],
  ["AGENTPHONE_API_KEY", "AGENTPHONE_WEBHOOK_SECRET", "agent phone"],
  ["AGENTPHONE_API_KEY", "AGENTPHONE_SUB_ACCOUNT_ID", "agent phone"],
];
for (const [a, b, feature] of pairs) if (env[a] && !env[b]) warnings.push(`${a} is set but ${b} is not; ${feature} stays off until both are set.`);

// ------------------------------------------------------------------ SQL for the database gate
if (env.APP_DB_SECRET) {
  const hash = createHash("sha256").update(env.APP_DB_SECRET, "utf8").digest("hex");
  const sql =
    "-- Registers this environment's APP_DB_SECRET with the database (run after the migrations).\n" +
    "insert into private.server_secret (id, sha256_hex)\n" +
    `values (1, '${hash}')\n` +
    "on conflict (id) do update set sha256_hex = excluded.sha256_hex, set_at = now();\n";
  console.log("\nDatabase gate: run this once in the Supabase SQL editor (Dashboard -> SQL Editor) after applying the");
  console.log("migrations in supabase/migrations/, and again whenever APP_DB_SECRET changes. It contains only a hash.\n");
  console.log(sql);
  if (sqlOut) {
    writeFileSync(path.resolve(root, sqlOut), sql, { mode: 0o600 });
    console.log(`Also written to ${sqlOut}.`);
  }
}

// ------------------------------------------------------------------ report
for (const w of warnings) console.log(`warning: ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`missing: ${p}`);
  console.error(`\n${problems.length} required value(s) need attention in ${rel(envFile)}.`);
  process.exit(1);
}
console.log(`\n${rel(envFile)}: required values present. Next: npm run dev, and node scripts/worker.mjs for schedules.`);
