/**
 * IG-Dm Standalone Web Application Server
 * Serves static assets, modules, and handles SPA fallback for /app/promo/instagram-dm.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "3001", 10);
const PUBLIC_DIR = path.join(__dirname, "public");
const SRC_DIR = path.join(__dirname, "src");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. Check if requesting /src/ module
  if (pathname.startsWith("/src/")) {
    const srcFilePath = path.join(SRC_DIR, pathname.slice(5));
    if (fs.existsSync(srcFilePath) && fs.statSync(srcFilePath).isFile()) {
      const ext = path.extname(srcFilePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "text/plain",
        "Cache-Control": "no-cache",
      });
      return fs.createReadStream(srcFilePath).pipe(res);
    }
  }

  // 2. Check in PUBLIC_DIR
  let filePath = path.join(PUBLIC_DIR, pathname);

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // 3. SPA Fallback for routes like /app/promo/instagram-dm or /
  const fallbackIndex = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(fallbackIndex)) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    return fs.createReadStream(fallbackIndex).pipe(res);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`[IG-Dm] Server listening at http://localhost:${PORT}`);
  console.log(`[IG-Dm] Serving Instagram DM Promo Studio at http://localhost:${PORT}/app/promo/instagram-dm`);
});

export { server };
