const fs = require("fs");
const http = require("http");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(__dirname, ".generated");
const manifestFile = path.join(outputDir, "dynamic-routes.json");
const nextRoot = path.join(projectRoot, ".next");
const nextServerRoot = path.join(nextRoot, "server");

globalThis.AsyncLocalStorage = globalThis.AsyncLocalStorage || AsyncLocalStorage;
process.env.__NEXT_RELATIVE_DIST_DIR = ".next";
process.chdir(projectRoot);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sanitizeSlug(routePath) {
  return (routePath === "/" ? "index" : routePath)
    .replace(/^\/+/, "")
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, "optional-catchall-$1")
    .replace(/\[\.\.\.([^\]]+)\]/g, "catchall-$1")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "index";
}

function placeholderForParam(name) {
  return `__EDGE_PARAM_${name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}__`;
}

function shellUrlForRoute(routePath) {
  const params = [];
  const parts = routePath.split("/").filter(Boolean);
  const renderedParts = parts.map((part) => {
    let match = part.match(/^\[\[\.\.\.([^\]]+)\]\]$/);
    if (match) {
      const placeholder = placeholderForParam(match[1]);
      params.push({ name: match[1], placeholder, catchAll: true, optional: true });
      return placeholder;
    }

    match = part.match(/^\[\.\.\.([^\]]+)\]$/);
    if (match) {
      const placeholder = placeholderForParam(match[1]);
      params.push({ name: match[1], placeholder, catchAll: true, optional: false });
      return placeholder;
    }

    match = part.match(/^\[([^\]]+)\]$/);
    if (match) {
      const placeholder = placeholderForParam(match[1]);
      params.push({ name: match[1], placeholder, catchAll: false, optional: false });
      return placeholder;
    }

    return part;
  });

  return {
    url: `/${renderedParts.join("/")}`,
    params,
  };
}

function renderWithModule(route, headers = {}) {
  const routeModule = require(path.join(nextServerRoot, route.modulePath));

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      routeModule.handler(req, res, { waitUntil: () => {} }).catch((error) => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end(error && error.stack ? error.stack : String(error));
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}${route.url}`, { headers });
        const body = await response.text();

        if (!response.ok) {
          throw new Error(`Failed to render ${route.url}: ${response.status}\n${body}`);
        }

        resolve(body);
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

async function main() {
  const appPathRoutes = readJson(path.join(nextRoot, "app-path-routes-manifest.json"));
  const appPaths = readJson(path.join(nextServerRoot, "app-paths-manifest.json"));
  const routes = [];

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const [appPath, routePath] of Object.entries(appPathRoutes)) {
    if (!appPath.endsWith("/page") || !routePath.includes("[")) {
      continue;
    }

    const modulePath = appPaths[appPath];
    if (!modulePath || !fs.existsSync(path.join(nextServerRoot, modulePath))) {
      console.warn(`Skipping ${routePath}: ${modulePath || appPath} was not emitted by next build`);
      continue;
    }

    const slug = sanitizeSlug(routePath);
    const shell = shellUrlForRoute(routePath);
    const route = {
      appPath,
      routePath,
      modulePath,
      url: shell.url,
      html: `${slug}.html`,
      rsc: `${slug}.rsc`,
      params: shell.params,
    };

    fs.writeFileSync(path.join(outputDir, route.html), await renderWithModule(route));
    fs.writeFileSync(path.join(outputDir, route.rsc), await renderWithModule(route, { rsc: "1" }));
    routes.push(route);
  }

  fs.writeFileSync(manifestFile, `${JSON.stringify({ routes }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
