const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, ".dist");
const nextRoot = path.join(projectRoot, ".next");

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
  if (!fs.existsSync(root)) {
    return;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, onFile);
    } else if (entry.isFile()) {
      onFile(entryPath);
    }
  }
}

function copyTracedFiles() {
  const tracedFiles = new Set();

  walkFiles(path.join(nextRoot, "server"), (filePath) => {
    if (!filePath.endsWith(".nft.json")) {
      return;
    }

    const trace = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const traceRoot = path.dirname(filePath);
    for (const relativeFile of trace.files || []) {
      const absoluteFile = path.resolve(traceRoot, relativeFile);
      if (fs.existsSync(absoluteFile) && fs.statSync(absoluteFile).isFile()) {
        tracedFiles.add(absoluteFile);
      }
    }
  });

  for (const filePath of tracedFiles) {
    const relativePath = path.relative(projectRoot, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      continue;
    }
    copyFile(filePath, path.join(distRoot, relativePath));
  }
}

function main() {
  assertExists(path.join(nextRoot, "static"));
  assertExists(path.join(nextRoot, "server/app"));
  assertExists(path.join(nextRoot, "server/app-paths-manifest.json"));
  assertExists(path.join(nextRoot, "app-path-routes-manifest.json"));
  assertExists(path.join(projectRoot, "server/router.cjs"));

  fs.rmSync(distRoot, { recursive: true, force: true });

  copyDir(path.join(nextRoot, "static"), path.join(distRoot, ".next/static"));
  copyDir(path.join(nextRoot, "server"), path.join(distRoot, ".next/server"));
  for (const entry of fs.readdirSync(nextRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      copyFile(path.join(nextRoot, entry.name), path.join(distRoot, ".next", entry.name));
    }
  }
  copyTracedFiles();

  copyDir(path.join(projectRoot, "public"), path.join(distRoot, "public"));
  copyDir(path.join(projectRoot, "server/.generated"), path.join(distRoot, "server/generated"));
  copyFile(path.join(projectRoot, "server/router.cjs"), path.join(distRoot, "server/router.cjs"));

  console.log(`Edge runtime payload staged in ${path.relative(projectRoot, distRoot)}`);
}

main();
