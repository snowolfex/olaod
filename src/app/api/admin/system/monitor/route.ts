import { requireAdminSession } from "@/lib/auth";
import { getAdminSystemMonitorSnapshot } from "@/lib/system-monitor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const snapshot = await getAdminSystemMonitorSnapshot();
  return Response.json({ snapshot });
}