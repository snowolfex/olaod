import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
    await writeJsonAtomically(filePath, fallback);
  }
}

function getTemporaryStorePath(filePath: string) {
  return `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForRetry(delayMs: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldRetryAtomicRename(error: unknown) {
  return error instanceof Error
    && "code" in error
    && (error.code === "EPERM" || error.code === "EACCES");
}

async function writeJsonAtomically(filePath: string, value: unknown) {
  const nextContent = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryPath = getTemporaryStorePath(filePath);

  await writeFile(temporaryPath, nextContent, "utf8");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (error) {
      if (!shouldRetryAtomicRename(error) || attempt === 4) {
        throw error;
      }

      await waitForRetry(20 * (attempt + 1));
    }
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

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (!raw.trim()) {
      await writeJsonAtomically(filePath, fallback);
      return fallback;
    }

    throw new Error(`Unable to parse JSON store at ${filePath}.`);
  }
}

export async function writeJsonStore(filePath: string, value: unknown, fallback: unknown = []) {
  await withStoreLock(filePath, async () => {
    await ensureJsonStore(filePath, fallback);
    await writeJsonAtomically(filePath, value);
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
    await writeJsonAtomically(filePath, next);
    return next;
  });
}