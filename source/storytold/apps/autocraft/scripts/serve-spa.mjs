// Static server with single-page-app fallback, for the mock UI build.
// Usage: node scripts/serve-spa.mjs <dir> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 8980);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
http
  .createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, "index.html");
    res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
    res.end(fs.readFileSync(file));
  })
  .listen(port, "127.0.0.1", () => console.log(`serving ${dir} on ${port}`));
