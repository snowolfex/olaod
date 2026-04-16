import type { AiChatRequest } from "@/lib/ai-types";
import { requestAiChatTextResponse, requestPlaywrightAiChatTextResponse } from "@/lib/ai-service";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function isPlaywrightChatScenario(payload: AiChatRequest) {
  if (process.env.PLAYWRIGHT_TEST !== "1") {
    return false;
  }

  const lastUserMessage = [...payload.messages].reverse().find((message) => message.role === "user");
  return lastUserMessage?.content.trim().startsWith("playwright:") ?? false;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AiChatRequest;

    if (!payload.model?.trim()) {
      return Response.json({ error: "A model is required." }, { status: 400 });
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return Response.json({ error: "At least one chat message is required." }, { status: 400 });
    }

    await recordActivity({
      level: "info",
      summary: `AI chat request sent to ${payload.providerId ?? "ollama"}:${payload.model}`,
      details: `${payload.messages.length} messages included in the request.`,
      type: "chat.requested",
    });

    if (isPlaywrightChatScenario(payload)) {
      return requestPlaywrightAiChatTextResponse(payload, request.signal);
    }

    const upstream = await requestAiChatTextResponse(payload, request.signal);

    if (!upstream.ok) {
      const detail = await upstream.text();

      return Response.json(
        { error: detail.trim() || `AI chat request failed with ${upstream.status}.` },
        { status: upstream.status },
      );
    }

    return upstream;
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "AI chat request failed",
      details: error instanceof Error ? error.message : "Unexpected AI chat proxy error.",
      type: "chat.failed",
    });

    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected AI chat proxy error." },
      { status: 500 },
    );
  }
}