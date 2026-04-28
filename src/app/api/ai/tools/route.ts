import { AI_TOOL_DEFINITIONS } from "@/lib/ai-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tools: AI_TOOL_DEFINITIONS });
}