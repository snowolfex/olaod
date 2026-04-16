import { requireAdminSession } from "@/lib/auth";
import { findAiKnowledgeOverlaps } from "@/lib/ai-context";
import type { AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as {
    content?: string;
    id?: string;
    limit?: number;
    modelIds?: string[];
    providerIds?: AiProviderId[];
    tags?: string[];
    title?: string;
  };

  const results = await findAiKnowledgeOverlaps({
    id: payload.id,
    title: payload.title ?? "",
    content: payload.content ?? "",
    tags: payload.tags,
    providerIds: payload.providerIds,
    modelIds: payload.modelIds,
    limit: payload.limit,
  });

  return Response.json({ results });
}