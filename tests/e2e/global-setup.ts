import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

async function globalSetup() {
  const dataDirs = [
    path.join(process.cwd(), ".playwright-data"),
    path.join(process.cwd(), ".next", "standalone", ".playwright-data"),
  ];

  await Promise.all(dataDirs.map(async (dataDir) => {
    await rm(dataDir, { recursive: true, force: true });
    await mkdir(dataDir, { recursive: true });
  }));
}

export default globalSetup;