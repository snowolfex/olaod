import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const storeLocks = new Map<string, Promise<void>>();

function getDataDirectory() {
  if (process.env.PLAYWRIGHT_TEST === "1") {
    return path.join(process.cwd(), ".playwright-data");
  }

  return path.join(process.cwd(), "data");
}

export function getDataStorePath(fileName: string) {
  return path.join(getDataDirectory(), fileName);
}

async function ensureJsonStore(filePath: string, fallback: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}

async function waitForStoreIdle(filePath: string) {
  await storeLocks.get(filePath)?.catch(() => undefined);
}

async function withStoreLock<T>(filePath: string, operation: () => Promise<T>) {
  const previous = storeLocks.get(filePath) ?? Promise.resolve();
  let releaseLock: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  storeLocks.set(filePath, previous.catch(() => undefined).then(() => current));

  try {
    await previous.catch(() => undefined);
    return await operation();
  } finally {
    releaseLock();

    if (storeLocks.get(filePath) === current) {
      storeLocks.delete(filePath);
    }
  }
}

export async function readJsonStore<T>(filePath: string, fallback: T) {
  await ensureJsonStore(filePath, fallback);
  await waitForStoreIdle(filePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonStore(filePath: string, value: unknown, fallback: unknown = []) {
  await withStoreLock(filePath, async () => {
    await ensureJsonStore(filePath, fallback);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  });
}

export async function updateJsonStore<T>(
  filePath: string,
  fallback: T,
  updater: (value: T) => T | Promise<T>,
) {
  return withStoreLock(filePath, async () => {
    await ensureJsonStore(filePath, fallback);
    const raw = await readFile(filePath, "utf8");
    const current = JSON.parse(raw) as T;
    const next = await updater(current);
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  });
}