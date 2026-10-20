// Serves a copy of site/ on 127.0.0.1 with the same security headers the CloudFront Function
// SpeakReviewSecurityHeaders adds in production, so CSP problems show up in the tests.
//   node lib/server.mjs                 serves site/ on 8765
//   ROOT=<folder> PORT=8766 node lib/server.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { SITE } from "./paths.mjs";

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; media-src 'self' blob:; connect-src 'self' https://jhfndh1s03.execute-api.us-east-1.amazonaws.com https://public-speaking-coach-jayvee.s3.amazonaws.com https://public-speaking-coach-jayvee.s3.us-east-1.amazonaws.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
export const PP = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".ico": "image/x-icon" };

// Resolves with the server once it listens
export function startServer({ root = SITE, port = 8765, csp = true } = {}) {
  const base = normalize(root);
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(base, path));
    const headers = csp ? { "Content-Security-Policy": CSP, "Permissions-Policy": PP } : {};
    // Only files inside the served folder
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(404, headers);
      res.end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, headers);
      res.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8765);
  await startServer({ root: process.env.ROOT || SITE, port, csp: !process.argv.includes("--no-csp") });
  console.log(`serving on http://127.0.0.1:${port}/`);
}
