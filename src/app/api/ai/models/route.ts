import type { AiProviderId } from "@/lib/ai-types";
import { DEFAULT_AI_PROVIDER_ID, listAiModels, listAiProviders } from "@/lib/ai-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerId = (searchParams.get("providerId") as AiProviderId | null) ?? DEFAULT_AI_PROVIDER_ID;
  const [providers, models] = await Promise.all([
    listAiProviders(),
    listAiModels(providerId),
  ]);

  return Response.json({
    defaultProviderId: DEFAULT_AI_PROVIDER_ID,
    models,
    providerId,
    providers,
  });
}