import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

async function globalSetup() {
  const dataDir = path.join(process.cwd(), ".playwright-data");

  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
}

export default globalSetup;