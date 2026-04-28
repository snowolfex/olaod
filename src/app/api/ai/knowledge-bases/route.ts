import { listAiKnowledgeBases } from "@/lib/ai-knowledge-bases";

export const dynamic = "force-dynamic";

export async function GET() {
  const knowledgeBases = await listAiKnowledgeBases();
  return Response.json({ knowledgeBases });
}