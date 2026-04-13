export type OllamaModel = {
  name: string;
  size: number;
  modified_at?: string;
};

export type OllamaRuntime = {
  name: string;
  model: string;
  digest?: string;
  size_vram?: number;
};

export type OllamaChatRole = "system" | "user" | "assistant";

export type OllamaChatMessage = {
  role: OllamaChatRole;
  content: string;
};

export type OllamaChatRequest = {
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  systemPrompt?: string;
};

export type OllamaChatStreamChunk = {
  error?: string;
  done?: boolean;
  message?: {
    role?: OllamaChatRole;
    content?: string;
  };
  response?: string;
};

export type OllamaPullStreamChunk = {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
};

export type OllamaStatus = {
  isReachable: boolean;
  baseUrl: string;
  fetchedAt: string;
  modelCount: number;
  runningCount: number;
  models: OllamaModel[];
  running: OllamaRuntime[];
  version?: string;
  error?: string;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const PLAYWRIGHT_FALLBACK_MODEL: OllamaModel = {
  name: "playwright:reply",
  size: 0,
};

function getPlaywrightDeleteResponse(name: string) {
  if (!isPlaywrightTestMode() || !name.startsWith("playwright:")) {
    return null;
  }

  if (name.startsWith("playwright:delete-success")) {
    return new Response(JSON.stringify({ status: "success" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  if (name.startsWith("playwright:delete-fail")) {
    return new Response("Playwright forced delete failure.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return null;
}

function isPlaywrightTestMode() {
  return process.env.PLAYWRIGHT_TEST === "1";
}

function getPlaywrightFallbackModels(models: OllamaModel[]) {
  if (!isPlaywrightTestMode() || models.length > 0) {
    return models;
  }

  return [PLAYWRIGHT_FALLBACK_MODEL];
}

function getBaseUrl() {
  return (
    process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_OLLAMA_BASE_URL
  );
}

function buildChatMessages(
  messages: OllamaChatMessage[],
  systemPrompt?: string,
) {
  const cleanedMessages = messages.filter((message) => message.content.trim());

  if (!systemPrompt?.trim()) {
    return cleanedMessages;
  }

  return [
    {
      role: "system" as const,
      content: systemPrompt.trim(),
    },
    ...cleanedMessages,
  ];
}

async function fetchFromOllama<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
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

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const baseUrl = getBaseUrl();

  try {
    const [tagsResult, runningResult, versionResult] = await Promise.allSettled([
      fetchFromOllama<{ models?: OllamaModel[] }>("/api/tags"),
      fetchFromOllama<{ models?: OllamaRuntime[] }>("/api/ps"),
      fetchFromOllama<{ version?: string }>("/api/version"),
    ]);

    const models =
      tagsResult.status === "fulfilled" ? tagsResult.value.models ?? [] : [];
    const resolvedModels = getPlaywrightFallbackModels(models);
    const running =
      runningResult.status === "fulfilled"
        ? runningResult.value.models ?? []
        : [];
    const version =
      versionResult.status === "fulfilled"
        ? versionResult.value.version
        : undefined;

    if (
      tagsResult.status === "rejected" &&
      runningResult.status === "rejected" &&
      versionResult.status === "rejected"
    ) {
      throw tagsResult.reason;
    }

    return {
      isReachable: true,
      baseUrl,
      fetchedAt: new Date().toISOString(),
      modelCount: resolvedModels.length,
      runningCount: running.length,
      models: resolvedModels,
      running,
      version,
    };
  } catch (error) {
    if (isPlaywrightTestMode()) {
      return {
        isReachable: false,
        baseUrl,
        fetchedAt: new Date().toISOString(),
        modelCount: 1,
        runningCount: 0,
        models: [PLAYWRIGHT_FALLBACK_MODEL],
        running: [],
        error: error instanceof Error ? error.message : "Unknown Ollama error",
      };
    }

    return {
      isReachable: false,
      baseUrl,
      fetchedAt: new Date().toISOString(),
      modelCount: 0,
      runningCount: 0,
      models: [],
      running: [],
      error: error instanceof Error ? error.message : "Unknown Ollama error",
    };
  }
}

export async function requestOllamaChatStream(
  payload: OllamaChatRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(`${getBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      model: payload.model,
      messages: buildChatMessages(payload.messages, payload.systemPrompt),
      stream: true,
      options:
        typeof payload.temperature === "number"
          ? { temperature: payload.temperature }
          : undefined,
    }),
  });

  return response;
}

export async function deleteOllamaModel(name: string) {
  const playwrightResponse = getPlaywrightDeleteResponse(name);

  if (playwrightResponse) {
    return playwrightResponse;
  }

  const response = await fetch(`${getBaseUrl()}/api/delete`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ name }),
  });

  return response;
}

export async function requestOllamaPullStream(name: string, signal?: AbortSignal) {
  const response = await fetch(`${getBaseUrl()}/api/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      name,
      stream: true,
    }),
  });

  return response;
}