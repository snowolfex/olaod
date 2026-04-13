import { requireAdminSession } from "@/lib/auth";
import { getJobRecord } from "@/lib/job-history";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const { id } = await context.params;
  const job = await getJobRecord(id);

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  return Response.json({ job });
}