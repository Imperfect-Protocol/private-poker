const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const webRoot = "/web";
const publicRoot = "/public";
const port = Number(process.env.PORT || 3000);

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

function dynamicArtifacts(pathname, searchParams) {
  const lobbyMatch = pathname.match(/^\/lobby\/([^/]+)$/);
  if (lobbyMatch) {
    return {
      html: "/server/generated/lobby.html",
      rsc: "/server/generated/lobby.rsc",
      replacements: {
        "__EDGE_LOBBY_ID__": safeDynamicValue(lobbyMatch[1]),
      },
    };
  }

  const tableMatch = pathname.match(/^\/tables\/([^/]+)$/);
  if (tableMatch) {
    return {
      html: "/server/generated/table.html",
      rsc: "/server/generated/table.rsc",
      replacements: {
        "__EDGE_TABLE_ID__": safeDynamicValue(tableMatch[1]),
        "__EDGE_LOBBY_ID__": safeDynamicValue(searchParams.get("lobbyId") || "1"),
      },
    };
  }

  return null;
}

function safeDynamicValue(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : encodeURIComponent(value);
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
  return sendFile(req, res, path.posix.join(webRoot, "server/app", `${base}${ext}`), statusCode);
}

function proxyLocalRpc(req, res) {
  send(res, 502, "The /local-rpc rewrite is not available in this WASI static adapter.\n", {
    "content-type": "text/plain; charset=utf-8",
  });
}

function sendGeneratedDynamicRoute(req, res, artifacts, wantsRsc) {
  const filePath = wantsRsc ? artifacts.rsc : artifacts.html;
  if (!fileExists(filePath)) {
    send(res, 500, "Next dynamic route shell is missing. Run `npm run edge:build`.\n", {
      "content-type": "text/plain; charset=utf-8",
    });
    return true;
  }

  let body = req.method === "HEAD" ? "" : fs.readFileSync(filePath, "utf8");
  for (const [placeholder, value] of Object.entries(artifacts.replacements)) {
    body = body.split(placeholder).join(value);
  }

  send(res, 200, body, {
    "content-type": wantsRsc ? contentTypes[".rsc"] : contentTypes[".html"],
    "content-length": Buffer.byteLength(body),
  });
  return true;
}

function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed\n", {
      "allow": "GET, HEAD",
      "content-type": "text/plain; charset=utf-8",
    });
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/local-rpc") {
    return proxyLocalRpc(req, res);
  }

  if (pathname.startsWith("/_next/static/")) {
    const filePath = safeJoin(path.posix.join(webRoot, "static"), pathname.slice("/_next/static/".length));
    if (sendFile(req, res, filePath, 200, { "cache-control": "public, max-age=31536000, immutable" })) {
      return;
    }
  }

  if (pathname === "/favicon.ico") {
    if (sendFile(req, res, path.posix.join(webRoot, "server/app/favicon.ico.body"), 200, {
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
  const base = fileExists(path.posix.join(webRoot, "server/app", `${staticBase}.html`)) ? staticBase : null;

  if (base) {
    if (wantsRsc && sendAppArtifact(req, res, base, ".rsc")) {
      return;
    }
    if (sendAppArtifact(req, res, base, ".html")) {
      return;
    }
  }

  const dynamicArtifactsForPath = dynamicArtifacts(pathname, url.searchParams);
  if (dynamicArtifactsForPath) {
    sendGeneratedDynamicRoute(req, res, dynamicArtifactsForPath, wantsRsc);
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
