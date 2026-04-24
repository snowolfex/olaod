import { listAiWorkspaceProfiles } from "@/lib/ai-profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const profiles = await listAiWorkspaceProfiles();
  return Response.json({ profiles });
}
