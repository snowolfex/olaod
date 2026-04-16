import { AI_TERMINOLOGY } from "@/lib/ai-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ terminology: AI_TERMINOLOGY });
}