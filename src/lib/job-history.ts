import { getDataStorePath, readJsonStore, updateJsonStore } from "@/lib/data-store";
import type {
  JobProgressEntry,
  JobRecord,
  JobStatus,
  JobType,
} from "@/lib/job-history-types";

export type JobHistoryFilter = "all" | "queued" | "running" | "failed" | "cancelled" | "completed";
export type JobHistoryTypeFilter = "all" | JobType;

export type JobHistorySummary = {
  total: number;
  queued: number;
  running: number;
  failed: number;
  cancelled: number;
  completed: number;
};

export type JobHistoryAnalytics = {
  averagePullWaitMs: number | null;
  averagePullWaitTrend: "improving" | "worsening" | "steady" | "unknown";
  retryQueuedCount: number;
  retryQueuedTrend: "improving" | "worsening" | "steady" | "unknown";
  terminalFailureRate: number | null;
  terminalFailureRateTrend: "improving" | "worsening" | "steady" | "unknown";
  recentWindowLabel: string | null;
  previousWindowLabel: string | null;
};

export type JobHistoryBulkActions = {
  queuedPulls: number;
  retryablePulls: number;
};

const STORE_PATH = getDataStorePath("job-history.json");
const MAX_JOBS = 200;
const MAX_PROGRESS_ENTRIES = 60;
const ANALYTICS_TREND_WINDOW = 5;

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendProgressEntry(
  entries: JobProgressEntry[],
  entry: Omit<JobProgressEntry, "createdAt">,
  createdAt: string,
) {
  const nextEntries = [...entries, { createdAt, ...entry }];
  return nextEntries.slice(-MAX_PROGRESS_ENTRIES);
}

function normalizeJobRecord(job: JobRecord): JobRecord {
  const progressEntries = job.progressEntries?.length
    ? job.progressEntries.map((entry) => ({
        createdAt: entry.createdAt,
        message: entry.message,
        statusLabel: entry.statusLabel,
        completed: entry.completed,
        total: entry.total,
        percent: entry.percent,
      }))
    : [{ createdAt: job.updatedAt ?? job.createdAt, message: job.progressMessage }];

  return {
    ...job,
    progressEntries,
    queuePosition: job.queuePosition,
  };
}

function buildQueuedProgressMessage(queuePosition: number) {
  if (queuePosition <= 1) {
    return "Queued. Next to run.";
  }

  return `Queued in position ${queuePosition}.`;
}

async function readStore(): Promise<JobRecord[]> {
  const jobs = await readJsonStore<JobRecord[]>(STORE_PATH, []);
  return jobs.map(normalizeJobRecord);
}

function sortByUpdatedAt(jobs: JobRecord[]) {
  return [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function isTerminalStatus(status: JobStatus) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function matchesFilter(job: JobRecord, filter: JobHistoryFilter) {
  if (filter === "queued") {
    return job.status === "queued";
  }

  if (filter === "running") {
    return job.status === "running";
  }

  if (filter === "failed") {
    return job.status === "failed";
  }

  if (filter === "cancelled") {
    return job.status === "cancelled";
  }

  if (filter === "completed") {
    return job.status === "succeeded";
  }

  return true;
}

function matchesTypeFilter(job: JobRecord, filter: JobHistoryTypeFilter) {
  if (filter === "all") {
    return true;
  }

  return job.type === filter;
}

function matchesRequestedBy(job: JobRecord, requestedBy?: string) {
  if (!requestedBy) {
    return true;
  }

  return job.requestedBy === requestedBy;
}

export function summarizeJobHistory(jobs: JobRecord[]): JobHistorySummary {
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    cancelled: jobs.filter((job) => job.status === "cancelled").length,
    completed: jobs.filter((job) => job.status === "succeeded").length,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatRelativeAge(durationMs: number) {
  if (durationMs < 60_000) {
    return "under 1m";
  }

  const minutes = Math.round(durationMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.round(hours / 24);
  return `${days}d`;
}

function buildTrendWindowLabel(jobs: JobRecord[], nowMs: number) {
  if (jobs.length === 0) {
    return null;
  }

  const timestamps = jobs
    .map((job) => new Date(job.updatedAt).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) {
    return null;
  }

  const newestAge = Math.max(0, nowMs - timestamps[0]);
  const oldestAge = Math.max(0, nowMs - timestamps[timestamps.length - 1]);

  if (timestamps.length === 1) {
    return `${formatRelativeAge(newestAge)} ago`;
  }

  return `${formatRelativeAge(newestAge)} to ${formatRelativeAge(oldestAge)} ago`;
}

function compareDirectionalTrend(input: {
  current: number | null;
  previous: number | null;
  threshold: number;
  lowerIsBetter: boolean;
}) {
  if (input.current === null || input.previous === null) {
    return "unknown" as const;
  }

  const difference = input.current - input.previous;

  if (Math.abs(difference) <= input.threshold) {
    return "steady" as const;
  }

  if (input.lowerIsBetter) {
    return difference < 0 ? "improving" : "worsening";
  }

  return difference > 0 ? "improving" : "worsening";
}

export function analyzeJobHistory(jobs: JobRecord[]): JobHistoryAnalytics {
  const nowMs = Date.now();
  const recentWindowJobs = jobs.slice(0, ANALYTICS_TREND_WINDOW);
  const previousWindowJobs = jobs.slice(ANALYTICS_TREND_WINDOW, ANALYTICS_TREND_WINDOW * 2);
  const pullWaitDurations = jobs
    .filter((job) => job.type === "model.pull")
    .map((job) => {
      const runningEntry = job.progressEntries.find((entry) => entry.statusLabel === "running");

      if (!runningEntry) {
        return null;
      }

      const createdAt = new Date(job.createdAt).getTime();
      const startedAt = new Date(runningEntry.createdAt).getTime();

      if (Number.isNaN(createdAt) || Number.isNaN(startedAt)) {
        return null;
      }

      return Math.max(0, startedAt - createdAt);
    })
    .filter((value): value is number => typeof value === "number");

  const averagePullWaitMs = pullWaitDurations.length > 0
    ? Math.round(
      pullWaitDurations.reduce((total, value) => total + value, 0) / pullWaitDurations.length,
    )
    : null;
  const recentPullWaitAverage = average(pullWaitDurations.slice(0, ANALYTICS_TREND_WINDOW));
  const previousPullWaitAverage = average(
    pullWaitDurations.slice(ANALYTICS_TREND_WINDOW, ANALYTICS_TREND_WINDOW * 2),
  );
  const averagePullWaitTrend = compareDirectionalTrend({
    current: recentPullWaitAverage,
    previous: previousPullWaitAverage,
    threshold: 1000,
    lowerIsBetter: true,
  });

  const retryQueuedCount = jobs.filter(
    (job) => job.progressEntries[0]?.message === "Retry queued.",
  ).length;
  const retryQueuedSeries = jobs.map((job) => (
    job.progressEntries[0]?.message === "Retry queued." ? 1 : 0
  ));
  const recentRetryQueuedAverage = average(
    retryQueuedSeries.slice(0, ANALYTICS_TREND_WINDOW),
  );
  const previousRetryQueuedAverage = average(
    retryQueuedSeries.slice(ANALYTICS_TREND_WINDOW, ANALYTICS_TREND_WINDOW * 2),
  );
  const retryQueuedTrend = compareDirectionalTrend({
    current: recentRetryQueuedAverage,
    previous: previousRetryQueuedAverage,
    threshold: 0.05,
    lowerIsBetter: true,
  });

  const terminalJobs = jobs.filter(
    (job) => job.status === "succeeded" || job.status === "failed",
  );
  const failedTerminalJobs = terminalJobs.filter((job) => job.status === "failed");
  const terminalFailureRate = terminalJobs.length > 0
    ? failedTerminalJobs.length / terminalJobs.length
    : null;
  const terminalOutcomeSeries = terminalJobs.map((job) => (job.status === "failed" ? 1 : 0));
  const recentTerminalFailureRate = average(
    terminalOutcomeSeries.slice(0, ANALYTICS_TREND_WINDOW),
  );
  const previousTerminalFailureRate = average(
    terminalOutcomeSeries.slice(ANALYTICS_TREND_WINDOW, ANALYTICS_TREND_WINDOW * 2),
  );
  const terminalFailureRateTrend = compareDirectionalTrend({
    current: recentTerminalFailureRate,
    previous: previousTerminalFailureRate,
    threshold: 0.05,
    lowerIsBetter: true,
  });

  return {
    averagePullWaitMs,
    averagePullWaitTrend,
    retryQueuedCount,
    retryQueuedTrend,
    terminalFailureRate,
    terminalFailureRateTrend,
    recentWindowLabel: buildTrendWindowLabel(recentWindowJobs, nowMs),
    previousWindowLabel: buildTrendWindowLabel(previousWindowJobs, nowMs),
  };
}

export async function listJobHistory() {
  return sortByUpdatedAt(await readStore());
}

export async function getJobRecord(id: string) {
  const jobs = await readStore();
  return jobs.find((job) => job.id === id) ?? null;
}

export async function queryJobHistory(input?: {
  filter?: JobHistoryFilter;
  type?: JobHistoryTypeFilter;
  limit?: number;
  requestedBy?: string;
}) {
  const jobs = await listJobHistory();
  const filter = input?.filter ?? "all";
  const type = input?.type ?? "all";
  const limit = Math.max(1, Math.min(input?.limit ?? 12, MAX_JOBS));
  const requestedBy = input?.requestedBy?.trim() ? input.requestedBy.trim() : undefined;
  const ownerScopedJobs = jobs.filter((job) => matchesRequestedBy(job, requestedBy));
  const typeScopedJobs = ownerScopedJobs.filter((job) => matchesTypeFilter(job, type));
  const bulkActions: JobHistoryBulkActions = {
    queuedPulls: ownerScopedJobs.filter((job) => job.type === "model.pull" && job.status === "queued").length,
    retryablePulls: ownerScopedJobs.filter(
      (job) => job.type === "model.pull" && (job.status === "failed" || job.status === "cancelled"),
    ).length,
  };

  return {
    jobs: typeScopedJobs
      .filter((job) => matchesFilter(job, filter))
      .slice(0, limit),
    summary: summarizeJobHistory(jobs),
    scopedSummary: summarizeJobHistory(typeScopedJobs),
    analytics: analyzeJobHistory(typeScopedJobs),
    bulkActions,
  };
}

export async function createJobRecord(input: {
  type: JobRecord["type"];
  target: string;
  requestedBy: string;
  progressMessage: string;
  status?: JobStatus;
}): Promise<JobRecord> {
  let job: JobRecord | null = null;

  await updateJsonStore<JobRecord[]>(STORE_PATH, [], (currentJobs) => {
    const jobs = currentJobs.map(normalizeJobRecord);
    const now = new Date().toISOString();

    job = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      status: input.status ?? "queued",
      queuePosition: undefined,
      progressEntries: [{ createdAt: now, message: input.progressMessage }],
      ...input,
    };

    jobs.unshift(job);
    return sortByUpdatedAt(jobs).slice(0, MAX_JOBS);
  });

  if (!job) {
    throw new Error("Unable to create a job record.");
  }

  return job;
}

export async function updateJobRecord(
  id: string,
  input: {
    progressMessage: string;
    status?: JobStatus;
    progressEntry?: Omit<JobProgressEntry, "createdAt" | "message">;
  },
) {
  let updatedJob: JobRecord | null = null;

  await updateJsonStore<JobRecord[]>(STORE_PATH, [], (currentJobs) => {
    const jobs = currentJobs.map(normalizeJobRecord);
    const index = jobs.findIndex((job) => job.id === id);

    if (index === -1) {
      return jobs;
    }

    const updatedAt = new Date().toISOString();
    const nextStatus = input.status ?? jobs[index].status;
    const finishedAt = isTerminalStatus(nextStatus) ? updatedAt : undefined;
    const durationMs = finishedAt
      ? Math.max(0, new Date(finishedAt).getTime() - new Date(jobs[index].createdAt).getTime())
      : undefined;

    jobs[index] = {
      ...jobs[index],
      progressMessage: input.progressMessage,
      status: nextStatus,
      updatedAt,
      finishedAt,
      durationMs,
      progressEntries: appendProgressEntry(
        jobs[index].progressEntries,
        {
          message: input.progressMessage,
          ...input.progressEntry,
        },
        updatedAt,
      ),
    };
    updatedJob = jobs[index];
    return sortByUpdatedAt(jobs).slice(0, MAX_JOBS);
  });

  return updatedJob;
}

export async function syncQueuedPullJobs(input: {
  pendingJobIds: string[];
}) {
  await updateJsonStore<JobRecord[]>(STORE_PATH, [], (currentJobs) => {
    const jobs = currentJobs.map(normalizeJobRecord);
    const updatedAt = new Date().toISOString();
    let changed = false;

    const updatedJobs = jobs.map((job) => {
      if (job.type !== "model.pull") {
        return job;
      }

      const pendingIndex = input.pendingJobIds.indexOf(job.id);

      if (job.status !== "queued") {
        if (typeof job.queuePosition === "number") {
          changed = true;
          return {
            ...job,
            queuePosition: undefined,
          } satisfies JobRecord;
        }

        return job;
      }

      if (pendingIndex === -1) {
        return job;
      }

      const queuePosition = pendingIndex + 1;
      const progressMessage = buildQueuedProgressMessage(queuePosition);

      if (
        job.queuePosition === queuePosition
        && job.progressMessage === progressMessage
      ) {
        return job;
      }

      changed = true;

      return {
        ...job,
        queuePosition,
        progressMessage,
        updatedAt,
        progressEntries: appendProgressEntry(
          job.progressEntries,
          {
            message: progressMessage,
            statusLabel: "queued",
          },
          updatedAt,
        ),
      } satisfies JobRecord;
    });

    return changed ? sortByUpdatedAt(updatedJobs).slice(0, MAX_JOBS) : jobs;
  });
}