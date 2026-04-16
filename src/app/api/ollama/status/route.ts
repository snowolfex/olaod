import { getOllamaStatus } from "@/lib/ollama-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getOllamaStatus();

  return Response.json(status, {
    status: status.isReachable ? 200 : 503,
  });
}