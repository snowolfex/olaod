import { recordActivity } from "@/lib/activity";
import { createJobRecord } from "@/lib/job-history";
import type { JobRecord } from "@/lib/job-history-types";
import { executePullJob } from "@/lib/pull-job-executor";

export async function queuePullRetry(input: {
  sourceJob: JobRecord;
  requestedBy: string;
}) {
  const retryJob = await createJobRecord({
    type: "model.pull",
    target: input.sourceJob.target,
    requestedBy: input.requestedBy,
    progressMessage: "Retry queued.",
    status: "queued",
  });

  await recordActivity({
    level: "info",
    summary: `Model pull retried: ${input.sourceJob.target}`,
    details: "A failed or cancelled pull job was queued again.",
    type: "model.pull_retried",
  });

  void executePullJob({
    jobId: retryJob.id,
    modelName: input.sourceJob.target,
  }).catch(async (error) => {
    await recordActivity({
      level: "warning",
      summary: `Detached pull retry failed: ${input.sourceJob.target}`,
      details: error instanceof Error ? error.message : "Unexpected detached retry error.",
      type: "model.pull_retry_failed",
    });
  });

  return retryJob;
}