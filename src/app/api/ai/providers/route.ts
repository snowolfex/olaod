import { AI_TERMINOLOGY, DEFAULT_AI_PROVIDER_ID, listAiProviders } from "@/lib/ai-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await listAiProviders();

  return Response.json({
    defaultProviderId: DEFAULT_AI_PROVIDER_ID,
    providers,
    terminology: AI_TERMINOLOGY,
  });
}