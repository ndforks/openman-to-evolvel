// Serves a static site: the preview (OM_ROOT = the site folder; injects the click-to-edit inspector) or the published
// copy (OM_PUBLISHED=1, OM_ROOT = .openman/release; logs page views, runs scheduled jobs). Hidden files never served.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createAnalytics, loadEnv, PUBLISHED, serveInspector, serveStatic, startCron } from "./om-runtime.mjs";

const port = Number(process.env.PORT || 4100);
const siteDir = path.resolve(process.env.OM_SITE_DIR || process.cwd());
const root = path.resolve(process.env.OM_ROOT || siteDir);
const log = createAnalytics(siteDir);
loadEnv(siteDir);

http
  .createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    if (serveInspector(req, res)) return;
    const status = serveStatic(root, req, res);
    if (status) return log(req, status);
    const notFound = path.join(root, "404.html");
    res.writeHead(404, { "Content-Type": fs.existsSync(notFound) ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" });
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found");
  })
  .listen(port, "0.0.0.0", () => console.log(`${PUBLISHED ? "published" : "preview"} site on :${port}`));

startCron(siteDir, port);
