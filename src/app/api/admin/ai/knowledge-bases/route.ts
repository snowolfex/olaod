import { requireAdminSession } from "@/lib/auth";
import {
  deleteAiKnowledgeBase,
  listAiKnowledgeBases,
  saveAiKnowledgeBase,
} from "@/lib/ai-knowledge-bases";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const knowledgeBases = await listAiKnowledgeBases();
  return Response.json({ knowledgeBases });
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
    entryIds?: string[];
  };

  const knowledgeBases = await saveAiKnowledgeBase({
    id: payload.id,
    name: payload.name ?? "",
    description: payload.description,
    entryIds: payload.entryIds,
  });

  return Response.json({ knowledgeBases });
}

export async function DELETE(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as { id?: string };
  const deleted = await deleteAiKnowledgeBase(payload.id ?? "");

  if (!deleted) {
    return Response.json({ error: "Knowledge base not found." }, { status: 404 });
  }

  const knowledgeBases = await listAiKnowledgeBases();
  return Response.json({ knowledgeBases });
}