const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { AsyncLocalStorage } = require("async_hooks");

const webRoot = "/web";
const port = Number(process.env.PORT || 3000);
const fallbackProjectRoot = path.resolve(__dirname, "..");
const runtimeRoot = fs.existsSync(webRoot) ? "/" : fallbackProjectRoot;
const publicRoot = fs.existsSync(path.join(runtimeRoot, "public"))
  ? path.join(runtimeRoot, "public")
  : path.join(fallbackProjectRoot, "public");
const nextDistDir = fs.existsSync(path.join(runtimeRoot, ".next", "server"))
  ? ".next"
  : fs.existsSync(path.join(runtimeRoot, "web", "server"))
  ? "web"
  : ".next";
const nextRoot = path.join(runtimeRoot, nextDistDir);
const nextServerRoot = path.join(nextRoot, "server");
const nextAppRoot = path.join(nextServerRoot, "app");
const nextStaticRoot = path.join(nextRoot, "static");
const routerProjectRoot = fs.existsSync(path.join(runtimeRoot, "web", "server")) ? runtimeRoot : fallbackProjectRoot;
const generatedRoot = path.join(runtimeRoot, "server", "generated");
const isWasmerRuntime = fallbackProjectRoot === "/";

globalThis.AsyncLocalStorage = globalThis.AsyncLocalStorage || AsyncLocalStorage;
process.env.__NEXT_RELATIVE_DIST_DIR = process.env.__NEXT_RELATIVE_DIST_DIR || nextDistDir;
process.chdir(routerProjectRoot);

const contentTypes = {
  ".avif": "image/avif",
  ".body": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".rsc": "text/x-component; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function safeJoin(root, requestPath) {
  const normalized = path.posix.normalize(`/${requestPath}`).replace(/^\/+/, "");
  const joined = path.posix.join(root, normalized);
  if (joined !== root && !joined.startsWith(`${root}/`)) {
    return null;
  }
  return joined;
}

function routeBase(pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") {
    return "index";
  }
  return clean.slice(1);
}

function send(res, statusCode, body, headers) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendFile(req, res, filePath, statusCode = 200, headers = {}) {
  if (!filePath || !fileExists(filePath)) {
    return false;
  }

  const ext = path.extname(filePath);
  const body = req.method === "HEAD" ? "" : fs.readFileSync(filePath);
  const responseHeaders = {
    "content-type": contentTypes[ext] || "application/octet-stream",
    "content-length": req.method === "HEAD" ? fs.statSync(filePath).size : body.length,
    ...headers,
  };

  send(res, statusCode, body, responseHeaders);
  return true;
}

function sendAppArtifact(req, res, base, ext, statusCode = 200) {
  return sendFile(req, res, path.join(nextAppRoot, `${base}${ext}`), statusCode);
}

function proxyLocalRpc(req, res) {
  send(res, 502, "The /local-rpc rewrite is not available in this WASI static adapter.\n", {
    "content-type": "text/plain; charset=utf-8",
  });
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function compileRoute(routePath) {
  if (routePath === "/") {
    return /^\/?$/;
  }

  const parts = routePath.split("/").filter(Boolean);
  const pattern = parts.map((part) => {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(part)) {
      return "(?:/(.*))?";
    }
    if (/^\[\.\.\.[^\]]+\]$/.test(part)) {
      return "/(.+)";
    }
    if (/^\[[^\]]+\]$/.test(part)) {
      return "/([^/]+)";
    }
    return `/${escapeRegex(part)}`;
  }).join("");

  return new RegExp(`^${pattern}/?$`);
}

function routeSpecificity(routePath) {
  return routePath.split("/").filter(Boolean).reduce((score, part) => {
    if (/^\[\[?\.\.\./.test(part)) return score;
    if (/^\[/.test(part)) return score + 1;
    return score + 2;
  }, 0);
}

function loadSsrRoutes() {
  const appPathRoutes = readJsonIfExists(path.join(nextRoot, "app-path-routes-manifest.json"));
  const appPaths = readJsonIfExists(path.join(nextServerRoot, "app-paths-manifest.json"));
  if (!appPathRoutes || !appPaths) {
    return [];
  }

  return Object.entries(appPathRoutes)
    .filter(([appPath, routePath]) => appPath.endsWith("/page") && typeof routePath === "string")
    .map(([appPath, routePath]) => {
      const modulePath = appPaths[appPath];
      return modulePath ? {
        appPath,
        routePath,
        modulePath: path.join(nextServerRoot, modulePath),
        regex: compileRoute(routePath),
        specificity: routeSpecificity(routePath),
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.specificity - a.specificity || b.routePath.length - a.routePath.length);
}

const ssrRoutes = loadSsrRoutes();

function traceSsrRequest(event) {
  const detail = Object.entries(event)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  console.error(`[edge:ssr] ${detail}`);
}

function matchSsrRoute(pathname) {
  return ssrRoutes.find((route) => route.regex.test(pathname)) || null;
}

function loadGeneratedDynamicRoutes() {
  const manifest = readJsonIfExists(path.join(generatedRoot, "dynamic-routes.json"));
  if (!manifest || !Array.isArray(manifest.routes)) {
    return [];
  }

  return manifest.routes.map((route) => ({
    ...route,
    regex: compileRoute(route.routePath),
    specificity: routeSpecificity(route.routePath),
  })).sort((a, b) => b.specificity - a.specificity || b.routePath.length - a.routePath.length);
}

const generatedDynamicRoutes = loadGeneratedDynamicRoutes();

function matchGeneratedDynamicRoute(pathname) {
  for (const route of generatedDynamicRoutes) {
    const match = route.regex.exec(pathname);
    if (match) {
      return { route, captures: match.slice(1) };
    }
  }
  return null;
}

function safeDynamicValue(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : encodeURIComponent(value);
}

function sendGeneratedDynamicRoute(req, res, matchedRoute, wantsRsc) {
  const { route, captures } = matchedRoute;
  const fileName = wantsRsc ? route.rsc : route.html;
  const filePath = path.join(generatedRoot, fileName);
  if (!fileExists(filePath)) {
    return false;
  }

  let body = req.method === "HEAD" ? "" : fs.readFileSync(filePath, "utf8");
  for (let index = 0; index < route.params.length; index++) {
    const param = route.params[index];
    const captured = captures[index] || "";
    body = body.split(param.placeholder).join(safeDynamicValue(captured));
  }

  send(res, 200, body, {
    "content-type": wantsRsc ? contentTypes[".rsc"] : contentTypes[".html"],
    "content-length": Buffer.byteLength(body),
  });
  return true;
}

async function renderSsrRoute(req, res, route) {
  if (!fileExists(route.modulePath)) {
    send(res, 500, `Next SSR route module is missing for ${route.routePath}.\n`, {
      "content-type": "text/plain; charset=utf-8",
    });
    return true;
  }

  try {
    const routeModule = require(route.modulePath);
    if (!routeModule || typeof routeModule.handler !== "function") {
      send(res, 500, `Next SSR route module has no handler for ${route.routePath}.\n`, {
        "content-type": "text/plain; charset=utf-8",
      });
      return true;
    }

    await routeModule.handler(req, res, { waitUntil: () => {} });
    return true;
  } catch (error) {
    if (!res.headersSent) {
      send(res, 500, error && error.stack ? error.stack : String(error), {
        "content-type": "text/plain; charset=utf-8",
      });
    } else {
      res.end();
    }
    return true;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(url.pathname);
  const isReadMethod = req.method === "GET" || req.method === "HEAD";

  if (pathname === "/local-rpc") {
    return proxyLocalRpc(req, res);
  }

  if (!isReadMethod) {
    if (isWasmerRuntime) {
      return send(res, 405, "Method not allowed\n", {
        "allow": "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
      });
    }

    const ssrRoute = matchSsrRoute(pathname);
    if (ssrRoute) {
      await renderSsrRoute(req, res, ssrRoute);
      return;
    }

    return send(res, 405, "Method not allowed\n", {
      "allow": "GET, HEAD",
      "content-type": "text/plain; charset=utf-8",
    });
  }

  if (pathname.startsWith("/_next/static/")) {
    const filePath = safeJoin(nextStaticRoot, pathname.slice("/_next/static/".length));
    if (sendFile(req, res, filePath, 200, { "cache-control": "public, max-age=31536000, immutable" })) {
      return;
    }
  }

  if (pathname === "/favicon.ico") {
    if (sendFile(req, res, path.join(nextAppRoot, "favicon.ico.body"), 200, {
      "content-type": "image/x-icon",
      "cache-control": "public, max-age=0, must-revalidate",
    })) {
      return;
    }
  }

  const publicPath = safeJoin(publicRoot, pathname);
  if (sendFile(req, res, publicPath)) {
    return;
  }

  if (pathname.endsWith(".rsc")) {
    const base = routeBase(pathname.slice(0, -4));
    if (sendAppArtifact(req, res, base, ".rsc")) {
      return;
    }
  }

  const wantsRsc = req.headers.rsc === "1" || url.searchParams.has("_rsc");
  const staticBase = routeBase(pathname);
  const base = fileExists(path.join(nextAppRoot, `${staticBase}.html`)) ? staticBase : null;

  if (base) {
    if (wantsRsc && sendAppArtifact(req, res, base, ".rsc")) {
      return;
    }
    if (sendAppArtifact(req, res, base, ".html")) {
      return;
    }
  }

  const generatedRoute = isWasmerRuntime ? matchGeneratedDynamicRoute(pathname) : null;
  if (generatedRoute && sendGeneratedDynamicRoute(req, res, generatedRoute, wantsRsc)) {
    traceSsrRequest({
      mode: "generated",
      ssrRendered: false,
      method: req.method,
      path: pathname,
      route: generatedRoute.route.routePath,
      rsc: wantsRsc,
      runtime: isWasmerRuntime ? "wasmer" : "node",
    });
    return;
  }

  const ssrRoute = matchSsrRoute(pathname);
  if (ssrRoute) {
    traceSsrRequest({
      mode: "live",
      ssrRendered: true,
      method: req.method,
      path: pathname,
      route: ssrRoute.routePath,
      rsc: wantsRsc,
      runtime: isWasmerRuntime ? "wasmer" : "node",
    });
    await renderSsrRoute(req, res, ssrRoute);
    return;
  }

  if (sendAppArtifact(req, res, "_not-found", ".html", 404)) {
    return;
  }

  send(res, 404, "Not found\n", {
    "content-type": "text/plain; charset=utf-8",
  });
}

http.createServer(handle).listen(port, "0.0.0.0", () => {
  console.log(`Private Poker Next static app on http://127.0.0.1:${port}`);
});
