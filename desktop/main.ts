/**
 * Deno Desktop entry: serve the Vite `dist/` SPA in a native window.
 *
 * Used by `bun run desktop:build`. Dev uses `bun run desktop:dev`, which
 * lets `deno desktop --hmr .` drive Vite's own dev server instead.
 */

const DIST = new URL("../dist/", import.meta.url);

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function mimeFor(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return MIME[pathname.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

function fileUrlFor(pathname: string): URL | null {
  const cleaned = decodeURIComponent(pathname.split("?")[0] ?? pathname).replaceAll("\\", "/");
  const relative = cleaned === "/" ? "./index.html" : `.${cleaned}`;
  const url = new URL(relative, DIST);
  if (!url.href.startsWith(DIST.href)) return null;
  return url;
}

async function readFile(url: URL): Promise<Uint8Array | null> {
  try {
    return await Deno.readFile(url);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.IsADirectory) {
      return null;
    }
    throw error;
  }
}

function respond(method: string, body: Uint8Array, pathname: string, status = 200): Response {
  const headers = {
    "content-type": mimeFor(pathname),
    "cache-control": "no-cache",
    "content-length": String(body.byteLength),
  };
  if (method === "HEAD") return new Response(null, { status, headers });
  return new Response(body as unknown as BodyInit, { status, headers });
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const pathname = new URL(req.url).pathname;
  const target = fileUrlFor(pathname);
  if (!target) return new Response("Forbidden", { status: 403 });

  const bytes = await readFile(target);
  if (bytes) return respond(req.method, bytes, target.pathname);

  const wantsDocument = !pathname.includes(".") || pathname.endsWith(".html") || pathname.endsWith("/");
  if (wantsDocument) {
    const index = await readFile(new URL("./index.html", DIST));
    if (index) return respond(req.method, index, "/index.html");
  }

  return new Response("Not found", { status: 404 });
}

type BrowserWindowCtor = new (options?: {
  title?: string;
  width?: number;
  height?: number;
}) => unknown;

const BrowserWindow = (Deno as typeof Deno & { BrowserWindow?: BrowserWindowCtor })
  .BrowserWindow;

if (typeof BrowserWindow === "function") {
  new BrowserWindow({
    title: "Rotawise",
    width: 1280,
    height: 800,
  });
}

Deno.serve(handler);
