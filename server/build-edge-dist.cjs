const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, ".dist");
const nextRoot = path.join(projectRoot, ".next");
const nextAppRoot = path.join(nextRoot, "server/app");
const requiredGenerated = [
  "lobby.html",
  "lobby.rsc",
  "table.html",
  "table.rsc",
];

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${path.relative(projectRoot, filePath)} does not exist`);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

function walkFiles(root, onFile) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, onFile);
    } else if (entry.isFile()) {
      onFile(entryPath);
    }
  }
}

function copyNextAppArtifacts() {
  const keepExtensions = new Set([".body", ".html", ".rsc"]);
  const destRoot = path.join(distRoot, "web/server/app");

  walkFiles(nextAppRoot, (filePath) => {
    const relativePath = path.relative(nextAppRoot, filePath);
    const pathParts = relativePath.split(path.sep);

    if (pathParts.some((part) => part.endsWith(".segments")) || !keepExtensions.has(path.extname(filePath))) {
      return;
    }

    copyFile(filePath, path.join(destRoot, relativePath));
  });
}

function main() {
  assertExists(path.join(nextRoot, "static"));
  assertExists(nextAppRoot);
  assertExists(path.join(projectRoot, "server/router.cjs"));

  for (const artifact of requiredGenerated) {
    assertExists(path.join(projectRoot, "server/generated", artifact));
  }

  fs.rmSync(distRoot, { recursive: true, force: true });

  copyDir(path.join(nextRoot, "static"), path.join(distRoot, "web/static"));
  copyNextAppArtifacts();
  copyDir(path.join(projectRoot, "public"), path.join(distRoot, "public"));
  copyFile(path.join(projectRoot, "server/router.cjs"), path.join(distRoot, "server/router.cjs"));
  copyDir(path.join(projectRoot, "server/generated"), path.join(distRoot, "server/generated"));

  console.log(`Edge runtime payload staged in ${path.relative(projectRoot, distRoot)}`);
}

main();
