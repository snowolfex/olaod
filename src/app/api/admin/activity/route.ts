import { requireAdminSession } from "@/lib/auth";
import { listActivityEvents } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const events = await listActivityEvents();
  return Response.json({ events });
}