import { getOllamaLibraryCatalog, getOllamaStatus } from "@/lib/ollama-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getOllamaStatus();
  const catalog = await getOllamaLibraryCatalog(status);

  return Response.json({
    catalog,
    fetchedAt: new Date().toISOString(),
  });
}