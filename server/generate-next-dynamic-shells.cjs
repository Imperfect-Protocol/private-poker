const fs = require("fs");
const http = require("http");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(__dirname, "generated");

globalThis.AsyncLocalStorage = globalThis.AsyncLocalStorage || AsyncLocalStorage;
process.env.__NEXT_RELATIVE_DIST_DIR = ".next";
process.chdir(projectRoot);

const routes = [
  {
    modulePath: ".next/server/app/(site)/lobby/[id]/page.js",
    url: "/lobby/__EDGE_LOBBY_ID__",
    html: "lobby.html",
    rsc: "lobby.rsc",
  },
  {
    modulePath: ".next/server/app/tables/[id]/page.js",
    url: "/tables/__EDGE_TABLE_ID__?lobbyId=__EDGE_LOBBY_ID__",
    html: "table.html",
    rsc: "table.rsc",
  },
];

function renderWithModule(route, headers = {}) {
  const routeModule = require(path.join(projectRoot, route.modulePath));

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
  fs.mkdirSync(outputDir, { recursive: true });

  for (const route of routes) {
    if (!fs.existsSync(path.join(projectRoot, route.modulePath))) {
      console.warn(`Skipping ${route.url}: ${route.modulePath} was not emitted by next build`);
      continue;
    }

    const html = await renderWithModule(route);
    fs.writeFileSync(path.join(outputDir, route.html), html);

    const rsc = await renderWithModule(route, { rsc: "1" });
    fs.writeFileSync(path.join(outputDir, route.rsc), rsc);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
