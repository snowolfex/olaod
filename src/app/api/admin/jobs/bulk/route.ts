import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { listJobHistory, syncQueuedPullJobs, updateJobRecord } from "@/lib/job-history";
import { cancelQueuedPull, getPullQueueSnapshot } from "@/lib/pull-job-control";
import { queuePullRetry } from "@/lib/pull-job-retry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as { action?: string; requestedBy?: string };
  const requestedBy = payload.requestedBy?.trim() || undefined;

  if (payload.action !== "cancel-queued-pulls" && payload.action !== "retry-failed-pulls") {
    return Response.json({ error: "Unsupported bulk action." }, { status: 400 });
  }

  if (payload.action === "retry-failed-pulls") {
    const currentUser = await getCurrentUser(request.headers.get("cookie"));
    const jobs = await listJobHistory();
    const failedPulls = jobs.filter(
      (job) => job.type === "model.pull"
        && (job.status === "failed" || job.status === "cancelled")
        && (!requestedBy || job.requestedBy === requestedBy),
    );

    let retriedCount = 0;

    for (const job of failedPulls) {
      await queuePullRetry({
        sourceJob: job,
        requestedBy: currentUser?.displayName ?? "local-admin",
      });
      retriedCount += 1;
    }

    await recordActivity({
      level: retriedCount > 0 ? "info" : "warning",
      summary: `Bulk failed pull retry: ${retriedCount} job${retriedCount === 1 ? "" : "s"}`,
      details:
        retriedCount > 0
          ? `Failed or cancelled pull jobs${requestedBy ? ` for ${requestedBy}` : ""} were re-queued from the bulk operator action.`
          : `No failed or cancelled pull jobs${requestedBy ? ` for ${requestedBy}` : ""} were available for bulk retry.`,
      type: "model.pull_bulk_retry",
    });

    return Response.json({ ok: true, retriedCount });
  }

  const jobs = await listJobHistory();
  const queuedPulls = jobs.filter(
    (job) => job.type === "model.pull" && job.status === "queued" && (!requestedBy || job.requestedBy === requestedBy),
  );

  let cancelledCount = 0;

  for (const job of queuedPulls) {
    const cancelled = cancelQueuedPull(job.id);

    if (!cancelled) {
      continue;
    }

    await updateJobRecord(job.id, {
      progressMessage: "Pull cancelled before execution.",
      status: "cancelled",
      progressEntry: {
        statusLabel: "cancelled",
      },
    });
    cancelledCount += 1;
  }

  await recordActivity({
    level: cancelledCount > 0 ? "warning" : "info",
    summary: `Bulk queued pull cancel: ${cancelledCount} job${cancelledCount === 1 ? "" : "s"}`,
    details:
      cancelledCount > 0
        ? `Queued pull jobs${requestedBy ? ` for ${requestedBy}` : ""} were cancelled from the bulk operator action.`
        : `No queued pull jobs${requestedBy ? ` for ${requestedBy}` : ""} were available for bulk cancellation.`,
    type: "model.pull_bulk_cancel",
  });

  await syncQueuedPullJobs(getPullQueueSnapshot());

  return Response.json({ ok: true, cancelledCount });
}