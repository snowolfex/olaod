import {
  type OllamaChatRequest,
  type OllamaChatStreamChunk,
  requestOllamaChatStream,
} from "@/lib/ollama";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function createAbortError(message = "The operation was aborted.") {
  return new DOMException(message, "AbortError");
}

function isPlaywrightChatScenario(payload: OllamaChatRequest) {
  if (process.env.PLAYWRIGHT_TEST !== "1") {
    return false;
  }

  const lastUserMessage = [...payload.messages].reverse().find((message) => message.role === "user");
  return lastUserMessage?.content.trim().startsWith("playwright:") ?? false;
}

function getPlaywrightChatChunks(payload: OllamaChatRequest) {
  const lastUserMessage = [...payload.messages].reverse().find((message) => message.role === "user");
  const scenario = lastUserMessage?.content.trim() ?? "playwright:reply";

  if (scenario.startsWith("playwright:stop")) {
    return [
      "Streaming reply started. This partial reply should remain after stop. ",
      "More tokens would have arrived if streaming continued.",
    ];
  }

  return [
    "Playwright deterministic reply. ",
    "The browser stream completed successfully. ",
    `Model ${payload.model} stayed inside the local test harness.`,
  ];
}

function createPlaywrightChatStream(payload: OllamaChatRequest, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  const chunks = getPlaywrightChatChunks(payload);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const waitForDelay = (durationMs: number) => new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(createAbortError());
          return;
        }

        const handleAbort = () => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
          signal?.removeEventListener("abort", handleAbort);
          reject(createAbortError());
        };

        timeoutId = setTimeout(() => {
          timeoutId = null;
          signal?.removeEventListener("abort", handleAbort);
          resolve();
        }, durationMs);

        signal?.addEventListener("abort", handleAbort, { once: true });
      });

      try {
        for (const chunk of chunks) {
          if (signal?.aborted) {
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(chunk));
          await waitForDelay(120);
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

function createChatTextStream(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Ollama did not return a readable stream.");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const processLine = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        const chunk = JSON.parse(trimmed) as OllamaChatStreamChunk;

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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as OllamaChatRequest;

    if (!payload.model?.trim()) {
      return Response.json({ error: "A model is required." }, { status: 400 });
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return Response.json(
        { error: "At least one chat message is required." },
        { status: 400 },
      );
    }

    await recordActivity({
      level: "info",
      summary: `Chat request sent to ${payload.model}`,
      details: `${payload.messages.length} messages included in the request.`,
      type: "chat.requested",
    });

    if (isPlaywrightChatScenario(payload)) {
      return new Response(createPlaywrightChatStream(payload, request.signal), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
        },
      });
    }

    const upstream = await requestOllamaChatStream(payload, request.signal);

    if (!upstream.ok) {
      const detail = await upstream.text();

      return Response.json(
        {
          error:
            detail.trim() || `Ollama chat request failed with ${upstream.status}.`,
        },
        { status: upstream.status },
      );
    }

    return new Response(createChatTextStream(upstream), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
      },
    });
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Chat request failed",
      details: error instanceof Error ? error.message : "Unexpected chat proxy error.",
      type: "chat.failed",
    });

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected chat proxy error.",
      },
      { status: 500 },
    );
  }
}