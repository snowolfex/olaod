import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");
const staticSource = path.join(projectRoot, ".next", "static");
const staticTarget = path.join(standaloneNextRoot, "static");
const publicSource = path.join(projectRoot, "public");
const publicTarget = path.join(standaloneRoot, "public");

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(sourcePath, targetPath) {
  if (!await pathExists(sourcePath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { force: true, recursive: true });
}

await copyIfPresent(staticSource, staticTarget);
await copyIfPresent(publicSource, publicTarget);

await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
