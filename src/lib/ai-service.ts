import {
  AI_KNOWLEDGE_SOURCES_HEADER,
  type AiChatMessage,
  type AiChatRequest,
  type AiKnowledgeCitation,
  type AiModelSummary,
  type AiProviderId,
  type AiProviderSummary,
  type AiTerminologyEntry,
} from "@/lib/ai-types";
import { searchAiKnowledge } from "@/lib/ai-context";
import { dedupeKnowledgeCitations } from "@/lib/knowledge-citations";
import { getProviderApiKey, listProviderConfigSummaries } from "@/lib/ai-provider-store";
import { requestOllamaChatStream } from "@/lib/ollama";
import { getOllamaStatus } from "@/lib/ollama-status";

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = "ollama";

export const AI_TERMINOLOGY: AiTerminologyEntry[] = [
  {
    id: "inference",
    label: "Inference",
    definition: "Running a model to produce an answer from an existing set of weights.",
    ollamaMeaning: "Prompting a local model through Ollama after the model is installed and optionally loaded into runtime memory.",
    multiProviderMeaning: "Prompting any provider, local or hosted, through a unified chat API.",
  },
  {
    id: "model-pull",
    label: "Model pull",
    definition: "Downloading model weights so they exist locally on the machine.",
    ollamaMeaning: "Fetching an Ollama model to local disk so it can be run later.",
    multiProviderMeaning: "Mostly a local-runtime concern. Hosted APIs usually do not expose this step.",
  },
  {
    id: "model-loading",
    label: "Model loading",
    definition: "Bringing an installed model into active runtime memory so it can answer prompts faster or immediately.",
    ollamaMeaning: "Starting a local runtime for an installed Ollama model.",
    multiProviderMeaning: "A provider-specific runtime concern. Hosted APIs handle loading behind the service boundary.",
  },
  {
    id: "training",
    label: "Training",
    definition: "Updating model weights with data so the model itself learns new behavior.",
    ollamaMeaning: "Not part of the normal pull or load flow in this app.",
    multiProviderMeaning: "A separate pipeline from chat inference, often expensive and provider-specific.",
  },
  {
    id: "fine-tuning",
    label: "Fine-tuning",
    definition: "A narrower training step that adapts an existing model to a specific task or style.",
    ollamaMeaning: "Not handled by the current local runtime controls.",
    multiProviderMeaning: "Optional later-stage capability, not the same thing as loading or routing prompts.",
  },
  {
    id: "rag",
    label: "RAG",
    definition: "Retrieval-augmented generation: providing relevant documents or data at prompt time without retraining the base model.",
    ollamaMeaning: "The likely first path for making a local model answer with business context.",
    multiProviderMeaning: "Usually the first scalable customization layer across both local and hosted providers.",
  },
];

const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
] as const;

const OPENAI_MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
] as const;

function getHostedProviderLabel(providerId: Extract<AiProviderId, "anthropic" | "openai">) {
  return providerId === "anthropic" ? "Anthropic" : "OpenAI";
}

function buildKnowledgeSystemPrompt(results: Awaited<ReturnType<typeof searchAiKnowledge>>) {
  if (results.length === 0) {
    return null;
  }

  const blocks = results.map((entry, index) => {
    const tags = entry.tags.length > 0 ? `Tags: ${entry.tags.join(", ")}` : "Tags: none";
    return [
      `Context ${index + 1}: ${entry.title}`,
      `Source: ${entry.source}`,
      tags,
      entry.content,
    ].join("\n");
  });

  return [
    "Use the following retrieved workspace context when it is relevant.",
    "If the context conflicts with the prompt, explain the conflict instead of silently guessing.",
    ...blocks,
  ].join("\n\n");
}

function buildKnowledgeCitations(results: Awaited<ReturnType<typeof searchAiKnowledge>>): AiKnowledgeCitation[] {
  return dedupeKnowledgeCitations(results.map((entry) => ({
    id: entry.id,
    title: entry.title,
    source: entry.source,
    tags: entry.tags,
    providerIds: entry.providerIds,
    modelIds: entry.modelIds,
    excerpt: entry.content,
    score: entry.score,
  })));
}

function formatKnowledgeSourcesFooter(knowledgeCitations: AiKnowledgeCitation[]) {
  const titles = Array.from(new Set(knowledgeCitations.map((entry) => entry.title.trim()).filter(Boolean)));

  if (titles.length === 0) {
    return null;
  }

  return `Sources: ${titles.join("; ")}`;
}

function buildSystemPrompt(basePrompt: string | undefined, knowledgePrompt: string | null) {
  const parts = [basePrompt?.trim(), knowledgePrompt].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function buildAnthropicMessages(messages: AiChatMessage[], systemPrompt?: string) {
  return {
    system: systemPrompt,
    messages: messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
  };
}

function buildOpenAiMessages(messages: AiChatMessage[], systemPrompt?: string) {
  const nextMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  if (!systemPrompt?.trim()) {
    return nextMessages;
  }

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...nextMessages,
  ];
}

function getOpenAiBaseUrl() {
  const configuredBaseUrl = process.env.OLOAD_OPENAI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
  return configuredBaseUrl ? configuredBaseUrl.replace(/\/+$/, "") : "https://api.openai.com/v1";
}

function extractUpstreamErrorMessage(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    error?: { message?: string } | string;
    message?: string;
  };

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  if (typeof candidate.error === "string" && candidate.error.trim()) {
    return candidate.error.trim();
  }

  if (candidate.error && typeof candidate.error === "object") {
    const nestedMessage = (candidate.error as { message?: string }).message;

    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  return null;
}

async function buildProviderErrorResponse(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json() as unknown;
      const message = extractUpstreamErrorMessage(payload) ?? fallbackMessage;

      return new Response(message, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  } catch {
    // Fall through to text extraction.
  }

  try {
    const text = (await response.text()).trim();
    const message = text ? extractUpstreamErrorMessage(text) ?? text : fallbackMessage;

    return new Response(message, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(fallbackMessage, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}

function createOllamaPlainTextStream(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Ollama did not return a readable stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const processLine = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        const chunk = JSON.parse(trimmed) as {
          error?: string;
          message?: { content?: string };
          response?: string;
        };

        if (chunk.error) {
          throw new Error(chunk.error);
        }

        const content = chunk.message?.content ?? chunk.response ?? "";

        if (content) {
          controller.enqueue(encoder.encode(content));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            processLine(line);
          }
        }

        const tail = buffer.trim();

        if (tail) {
          processLine(tail);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
}

function createAnthropicPlainTextStream(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Anthropic did not return a readable stream.");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const dataLines = eventBlock
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .filter(Boolean);

            for (const line of dataLines) {
              if (line === "[DONE]") {
                controller.close();
                return;
              }

              const payload = JSON.parse(line) as {
                type?: string;
                error?: { message?: string };
                delta?: { text?: string };
              };

              if (payload.type === "error") {
                throw new Error(payload.error?.message ?? "Anthropic streaming error.");
              }

              const chunk = payload.delta?.text ?? "";

              if (chunk) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
}

function createOpenAiPlainTextStream(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("OpenAI did not return a readable stream.");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const dataLines = eventBlock
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .filter(Boolean);

            for (const line of dataLines) {
              if (line === "[DONE]") {
                controller.close();
                return;
              }

              const payload = JSON.parse(line) as {
                error?: { message?: string };
                choices?: Array<{
                  delta?: {
                    content?: string;
                  };
                }>;
              };

              if (payload.error?.message) {
                throw new Error(payload.error.message);
              }

              const chunk = payload.choices?.[0]?.delta?.content ?? "";

              if (chunk) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
}

async function requestAnthropicChatTextResponse(payload: AiChatRequest, signal?: AbortSignal) {
  const apiKey = await getProviderApiKey("anthropic");

  if (!apiKey) {
    throw new Error("Anthropic is not configured yet. Add an API key in provider settings first.");
  }

  const { system, messages } = buildAnthropicMessages(payload.messages, payload.systemPrompt);
  let response: Response;

  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal,
      body: JSON.stringify({
        model: payload.model,
        max_tokens: 1024,
        stream: true,
        system,
        messages,
        temperature: typeof payload.temperature === "number" ? payload.temperature : undefined,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new Error("Unable to reach Anthropic right now. Check internet access and the configured Anthropic API key, then retry.");
  }

  if (!response.ok) {
    return buildProviderErrorResponse(
      response,
      `Anthropic rejected the request with ${response.status}. Check the selected model and API key, then retry.`,
    );
  }

  return new Response(createAnthropicPlainTextStream(response), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

async function requestOpenAiChatTextResponse(payload: AiChatRequest, signal?: AbortSignal) {
  const apiKey = await getProviderApiKey("openai");

  if (!apiKey) {
    throw new Error("OpenAI is not configured yet. Add an API key in provider settings first.");
  }

  let response: Response;

  try {
    response = await fetch(`${getOpenAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: payload.model,
        messages: buildOpenAiMessages(payload.messages, payload.systemPrompt),
        max_tokens: 1024,
        stream: true,
        temperature: typeof payload.temperature === "number" ? payload.temperature : undefined,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new Error("Unable to reach OpenAI right now. Check internet access, any custom OpenAI base URL, and the configured API key, then retry.");
  }

  if (!response.ok) {
    return buildProviderErrorResponse(
      response,
      `OpenAI rejected the request with ${response.status}. Check the selected model and API key, then retry.`,
    );
  }

  return new Response(createOpenAiPlainTextStream(response), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

async function requestOllamaChatTextResponse(payload: AiChatRequest, signal?: AbortSignal) {
  const status = await getOllamaStatus();

  if (!status.isReachable) {
    throw new Error("Ollama is offline. Start the local service from Admin > Model operations, or switch to a hosted provider with a configured API key.");
  }

  if (!status.models.some((model) => model.name === payload.model)) {
    throw new Error(`The local model "${payload.model}" is not available on this machine. Choose one of the downloaded Ollama models or pull it from Admin > Model operations.`);
  }

  let response: Response;

  try {
    response = await requestOllamaChatStream(payload, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new Error("Unable to reach Ollama right now. Start the local service or verify the local Ollama host settings before retrying.");
  }

  if (!response.ok) {
    return buildProviderErrorResponse(
      response,
      `Ollama rejected the request with ${response.status}. Check that the selected model is ready locally, then retry.`,
    );
  }

  return new Response(createOllamaPlainTextStream(response), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

function createPlaywrightAiPlainTextStream(payload: AiChatRequest, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  const lastUserMessage = [...payload.messages].reverse().find((message) => message.role === "user");
  const scenario = lastUserMessage?.content.trim() ?? "playwright:reply";
  const chunks = scenario.startsWith("playwright:stop")
    ? [
      "Streaming reply started. This partial reply should remain after stop. ",
      "More tokens would have arrived if streaming continued.",
    ]
    : [
      "Playwright deterministic reply. ",
      "The browser stream completed successfully. ",
      `Model ${payload.model} stayed inside the shared AI gateway test harness.`,
    ];

  const getChunkDelay = (chunkIndex: number) => {
    if (scenario.startsWith("playwright:stop")) {
      return chunkIndex === 0 ? 1_200 : 120;
    }

    return 120;
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const waitForDelay = (durationMs: number) => new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }

        const handleAbort = () => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }

          signal?.removeEventListener("abort", handleAbort);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };

        timeoutId = setTimeout(() => {
          timeoutId = null;
          signal?.removeEventListener("abort", handleAbort);
          resolve();
        }, durationMs);

        signal?.addEventListener("abort", handleAbort, { once: true });
      });

      try {
        for (const [chunkIndex, chunk] of chunks.entries()) {
          if (signal?.aborted) {
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(chunk));
          await waitForDelay(getChunkDelay(chunkIndex));
        }

        controller.close();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          controller.close();
          return;
        }

        controller.error(error);
      }
    },
  });
}

async function buildEffectiveChatPayload(payload: AiChatRequest) {
  if (!payload.useKnowledge) {
    return {
      payload,
      knowledgeCitations: [] as AiKnowledgeCitation[],
    };
  }

  const lastUserMessage = [...payload.messages].reverse().find((message) => message.role === "user");
  const knowledgeResults = await searchAiKnowledge(lastUserMessage?.content ?? "", 4, {
    providerId: payload.providerId,
    modelId: payload.model,
  });
  const knowledgePrompt = buildKnowledgeSystemPrompt(knowledgeResults);

  return {
    payload: {
      ...payload,
      systemPrompt: buildSystemPrompt(payload.systemPrompt, knowledgePrompt),
    } satisfies AiChatRequest,
    knowledgeCitations: buildKnowledgeCitations(knowledgeResults),
  };
}

function withKnowledgeHeaders(response: Response, knowledgeCitations: AiKnowledgeCitation[]) {
  const headers = new Headers(response.headers);
  headers.set(AI_KNOWLEDGE_SOURCES_HEADER, JSON.stringify(knowledgeCitations));

  const footer = formatKnowledgeSourcesFooter(knowledgeCitations);

  if (!footer || !response.body) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  let hasContent = false;

  const streamWithFooter = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value && value.length > 0) {
            hasContent = true;
            controller.enqueue(value);
          }
        }

        controller.enqueue(encoder.encode(hasContent ? `\n\n${footer}` : footer));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(streamWithFooter, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildHostedModels(providerId: Extract<AiProviderId, "anthropic" | "openai">, configured: boolean): AiModelSummary[] {
  if (!configured) {
    return [];
  }

  const providerLabel = getHostedProviderLabel(providerId);
  const models = providerId === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  return models.map((model) => ({
    id: `${providerId}:${model.id}`,
    providerId,
    providerLabel,
    name: model.id,
    displayName: model.label,
    installed: true,
    loaded: true,
    local: false,
    capabilities: ["chat", "streaming"],
  }));
}

export async function listAiProviders(): Promise<AiProviderSummary[]> {
  const [ollamaStatus, providerConfig] = await Promise.all([
    getOllamaStatus(),
    listProviderConfigSummaries(),
  ]);

  const configById = new Map(providerConfig.map((entry) => [entry.providerId, entry]));

  return [
    {
      id: "ollama",
      label: "Ollama",
      kind: "local",
      enabled: true,
      configured: true,
      supportsChat: true,
      supportsStreaming: true,
      supportsModelLoading: true,
      supportsFineTuning: false,
      description: "Local AI service on this device with download and ready controls.",
      notes: [
        ollamaStatus.isReachable
          ? `${ollamaStatus.modelCount} downloaded model${ollamaStatus.modelCount === 1 ? "" : "s"}, ${ollamaStatus.runningCount} ready.`
          : "Ollama runtime is currently unreachable.",
      ],
    },
    ...(["anthropic", "openai"] as const).map((providerId) => {
      const summary = configById.get(providerId);
      const label = getHostedProviderLabel(providerId);

      return {
        id: providerId,
        label,
        kind: "hosted",
        enabled: summary?.configured ?? false,
        configured: summary?.configured ?? false,
        supportsChat: true,
        supportsStreaming: true,
        supportsModelLoading: false,
        supportsFineTuning: providerId === "openai",
        description: providerId === "anthropic"
          ? "Hosted Claude service routed through the shared AI gateway."
          : "Hosted OpenAI service routed through the shared AI gateway.",
        notes: [
          summary?.configured
            ? `${label} credentials are configured ${summary.hasEnvironmentApiKey ? "through environment settings" : "through encrypted local storage"}.`
            : `${label} credentials are not configured yet.`,
        ],
      } satisfies AiProviderSummary;
    }),
  ];
}

export async function listAiModels(providerId?: AiProviderId): Promise<AiModelSummary[]> {
  const resolvedProviderId = providerId ?? DEFAULT_AI_PROVIDER_ID;

  if (resolvedProviderId === "ollama") {
    const status = await getOllamaStatus();
    const loadedModelNames = new Set(status.running.map((runtime) => runtime.model));

    return status.models.map((model) => ({
      id: `ollama:${model.name}`,
      providerId: "ollama",
      providerLabel: "Ollama",
      name: model.name,
      displayName: model.name,
      installed: true,
      loaded: loadedModelNames.has(model.name),
      local: true,
      capabilities: ["chat", "streaming", "model-pull", "runtime-load"],
      sizeBytes: model.size,
      modifiedAt: model.modified_at,
    }));
  }

  const config = await listProviderConfigSummaries();
  const hostedConfig = config.find((entry) => entry.providerId === resolvedProviderId);

  if (!hostedConfig) {
    return [];
  }

  return buildHostedModels(resolvedProviderId, hostedConfig.configured);
}

export async function requestAiChatTextResponse(payload: AiChatRequest, signal?: AbortSignal) {
  const { payload: effectivePayload, knowledgeCitations } = await buildEffectiveChatPayload(payload);
  const providerId = effectivePayload.providerId ?? DEFAULT_AI_PROVIDER_ID;

  switch (providerId) {
    case "ollama":
      return withKnowledgeHeaders(
        await requestOllamaChatTextResponse(effectivePayload, signal),
        knowledgeCitations,
      );
    case "anthropic":
      return withKnowledgeHeaders(
        await requestAnthropicChatTextResponse(effectivePayload, signal),
        knowledgeCitations,
      );
    case "openai":
      return withKnowledgeHeaders(
        await requestOpenAiChatTextResponse(effectivePayload, signal),
        knowledgeCitations,
      );
    default:
      throw new Error(`Unsupported AI provider: ${providerId satisfies never}`);
  }
}

export async function requestPlaywrightAiChatTextResponse(payload: AiChatRequest, signal?: AbortSignal) {
  const { payload: effectivePayload, knowledgeCitations } = await buildEffectiveChatPayload(payload);

  return withKnowledgeHeaders(
    new Response(createPlaywrightAiPlainTextStream(effectivePayload, signal), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
      },
    }),
    knowledgeCitations,
  );
}