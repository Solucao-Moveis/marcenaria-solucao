// Production server for self-hosting (EasyPanel / Docker), running on Bun.
//
// On Cloudflare Workers the PLATFORM serves the static assets (dist/client) and
// only forwards unmatched requests to the SSR worker. When self-hosting that
// layer does not exist, so this server reproduces it:
//   1. Try to serve the requested path as a static file from dist/client.
//   2. Otherwise fall back to the SSR fetch handler (dist/server/index.js).
//
// Run with: bun server.mjs   (listens on $PORT, default 3000, host 0.0.0.0)

import { statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Default export of the built worker is the SSR handler: { fetch(req, env, ctx) }.
// O nome do arquivo de saída varia com a versão do @lovable.dev/vite-tanstack-config
// (server.js nas 2.x, index.js nas 1.x) — tenta os dois pra não quebrar no deploy.
let handler;
try {
  ({ default: handler } = await import("./dist/server/server.js"));
} catch {
  ({ default: handler } = await import("./dist/server/index.js"));
}

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(ROOT, "dist", "client");

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

// Cloudflare Workers execution context shim. The SSR handler may call these;
// when self-hosting there is no platform to defer work to, so they are no-ops.
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

// Map a request pathname to an absolute file path inside CLIENT_DIR, or null.
// Rejects anything that would escape CLIENT_DIR (path traversal protection).
function resolveStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding
  }

  const rel = decoded.replace(/^\/+/, "");
  if (rel === "") return null; // "/" is rendered by SSR, not a static file

  const full = normalize(join(CLIENT_DIR, rel));
  // Must stay within CLIENT_DIR (block ../ traversal, absolute paths, etc).
  if (full !== CLIENT_DIR && !full.startsWith(CLIENT_DIR + sep)) return null;

  try {
    if (statSync(full).isFile()) return full;
  } catch {
    // ENOENT / not a file -> fall through to SSR
  }
  return null;
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 60,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    if (req.method === "GET" || req.method === "HEAD") {
      const file = resolveStaticFile(pathname);
      if (file) {
        const headers = {};
        // /assets/* files are content-hashed by the build -> safe to cache hard.
        if (pathname.startsWith("/assets/")) {
          headers["cache-control"] = "public, max-age=31536000, immutable";
        }
        return new Response(Bun.file(file), { headers });
      }
    }

    // No static match -> server-side rendering.
    return handler.fetch(req, process.env, ctx);
  },
});

console.log(`Server listening on http://${HOST}:${server.port}`);
