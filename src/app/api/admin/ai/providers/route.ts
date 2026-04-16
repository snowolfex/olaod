import { requireAdminSession } from "@/lib/auth";
import { listProviderConfigSummaries, saveProviderApiKey } from "@/lib/ai-provider-store";
import type { AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const providers = await listProviderConfigSummaries();
  return Response.json({ providers });
}

export async function PATCH(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as {
    apiKey?: string;
    providerId?: AiProviderId;
  };

  if (payload.providerId !== "anthropic" && payload.providerId !== "openai") {
    return Response.json({ error: "A hosted provider id is required." }, { status: 400 });
  }

  await saveProviderApiKey(payload.providerId, payload.apiKey ?? "");
  const providers = await listProviderConfigSummaries();
  return Response.json({ ok: true, providers });
}