// Runs a bash command on the dev computer (ORGO_COMPUTER_ID) with the dev Orgo key. Prints the output only.
//   node scripts/devbash.mjs '<command>'
import path from "node:path";
import { createJiti } from "jiti";
import { loadEnv } from "./env.mjs";

loadEnv();
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { OrgoClient } = await jiti.import(path.join(root, "src/lib/orgo/user-client.ts"));
const orgo = new OrgoClient({ apiKey: process.env.ORGO_API_KEY, workspaceId: process.env.ORGO_WORKSPACE_ID || null });
const out = await orgo.bash(process.env.ORGO_COMPUTER_ID, `export HOME=/root\n${process.argv[2]}`, Number(process.argv[3] ?? 120));
process.stdout.write(out.output ?? "");
if (out.error) process.stdout.write(`\n[error] ${String(out.error).slice(0, 500)}\n`);
