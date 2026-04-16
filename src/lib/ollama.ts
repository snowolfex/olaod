import type { AiKnowledgeCitation } from "@/lib/ai-types";

export type OllamaCliStatus = {
  isInstalled: boolean;
  executablePath: string | null;
  version?: string;
  error?: string;
};

export type OllamaServerStatus = {
  isProcessRunning: boolean;
  canReachApi: boolean;
  pid: number | null;
};

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
  knowledgeCitations?: AiKnowledgeCitation[];
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
  cli: OllamaCliStatus;
  server: OllamaServerStatus;
  version?: string;
  error?: string;
};

export type OllamaCatalogModel = {
  slug: string;
  name: string;
  description: string;
  installed: boolean;
  installedModelNames: string[];
  running: boolean;
  runningModelNames: string[];
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

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

export function getOllamaBaseUrl() {
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

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const { getOllamaStatus: getResolvedOllamaStatus } = await import("@/lib/ollama-status");
  return getResolvedOllamaStatus();
}

export async function requestOllamaChatStream(
  payload: OllamaChatRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
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

  const response = await fetch(`${getOllamaBaseUrl()}/api/delete`, {
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
  const response = await fetch(`${getOllamaBaseUrl()}/api/pull`, {
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