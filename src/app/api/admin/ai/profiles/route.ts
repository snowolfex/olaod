import { requireAdminSession } from "@/lib/auth";
import {
  deleteAiWorkspaceProfile,
  listAiWorkspaceProfiles,
  saveAiWorkspaceProfile,
} from "@/lib/ai-profiles";
import type { AiGroundingMode, AiProviderId, AiToolId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const profiles = await listAiWorkspaceProfiles();
  return Response.json({ profiles });
}

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as {
    id?: string;
    name?: string;
    description?: string;
    providerId?: AiProviderId;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    useKnowledge?: boolean;
    groundingMode?: Exclude<AiGroundingMode, "off">;
    enabledToolIds?: AiToolId[];
    knowledgeBaseIds?: string[];
  };

  const profiles = await saveAiWorkspaceProfile({
    id: payload.id,
    name: payload.name ?? "",
    description: payload.description,
    providerId: payload.providerId,
    model: payload.model ?? "",
    systemPrompt: payload.systemPrompt,
    temperature: payload.temperature,
    useKnowledge: payload.useKnowledge,
    groundingMode: payload.groundingMode,
    enabledToolIds: payload.enabledToolIds,
    knowledgeBaseIds: payload.knowledgeBaseIds,
  });

  return Response.json({ profiles });
}

export async function DELETE(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as { id?: string };
  const deleted = await deleteAiWorkspaceProfile(payload.id ?? "");

  if (!deleted) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  const profiles = await listAiWorkspaceProfiles();
  return Response.json({ profiles });
}
