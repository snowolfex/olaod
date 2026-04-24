import "server-only";

import { execFile, spawn } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { promisify } from "node:util";

import {
  getOllamaBaseUrl,
  type OllamaStatus,
} from "@/lib/ollama";
import { getOllamaCliStatus, getOllamaProcessStatus, getOllamaStatus } from "@/lib/ollama-status";

const execFileAsync = promisify(execFile);
const DEFAULT_OLLAMA_HOST = "127.0.0.1:11434";
const GIB = 1024 ** 3;
let serverStartPromise: Promise<OllamaStatus> | null = null;

function getCliHost() {
  try {
    return new URL(getOllamaBaseUrl()).host || DEFAULT_OLLAMA_HOST;
  } catch {
    return DEFAULT_OLLAMA_HOST;
  }
}

function normalizeModelName(value: string) {
  return value.trim().toLowerCase();
}

function formatMemory(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 GB";
  }

  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1)} GB`;
  }

  return `${Math.max(1, Math.round(bytes / (1024 ** 2)))} MB`;
}

function resolveInstalledModelEstimate(status: OllamaStatus, modelName: string) {
  const normalizedModelName = normalizeModelName(modelName);
  const installedMatch = status.models.find((model) => normalizeModelName(model.name) === normalizedModelName);

  return installedMatch?.size ?? 0;
}

function resolveRuntimeEstimate(status: OllamaStatus, runtime: OllamaStatus["running"][number]) {
  if (typeof runtime.size_vram === "number" && runtime.size_vram > 0) {
    return runtime.size_vram;
  }

  return resolveInstalledModelEstimate(status, runtime.model || runtime.name);
}

async function ensureModelCanStart(name: string) {
  const status = await getOllamaStatus();
  const normalizedModelName = normalizeModelName(name);
  const targetEstimate = resolveInstalledModelEstimate(status, name);

  if (!status.isReachable || targetEstimate <= 0) {
    return;
  }

  const alreadyRunning = status.running.some((runtime) => {
    return [runtime.model, runtime.name]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeModelName(value) === normalizedModelName);
  });

  if (alreadyRunning) {
    return;
  }

  const requiredBytes = Math.ceil(targetEstimate * 1.1);
  const freeBytes = freemem();

  if (freeBytes >= requiredBytes) {
    return;
  }

  const stoppableRuntimes = status.running
    .map((runtime) => ({
      name: runtime.model || runtime.name,
      estimatedBytes: resolveRuntimeEstimate(status, runtime),
    }))
    .filter((runtime) => runtime.name && normalizeModelName(runtime.name) !== normalizedModelName && runtime.estimatedBytes > 0)
    .sort((left, right) => right.estimatedBytes - left.estimatedBytes);
  const reclaimableBytes = stoppableRuntimes.reduce((sum, runtime) => sum + runtime.estimatedBytes, 0);

  if (freeBytes + reclaimableBytes < requiredBytes) {
    const totalBytes = totalmem();
    const baseMessage = `Can't run ${name} because about ${formatMemory(requiredBytes)} is needed and only ${formatMemory(freeBytes)} is currently free.`;

    if (reclaimableBytes > 0) {
      throw new Error(`${baseMessage} Stopping every other running model would only free about ${formatMemory(reclaimableBytes)}, which still leaves this machine short${totalBytes > 0 ? ` on a ${formatMemory(totalBytes)} system` : ""}.`);
    }

    throw new Error(`${baseMessage} This machine does not have enough available memory for that model right now.`);
  }

  let releasedBytes = 0;
  const suggestedStops: string[] = [];

  for (const runtime of stoppableRuntimes) {
    suggestedStops.push(`${runtime.name} (${formatMemory(runtime.estimatedBytes)})`);
    releasedBytes += runtime.estimatedBytes;

    if (freeBytes + releasedBytes >= requiredBytes) {
      break;
    }
  }

  throw new Error(
    `Can't run ${name} because about ${formatMemory(requiredBytes)} is needed and only ${formatMemory(freeBytes)} is currently free. Stop ${suggestedStops.join(", ")} and try again.`,
  );
}


async function runOllamaCli(args: string[], timeout = 15000) {
  const cliStatus = await getOllamaCliStatus();

  if (!cliStatus.isInstalled || !cliStatus.executablePath) {
    throw new Error(cliStatus.error ?? "Ollama CLI is not installed.");
  }

  try {
    const { stdout, stderr } = await execFileAsync(cliStatus.executablePath, args, {
      timeout,
      windowsHide: true,
      env: {
        ...process.env,
        OLLAMA_HOST: getCliHost(),
      },
    });

    return {
      stdout,
      stderr,
    };
  } catch (error) {
    const details = error as Error & { stdout?: string; stderr?: string };
    const message = [details.stderr?.trim(), details.stdout?.trim(), details.message]
      .filter(Boolean)
      .join(" ")
      .trim();

    throw new Error(message || `Ollama CLI command failed: ${args.join(" ")}`);
  }
}

async function fetchFromOllama<T>(path: string, timeoutMs = 3000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getOllamaBaseUrl()}${path}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForOllamaApi(timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetchFromOllama<{ version?: string }>("/api/version", 2000);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error("Ollama did not become reachable in time.");
}

async function waitForRuntimeState(name: string, shouldBeRunning: boolean, timeoutMs = 8000) {
  const normalizedName = name.trim().toLowerCase();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getOllamaStatus();
    const isRunning = status.running.some((runtime) => {
      const runtimeNames = [runtime.name, runtime.model]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase());

      return runtimeNames.includes(normalizedName);
    });

    if (isRunning === shouldBeRunning) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return getOllamaStatus();
}

export async function ensureOllamaServerRunning() {
  const currentStatus = await getOllamaStatus();

  if (currentStatus.isReachable) {
    return currentStatus;
  }

  if (serverStartPromise) {
    return serverStartPromise;
  }

  serverStartPromise = (async () => {
    const cliStatus = await getOllamaCliStatus();

    if (!cliStatus.isInstalled || !cliStatus.executablePath) {
      throw new Error(cliStatus.error ?? "Ollama CLI is not installed.");
    }

    const processStatus = await getOllamaProcessStatus();

    if (!processStatus.isProcessRunning) {
      const child = spawn(cliStatus.executablePath, ["serve"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...process.env,
          OLLAMA_HOST: getCliHost(),
        },
      });

      child.unref();
    }

    await waitForOllamaApi();
    return getOllamaStatus();
  })().finally(() => {
    serverStartPromise = null;
  });

  return serverStartPromise;
}

async function requestOllamaModelLoad(name: string) {
  const response = await fetch(`${getOllamaBaseUrl()}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model: name,
      prompt: "",
      stream: false,
      keep_alive: "30m",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.trim() || `Unable to start model ${name}.`);
  }
}

export async function startOllamaModel(name: string) {
  const modelName = name.trim();

  if (!modelName) {
    throw new Error("Model name is required.");
  }

  await ensureOllamaServerRunning();
  await ensureModelCanStart(modelName);

  try {
    await requestOllamaModelLoad(modelName);
  } catch {
    await runOllamaCli(["run", "--keepalive", "30m", modelName, ""], 30000);
  }

  return waitForRuntimeState(modelName, true);
}

export async function stopOllamaModel(name: string) {
  const modelName = name.trim();

  if (!modelName) {
    throw new Error("Model name is required.");
  }

  await runOllamaCli(["stop", modelName], 15000);
  return waitForRuntimeState(modelName, false);
}