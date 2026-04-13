import { recordActivity } from "@/lib/activity";
import { requireAdminSession } from "@/lib/auth";
import { getJobRecord, syncQueuedPullJobs } from "@/lib/job-history";
import { moveQueuedPull } from "@/lib/pull-job-control";

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

  if (job.type !== "model.pull" || job.status !== "queued") {
    return Response.json(
      { error: "Only queued pull jobs can be reordered." },
      { status: 409 },
    );
  }

  const payload = (await request.json()) as { direction?: string };

  if (payload.direction !== "up" && payload.direction !== "down") {
    return Response.json({ error: "Invalid reorder direction." }, { status: 400 });
  }

  const snapshot = moveQueuedPull(job.id, payload.direction);

  if (!snapshot) {
    return Response.json(
      { error: "The queued job cannot be moved further in that direction." },
      { status: 409 },
    );
  }

  await syncQueuedPullJobs({ pendingJobIds: snapshot.pendingJobIds });
  await recordActivity({
    level: "info",
    summary: `Queued pull reprioritized: ${job.target}`,
    details: `Queued pull moved ${payload.direction} in the execution order.`,
    type: "model.pull_reordered",
  });

  return Response.json({ ok: true });
}