import { requireAdminSession } from "@/lib/auth";
import { getAiKnowledgeDebugSnapshot } from "@/lib/ai-context";
import type { AiKnowledgeDebugResponse, AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? "5");
  const modelId = searchParams.get("modelId")?.trim() ?? "";
  const providerId = searchParams.get("providerId")?.trim() as AiProviderId | null;

  if (!query) {
    return Response.json({
      query,
      providerId,
      modelId,
      scoringMode: "lexical",
      vectorAvailable: false,
      vectorModel: null,
      knowledgeCount: 0,
      fallbackReason: "no-query",
      results: [],
    } satisfies AiKnowledgeDebugResponse);
  }

  const snapshot = await getAiKnowledgeDebugSnapshot(
    query,
    Number.isFinite(limit) ? Math.max(1, Math.min(10, limit)) : 5,
    providerId || modelId ? {
      providerId: providerId ?? undefined,
      modelId: modelId || undefined,
    } : undefined,
  );

  return Response.json({
    ...snapshot,
    providerId,
    modelId,
  } satisfies AiKnowledgeDebugResponse);
}