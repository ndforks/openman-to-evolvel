// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Offline checks for the operator log's redaction pass and line builder (no database, no server).
//   node src/lib/observability/redact.test.mjs
import path from "node:path";
import { createJiti } from "jiti";

const root = path.resolve(import.meta.dirname, "../../..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { redact, redactString } = await jiti.import(path.join(root, "src/lib/observability/redact.ts"));

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const hides = (input, secret, label) => ok(!redactString(input).includes(secret), label);

hides("Authorization: Bearer abcdefghijkl1234", "abcdefghijkl1234", "bearer token");
hides("key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAAAA", "anthropic-style key");
hides("orgo_1234567890abcdef in a sentence", "1234567890abcdef", "orgo-style key");
hides("https://x.example/cb?token=abcd1234&ok=1", "abcd1234", "token in a query string");
hides("password=hunter22 set", "hunter22", "password=value");
hides("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N", "dozjgNryP4J3jVmNHl0w5N", "JWT");
hides("ghp_abcdefghijklmnopqrstuvwxyz0123", "abcdefghijklmnopqrstuvwxyz0123", "GitHub token");
hides("hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "9f86d081884c7d659a2feaa0c55ad015", "64-hex secret hash");
hides("mail from jane.doe@example.com", "jane.doe@example.com", "email address");
ok(redactString("Database insert failed: duplicate key (23505)").includes("23505"), "keeps ordinary error text");

const obj = redact({ apiKey: "x1", hermesKeyEnc: "x2", cookie: "x3", password: "x4", authorization: "x5", status: 500, nested: { note: "Bearer abcdefghijklmn", secret_token: "x6" } });
const s = JSON.stringify(obj);
ok(!/x[1-6]"/.test(s), "drops credential-named fields at any depth");
ok(obj.status === 500, "keeps plain fields");
ok(!s.includes("abcdefghijklmn"), "masks strings inside objects");
const cyclic = { a: 1 };
cyclic.self = cyclic;
ok(JSON.stringify(redact(cyclic)).includes("[cycle]"), "survives cycles");

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
