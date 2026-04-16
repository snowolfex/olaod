import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  getOllamaBaseUrl,
  type OllamaCatalogModel,
  type OllamaCliStatus,
  type OllamaModel,
  type OllamaRuntime,
  type OllamaServerStatus,
  type OllamaStatus,
} from "@/lib/ollama";

const execFileAsync = promisify(execFile);
const OLLAMA_LIBRARY_URL = "https://ollama.com/library";
const OLLAMA_LIBRARY_CACHE_TTL_MS = 1000 * 60 * 10;
const PLAYWRIGHT_FALLBACK_MODEL: OllamaModel = {
  name: "playwright:reply",
  size: 0,
};

let libraryCache: {
  fetchedAt: number;
  entries: Array<{ slug: string; name: string; description: string }>;
} | null = null;

function isPlaywrightTestMode() {
  return process.env.PLAYWRIGHT_TEST === "1";
}

function getPlaywrightFallbackModels(models: OllamaModel[]) {
  if (!isPlaywrightTestMode() || models.length > 0) {
    return models;
  }

  return [PLAYWRIGHT_FALLBACK_MODEL];
}

function getExecutableNames() {
  if (process.platform === "win32") {
    return ["ollama.exe", "ollama.cmd", "ollama.bat", "ollama"];
  }

  return ["ollama"];
}

function getCandidateExecutablePaths() {
  const candidates = new Set<string>();

  if (process.env.OLLAMA_CLI_PATH) {
    candidates.add(process.env.OLLAMA_CLI_PATH);
  }

  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      candidates.add(`${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe`);
    }
  } else if (process.platform === "darwin") {
    candidates.add("/Applications/Ollama.app/Contents/Resources/ollama");
    candidates.add("/usr/local/bin/ollama");
    candidates.add("/opt/homebrew/bin/ollama");
  } else {
    candidates.add("/usr/local/bin/ollama");
    candidates.add("/usr/bin/ollama");
    candidates.add("/snap/bin/ollama");
  }

  for (const executableName of getExecutableNames()) {
    candidates.add(executableName);
  }

  return [...candidates];
}

function parseCliVersion(output: string) {
  const trimmed = output.trim();

  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/version(?:\s+is)?\s+([^\s]+)/i);
  return match?.[1] ?? trimmed.split(/\s+/).at(-1);
}

async function probeOllamaExecutable(candidate: string) {
  try {
    const { stdout, stderr } = await execFileAsync(candidate, ["--version"], {
      timeout: 5000,
      windowsHide: true,
    });

    return {
      executablePath: candidate,
      version: parseCliVersion(`${stdout}${stderr}`),
    };
  } catch {
    return null;
  }
}

export async function getOllamaCliStatus(): Promise<OllamaCliStatus> {
  for (const candidate of getCandidateExecutablePaths()) {
    const resolved = await probeOllamaExecutable(candidate);

    if (resolved) {
      return {
        isInstalled: true,
        executablePath: resolved.executablePath,
        version: resolved.version,
      };
    }
  }

  return {
    isInstalled: false,
    executablePath: null,
    error: "Ollama CLI was not found on this machine.",
  };
}

export async function getOllamaProcessStatus(): Promise<OllamaServerStatus> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", "IMAGENAME eq ollama.exe", "/FO", "CSV", "/NH"],
        { timeout: 5000, windowsHide: true },
      );

      const firstLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("INFO:"));

      if (!firstLine) {
        return {
          isProcessRunning: false,
          canReachApi: false,
          pid: null,
        };
      }

      const columns = firstLine.replace(/^"|"$/g, "").split('","');
      const pid = Number(columns[1]);

      return {
        isProcessRunning: true,
        canReachApi: false,
        pid: Number.isFinite(pid) ? pid : null,
      };
    } catch {
      return {
        isProcessRunning: false,
        canReachApi: false,
        pid: null,
      };
    }
  }

  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", "ollama"], {
      timeout: 5000,
      windowsHide: true,
    });
    const pid = Number(stdout.split(/\r?\n/).find(Boolean)?.trim());

    return {
      isProcessRunning: true,
      canReachApi: false,
      pid: Number.isFinite(pid) ? pid : null,
    };
  } catch {
    return {
      isProcessRunning: false,
      canReachApi: false,
      pid: null,
    };
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

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function getCachedLibraryEntries() {
  if (libraryCache && Date.now() - libraryCache.fetchedAt < OLLAMA_LIBRARY_CACHE_TTL_MS) {
    return libraryCache.entries;
  }

  const response = await fetch(OLLAMA_LIBRARY_URL, {
    cache: "no-store",
    headers: {
      "User-Agent": "oload/0.1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load the Ollama library (${response.status}).`);
  }

  const html = await response.text();
  const anchorPattern = /<a[^>]+href="\/library\/([^"?#/]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const entries = new Map<string, { slug: string; name: string; description: string }>();

  for (const match of html.matchAll(anchorPattern)) {
    const slug = decodeURIComponent(match[1]).trim();

    if (!slug) {
      continue;
    }

    const innerText = stripHtml(match[2] ?? "");
    const description = innerText
      .replace(new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
      .replace(/\bPulls\b[\s\S]*$/i, "")
      .trim();

    if (!entries.has(slug)) {
      entries.set(slug, {
        slug,
        name: slug,
        description,
      });
      continue;
    }

    if (description && !entries.get(slug)?.description) {
      entries.set(slug, {
        slug,
        name: slug,
        description,
      });
    }
  }

  libraryCache = {
    fetchedAt: Date.now(),
    entries: [...entries.values()],
  };

  return libraryCache.entries;
}

function getModelFamilyName(name: string) {
  return name.split(":")[0]?.trim().toLowerCase() ?? "";
}

export async function getOllamaLibraryCatalog(status?: OllamaStatus): Promise<OllamaCatalogModel[]> {
  const [entries, resolvedStatus] = await Promise.all([
    getCachedLibraryEntries(),
    status ? Promise.resolve(status) : getOllamaStatus(),
  ]);

  const installedFamilies = new Map<string, string[]>();
  const runningFamilies = new Map<string, string[]>();

  for (const model of resolvedStatus.models) {
    const family = getModelFamilyName(model.name);
    installedFamilies.set(family, [...(installedFamilies.get(family) ?? []), model.name]);
  }

  for (const model of resolvedStatus.running) {
    const family = getModelFamilyName(model.name);
    runningFamilies.set(family, [...(runningFamilies.get(family) ?? []), model.name]);
  }

  return entries
    .map((entry) => {
      const family = entry.slug.toLowerCase();
      const installedModelNames = installedFamilies.get(family) ?? [];
      const runningModelNames = runningFamilies.get(family) ?? [];

      return {
        slug: entry.slug,
        name: entry.name,
        description: entry.description || "Available in the Ollama library.",
        installed: installedModelNames.length > 0,
        installedModelNames,
        running: runningModelNames.length > 0,
        runningModelNames,
      };
    })
    .sort((left, right) => {
      if (left.running !== right.running) {
        return left.running ? -1 : 1;
      }

      if (left.installed !== right.installed) {
        return left.installed ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const baseUrl = getOllamaBaseUrl();
  const [cli, processStatus, tagsResult, runningResult, versionResult] = await Promise.all([
    getOllamaCliStatus(),
    getOllamaProcessStatus(),
    fetchFromOllama<{ models?: OllamaModel[] }>("/api/tags").then((value) => ({ status: "fulfilled" as const, value })).catch((reason: unknown) => ({ status: "rejected" as const, reason })),
    fetchFromOllama<{ models?: OllamaRuntime[] }>("/api/ps").then((value) => ({ status: "fulfilled" as const, value })).catch((reason: unknown) => ({ status: "rejected" as const, reason })),
    fetchFromOllama<{ version?: string }>("/api/version").then((value) => ({ status: "fulfilled" as const, value })).catch((reason: unknown) => ({ status: "rejected" as const, reason })),
  ]);

  const models = tagsResult.status === "fulfilled" ? tagsResult.value.models ?? [] : [];
  const running = runningResult.status === "fulfilled" ? runningResult.value.models ?? [] : [];
  const resolvedModels = getPlaywrightFallbackModels(models);
  const version = versionResult.status === "fulfilled" ? versionResult.value.version ?? cli.version : cli.version;
  const isReachable = tagsResult.status === "fulfilled"
    || runningResult.status === "fulfilled"
    || versionResult.status === "fulfilled";
  const error = !isReachable
    ? tagsResult.status === "rejected" && tagsResult.reason instanceof Error
      ? tagsResult.reason.message
      : "Unable to reach the Ollama API."
    : undefined;

  return {
    isReachable,
    baseUrl,
    fetchedAt: new Date().toISOString(),
    modelCount: resolvedModels.length,
    runningCount: running.length,
    models: resolvedModels,
    running,
    cli,
    server: {
      isProcessRunning: processStatus.isProcessRunning,
      canReachApi: isReachable,
      pid: processStatus.pid,
    },
    version,
    error,
  };
}