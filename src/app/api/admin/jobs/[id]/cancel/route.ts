import { recordActivity } from "@/lib/activity";
import { requireAdminSession } from "@/lib/auth";
import { getJobRecord, syncQueuedPullJobs, updateJobRecord } from "@/lib/job-history";
import { cancelActivePull, cancelQueuedPull, getPullQueueSnapshot } from "@/lib/pull-job-control";

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
    return Response.json(
      { error: "Only pull jobs can be cancelled." },
      { status: 400 },
    );
  }

  if (job.status === "queued") {
    const cancelled = cancelQueuedPull(job.id);

    if (!cancelled) {
      return Response.json(
        { error: "The queued pull is no longer available." },
        { status: 409 },
      );
    }

    await updateJobRecord(job.id, {
      progressMessage: "Pull cancelled before execution.",
      status: "cancelled",
      progressEntry: {
        statusLabel: "cancelled",
      },
    });

    await recordActivity({
      level: "warning",
      summary: `Queued pull cancelled: ${job.target}`,
      details: "A queued model pull was cancelled before it started.",
      type: "model.pull_cancelled",
    });

    await syncQueuedPullJobs(getPullQueueSnapshot());

    return Response.json({ ok: true, cancelled: true, state: "queued" });
  }

  if (job.status !== "running") {
    return Response.json(
      { error: "Only queued or running pull jobs can be cancelled." },
      { status: 409 },
    );
  }

  const cancelled = cancelActivePull(job.id);

  if (!cancelled) {
    return Response.json(
      { error: "The active pull controller is no longer available." },
      { status: 409 },
    );
  }

  await updateJobRecord(job.id, {
    progressMessage: "Cancellation requested.",
    progressEntry: {
      statusLabel: "cancelling",
    },
  });

  await recordActivity({
    level: "warning",
    summary: `Pull cancellation requested: ${job.target}`,
    details: "A running model pull received a cancellation request.",
    type: "model.pull_cancel_requested",
  });

  return Response.json({ ok: true, cancelled: true, state: "running" });
}