import { requireAdminSession } from "@/lib/auth";
import { deleteAiKnowledgeEntry, listAiKnowledge, saveAiKnowledgeEntry } from "@/lib/ai-context";
import type { AiProviderId } from "@/lib/ai-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const entries = await listAiKnowledge();
  return Response.json({ entries });
}

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as {
    content?: string;
    id?: string;
    modelIds?: string[];
    providerIds?: AiProviderId[];
    source?: string;
    tags?: string[];
    title?: string;
  };

  const entry = await saveAiKnowledgeEntry({
    id: payload.id,
    title: payload.title ?? "",
    content: payload.content ?? "",
    modelIds: payload.modelIds,
    providerIds: payload.providerIds,
    source: payload.source,
    tags: payload.tags,
  });

  return Response.json({ entry });
}

export async function DELETE(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return Response.json({ error: "Knowledge entry id is required." }, { status: 400 });
  }

  await deleteAiKnowledgeEntry(id);
  return Response.json({ ok: true, id });
}