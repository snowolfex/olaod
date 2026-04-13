import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { getJobRecord } from "@/lib/job-history";
import { queuePullRetry } from "@/lib/pull-job-retry";

export const dynamic = "force-dynamic";

export async function POST(
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

  if (job.type !== "model.pull") {
    return Response.json({ error: "Only pull jobs can be retried." }, { status: 400 });
  }

  if (job.status !== "failed" && job.status !== "cancelled") {
    return Response.json(
      { error: "Only failed or cancelled pull jobs can be retried." },
      { status: 409 },
    );
  }

  const currentUser = await getCurrentUser(request.headers.get("cookie"));
  const retryJob = await queuePullRetry({
    sourceJob: job,
    requestedBy: currentUser?.displayName ?? "local-admin",
  });

  return Response.json({ ok: true, jobId: retryJob.id }, { status: 202 });
}