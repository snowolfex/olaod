import { searchAiKnowledge } from "@/lib/ai-context";
import type { AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? "4");
  const modelId = searchParams.get("modelId")?.trim() ?? "";
  const providerId = searchParams.get("providerId")?.trim() as AiProviderId | null;

  if (!query) {
    return Response.json({ query, results: [] });
  }

  const results = await searchAiKnowledge(
    query,
    Number.isFinite(limit) ? Math.max(1, Math.min(10, limit)) : 4,
    providerId || modelId ? {
      providerId: providerId ?? undefined,
      modelId: modelId || undefined,
    } : undefined,
  );
  return Response.json({ query, providerId, modelId, results });
}