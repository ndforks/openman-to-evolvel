// Tests the shared safe fetch (src/lib/net/safe-fetch.ts) and that every server-side fetch of a user URL uses it.
//   node scripts/safe-fetch-test.mjs
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const sf = await jiti.import(path.join(root, "src/lib/net/safe-fetch.ts"));

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const refuses = async (fn) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e?.code === "unsafe_url";
  }
};

// 1. Address classification
const blocked = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
  "::1", "::", "fd00::1", "fc00::1", "fe80::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2001::1", "2002:7f00:1::1", "2001:db8::1", "fd00:ec2::254", "::127.0.0.1"];
const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"];
for (const ip of blocked) ok(!sf.isPublicAddress(ip), `refuses ${ip}`);
for (const ip of allowed) ok(sf.isPublicAddress(ip), `allows ${ip}`);

// 2. URL checks (fake DNS)
const dns = (map) => async (h) => (map[h] ?? []).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
ok(await refuses(() => sf.checkUrl("http://internal.example/", { resolver: dns({ "internal.example": ["10.0.0.5"] }) })), "name resolving to 10.x refused");
ok(await refuses(() => sf.checkUrl("http://mixed.example/", { resolver: dns({ "mixed.example": ["1.1.1.1", "127.0.0.1"] }) })), "name with one private answer refused");
ok(await refuses(() => sf.checkUrl("http://127.0.0.1.nip.io/", { resolver: dns({ "127.0.0.1.nip.io": ["127.0.0.1"] }) })), "nip.io to loopback refused");
ok(await refuses(() => sf.checkUrl("http://[::ffff:7f00:1]/")), "IPv4-mapped IPv6 literal refused");
ok(await refuses(() => sf.checkUrl("http://[fd00::1]/")), "ULA literal refused");
ok(await refuses(() => sf.checkUrl("http://2130706433/")), "decimal IPv4 loopback refused");
ok(await refuses(() => sf.checkUrl("http://0x7f.1/")), "hex IPv4 loopback refused");
ok(await refuses(() => sf.checkUrl("http://localhost:3001/")), "localhost refused");
ok(await refuses(() => sf.checkUrl("file:///etc/passwd")), "file: refused");
ok(await refuses(() => sf.checkUrl("gopher://example.com/")), "gopher: refused");
ok(await refuses(() => sf.checkUrl("https://user:pw@example.com/")), "credentials in URL refused");
ok(!(await refuses(() => sf.checkUrl("https://public.example/", { resolver: dns({ "public.example": ["93.184.216.34"] }) }))), "public name allowed");

// 3. Fetch behaviour against a local server (private addresses only reachable with allowPrivate, which tests use)
process.env.NODE_ENV = "development";
const server = http.createServer((req, res) => {
  if (req.url === "/redirect-metadata") { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
  if (req.url === "/redirect-local") { res.writeHead(307, { Location: "/echo" }); return res.end(); }
  if (req.url === "/redirect-loop") { res.writeHead(302, { Location: "/redirect-loop" }); return res.end(); }
  if (req.url === "/big") { res.writeHead(200); return res.end(Buffer.alloc(200_000)); }
  if (req.url === "/slow") { setTimeout(() => res.end("late"), 3000); return; }
  if (req.url === "/echo") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res.end(JSON.stringify({ method: req.method, host: req.headers.host, auth: req.headers.authorization ?? null, body: b }))); return; }
  res.end("hello");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  ok(await refuses(() => sf.safeFetch(`${base}/`)), "loopback refused without allowPrivate");
  ok(await refuses(() => sf.safeFetch(`${base}/redirect-metadata`, { allowPrivate: false })), "first hop to loopback refused");
  // A name the (fake) DNS maps to the local server: the socket must go to that address, Host stays the name.
  const pub = dns({ "receiver.example": ["127.0.0.1"] });
  const r1 = await sf.safeFetch(`http://receiver.example:${server.address().port}/echo`, { allowPrivate: true, resolver: pub, method: "POST", body: "x", headers: { Authorization: "Bearer t" } });
  ok(r1.status === 200 && (await r1.json()).host === `receiver.example:${server.address().port}`, "connects to the resolved (pinned) address with the original Host header");
  const r2 = await sf.safeFetch(`${base}/redirect-local`, { allowPrivate: true, method: "POST", body: "abc", headers: { Authorization: "Bearer t" } });
  const j2 = await r2.json();
  ok(j2.method === "POST" && j2.body === "abc" && j2.auth === "Bearer t", "307 same-origin keeps method, body and auth");
  ok(await sf.safeFetch(`${base}/redirect-loop`, { allowPrivate: true }).then(() => false, (e) => e.code === "too_many_redirects"), "redirect loop stops");
  ok(await sf.safeFetch(`${base}/big`, { allowPrivate: true, maxBytes: 100_000 }).then(() => false, (e) => e.code === "too_large"), "response size limit");
  ok(await sf.safeFetch(`${base}/slow`, { allowPrivate: true, timeoutMs: 500 }).then(() => false, (e) => e.code === "timeout"), "time limit");
  const r3 = await sf.safeFetch(`${base}/redirect-metadata`, { allowPrivate: true, maxRedirects: 0 });
  ok(r3.status === 302, "maxRedirects 0 returns the redirect");
  process.env.NODE_ENV = "production";
  ok(await refuses(() => sf.safeFetch(`${base}/`, { allowPrivate: true })), "allowPrivate is ignored in production");
  process.env.NODE_ENV = "development";
} finally {
  server.close();
}

// 4. A redirect from an allowed first hop to the metadata address is re-checked and refused.
{
  const s2 = http.createServer((req, res) => { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }); res.end(); });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  process.env.NODE_ENV = "production"; // allowPrivate off for every hop: use a resolver that maps a public-looking name
  const pubToLocal = async () => [{ address: "93.184.216.34", family: 4 }];
  ok(await sf.checkUrl("http://hop.example/", { resolver: pubToLocal }).then(() => true, () => false), "public first hop passes the check");
  ok(await refuses(() => sf.checkUrl("http://169.254.169.254/latest/meta-data/")), "metadata redirect target refused");
  process.env.NODE_ENV = "development";
  s2.close();
}

// 5. Every server-side fetch of a user-supplied URL goes through safeFetch.
const mustUse = ["src/lib/connectors/server.ts", "src/lib/automations/rss.ts", "src/lib/public-api/webhooks.ts", "src/lib/mail/agentmail.ts"];
for (const f of mustUse) {
  const src = readFileSync(path.join(root, f), "utf8");
  ok(/safeFetch\(/.test(src), `${f} uses safeFetch`);
}
ok(!/redirect:\s*"follow"/.test(readFileSync(path.join(root, "src/lib/connectors/server.ts"), "utf8")), "connector test no longer follows redirects blindly");
const conn = await jiti.import(path.join(root, "src/lib/connectors/server.ts"));
ok(await conn.testMcpUrl("http://[::ffff:7f00:1]:3001/").then(() => false, (e) => /public internet|reachable/i.test(e.message)), "custom MCP test refuses [::ffff:7f00:1]");
ok(await conn.testMcpUrl("http://100.64.0.1/").then(() => false, (e) => /public internet|reachable/i.test(e.message)), "custom MCP test refuses 100.64/10");
const rss = await jiti.import(path.join(root, "src/lib/automations/rss.ts"));
ok(await rss.fetchFeed("http://172.20.0.1/feed").then(() => false, () => true), "RSS refuses 172.16/12");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
