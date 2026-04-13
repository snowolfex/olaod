"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import type { ActivityEvent } from "@/lib/activity-types";
import type { AdminSessionStatus } from "@/lib/auth-types";
import type { JobHistoryAnalytics, JobHistoryBulkActions } from "@/lib/job-history";
import type { JobProgressEntry, JobRecord, JobType } from "@/lib/job-history-types";
import type { OllamaModel, OllamaRuntime, OllamaStatus } from "@/lib/ollama";
import type { SessionUser } from "@/lib/user-types";

type JobFilter = "all" | "queued" | "running" | "failed" | "cancelled" | "completed";
type JobTypeFilter = "all" | JobType;
type JobOwnershipFilter = "all" | "mine";
type JobsQuickScope = "my-queued" | "my-failed-pulls" | "pull-queue-only" | "running-pulls";
type ModelLibraryFilter = "all" | "running";
type ModelLibrarySort = "recent" | "name" | "size";
const JOB_SNAPSHOT_LIMIT_OPTIONS = [12, 24, 48] as const;
type JobSnapshotLimit = (typeof JOB_SNAPSHOT_LIMIT_OPTIONS)[number];

type JobSummary = {
  total: number;
  queued: number;
  running: number;
  failed: number;
  cancelled: number;
  completed: number;
};

type ActionSummary = {
  tone: "info" | "warning";
  message: string;
};

type JobDetailRefreshDiff = {
  compared: boolean;
  items: string[];
  newEntryStartIndex: number | null;
  newEntryCountLabel: string | null;
  percentChangeLabel: string | null;
  byteTransferChangeLabel: string | null;
  totalByteTargetChangeLabel: string | null;
  transferStateLabel: string | null;
  statusChangeLabel: string | null;
  durationChangeLabel: string | null;
  updatedAtChangeLabel: string | null;
  queuePositionChangeLabel: string | null;
};

type JobSection = {
  key: JobRecord["status"];
  title: string;
  jobs: JobRecord[];
  ownerCount: number;
};

type CollapsedSections = Record<JobRecord["status"], boolean>;

const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = {
  queued: false,
  running: false,
  failed: false,
  cancelled: true,
  succeeded: true,
};

const JOB_SECTION_PREFERENCES_STORAGE_KEY = "oload:jobs:collapsed-sections";
const SELECTED_JOB_STORAGE_KEY = "oload:jobs:selected-job";
const JOB_HINTS_STORAGE_KEY = "oload:jobs:compact-hints";
const JOB_SNAPSHOT_LIMIT_STORAGE_KEY = "oload:jobs:snapshot-limit";
const MODEL_LIBRARY_FILTER_STORAGE_KEY = "oload:models:library-filter";
const MODEL_LIBRARY_SORT_STORAGE_KEY = "oload:models:library-sort";

function getCollapsedSectionsStorageKey(userId?: string) {
  return `${JOB_SECTION_PREFERENCES_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getSelectedJobStorageKey(userId?: string) {
  return `${SELECTED_JOB_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getJobHintsStorageKey(userId?: string) {
  return `${JOB_HINTS_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getJobSnapshotLimitStorageKey(userId?: string) {
  return `${JOB_SNAPSHOT_LIMIT_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getModelLibraryFilterStorageKey(userId?: string) {
  return `${MODEL_LIBRARY_FILTER_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getModelLibrarySortStorageKey(userId?: string) {
  return `${MODEL_LIBRARY_SORT_STORAGE_KEY}:${userId ?? "guest"}`;
}

function parseCollapsedSections(value: string | null): CollapsedSections | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<Record<JobRecord["status"], unknown>>;

    return {
      queued:
        typeof parsed.queued === "boolean"
          ? parsed.queued
          : DEFAULT_COLLAPSED_SECTIONS.queued,
      running:
        typeof parsed.running === "boolean"
          ? parsed.running
          : DEFAULT_COLLAPSED_SECTIONS.running,
      failed:
        typeof parsed.failed === "boolean"
          ? parsed.failed
          : DEFAULT_COLLAPSED_SECTIONS.failed,
      cancelled:
        typeof parsed.cancelled === "boolean"
          ? parsed.cancelled
          : DEFAULT_COLLAPSED_SECTIONS.cancelled,
      succeeded:
        typeof parsed.succeeded === "boolean"
          ? parsed.succeeded
          : DEFAULT_COLLAPSED_SECTIONS.succeeded,
    };
  } catch {
    return null;
  }
}

function parseSelectedJobId(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = value.trim();
  return parsed ? parsed : null;
}

function parseCompactHints(value: string | null) {
  if (!value) {
    return false;
  }

  return value === "true";
}

function parseJobSnapshotLimit(value: string | null): JobSnapshotLimit {
  if (!value) {
    return 12;
  }

  const parsed = Number(value);

  if (JOB_SNAPSHOT_LIMIT_OPTIONS.includes(parsed as JobSnapshotLimit)) {
    return parsed as JobSnapshotLimit;
  }

  return 12;
}

function parseModelLibraryFilter(value: string | null): ModelLibraryFilter {
  return value === "running" ? "running" : "all";
}

function parseModelLibrarySort(value: string | null): ModelLibrarySort {
  if (value === "name" || value === "size") {
    return value;
  }

  return "recent";
}

function getJobRowId(jobId: string) {
  return `job-row-${jobId}`;
}

function getJobSectionHeaderId(status: JobRecord["status"]) {
  return `job-section-header-${status}`;
}

function HintButton({ label, text }: { label: string; text: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-xs font-semibold text-foreground"
      title={text}
      type="button"
    >
      ?
    </button>
  );
}

function createJobsSnapshot(jobs: JobRecord[]) {
  return JSON.stringify(
    jobs.map((job) => ({
      id: job.id,
      status: job.status,
      updatedAt: job.updatedAt,
      queuePosition: job.queuePosition,
      progressMessage: job.progressMessage,
    })),
  );
}

function setAllSectionStates(isCollapsed: boolean): CollapsedSections {
  return {
    queued: isCollapsed,
    running: isCollapsed,
    failed: isCollapsed,
    cancelled: isCollapsed,
    succeeded: isCollapsed,
  };
}

function getJobStatusClasses(status: JobRecord["status"]) {
  if (status === "succeeded") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (status === "queued") {
    return "bg-violet-100 text-violet-900";
  }

  if (status === "running") {
    return "bg-blue-100 text-blue-900";
  }

  if (status === "cancelled") {
    return "bg-zinc-200 text-zinc-800";
  }

  return "bg-amber-100 text-amber-900";
}

function getJobSectionTitle(status: JobRecord["status"]) {
  if (status === "queued") {
    return "Queued";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return "Succeeded";
}

function getJobSectionInsight(section: JobSection, currentUser: SessionUser | null) {
  if (section.key === "queued") {
    const nextJob = section.jobs.find((job) => job.queuePosition === 1) ?? section.jobs[0];

    if (!nextJob) {
      return null;
    }

    return currentUser?.displayName === nextJob.requestedBy
      ? "You are next to run"
      : `${nextJob.requestedBy} is next to run`;
  }

  if (section.key === "running") {
    return section.ownerCount > 0
      ? `${section.ownerCount} of these running jobs are yours`
      : "No running jobs in this section belong to you";
  }

  if (section.key === "failed" || section.key === "cancelled") {
    const retryablePullCount = section.jobs.filter((job) => job.type === "model.pull").length;

    if (retryablePullCount === 0) {
      return "No retryable pull jobs in this section";
    }

    return `${retryablePullCount} retryable pull job${retryablePullCount === 1 ? "" : "s"}`;
  }

  return section.ownerCount > 0
    ? `${section.ownerCount} succeeded job${section.ownerCount === 1 ? "" : "s"} belong to you`
    : "No succeeded jobs in this section belong to you";
}

type JobDetailPayload = {
  job: JobRecord;
};

const EMPTY_JOB_ANALYTICS: JobHistoryAnalytics = {
  averagePullWaitMs: null,
  averagePullWaitTrend: "unknown",
  retryQueuedCount: 0,
  retryQueuedTrend: "unknown",
  terminalFailureRate: null,
  terminalFailureRateTrend: "unknown",
  recentWindowLabel: null,
  previousWindowLabel: null,
};

const EMPTY_JOB_BULK_ACTIONS: JobHistoryBulkActions = {
  queuedPulls: 0,
  retryablePulls: 0,
};

const EMPTY_JOB_SUMMARY: JobSummary = {
  total: 0,
  queued: 0,
  running: 0,
  failed: 0,
  cancelled: 0,
  completed: 0,
};

function formatJobType(type: JobRecord["type"]) {
  return type === "model.pull" ? "Pull" : "Delete";
}

function getRevealFilterForStatus(status: JobRecord["status"]): JobFilter {
  if (status === "queued" || status === "running" || status === "failed" || status === "cancelled") {
    return status;
  }

  if (status === "succeeded") {
    return "completed";
  }

  return "all";
}

function getJobDetailRefreshDiff(previous: JobRecord | null, next: JobRecord): JobDetailRefreshDiff {
  if (!previous || previous.id !== next.id) {
    return {
      compared: false,
      items: [],
      newEntryStartIndex: null,
      newEntryCountLabel: null,
      percentChangeLabel: null,
      byteTransferChangeLabel: null,
      totalByteTargetChangeLabel: null,
      transferStateLabel: null,
      statusChangeLabel: null,
      durationChangeLabel: null,
      updatedAtChangeLabel: null,
      queuePositionChangeLabel: null,
    };
  }

  const items: string[] = [];
  let newEntryCountLabel: string | null = null;
  let percentChangeLabel: string | null = null;
  let byteTransferChangeLabel: string | null = null;
  let totalByteTargetChangeLabel: string | null = null;
  let transferStateLabel: string | null = null;
  let statusChangeLabel: string | null = null;
  let durationChangeLabel: string | null = null;
  let updatedAtChangeLabel: string | null = null;
  let queuePositionChangeLabel: string | null = null;

  if (previous.status !== next.status) {
    items.push(`Status changed from ${previous.status} to ${next.status}.`);
    statusChangeLabel = `${previous.status} -> ${next.status === "succeeded" ? "succeeded" : next.status}`;
  }

  if (previous.progressMessage !== next.progressMessage) {
    items.push("Latest progress message changed.");
  }

  if (previous.queuePosition !== next.queuePosition) {
    if (typeof previous.queuePosition === "number" && typeof next.queuePosition === "number") {
      items.push(`Queue position moved from ${previous.queuePosition} to ${next.queuePosition}.`);
      queuePositionChangeLabel = next.queuePosition === 1
        ? "Queue now next"
        : `Queue ${previous.queuePosition} -> ${next.queuePosition}`;
    } else if (typeof next.queuePosition === "number") {
      items.push(`Queue position is now ${next.queuePosition}.`);
      queuePositionChangeLabel = next.queuePosition === 1
        ? "Queue now next"
        : `Queue now ${next.queuePosition}`;
    } else if (typeof previous.queuePosition === "number") {
      items.push("Queue position cleared.");
      queuePositionChangeLabel = "Queue cleared";
    }
  }

  if (typeof previous.durationMs === "number" && typeof next.durationMs === "number" && previous.durationMs !== next.durationMs) {
    const durationDeltaMs = next.durationMs - previous.durationMs;
    const durationDirection = durationDeltaMs > 0 ? "+" : "-";
    durationChangeLabel = `Duration ${durationDirection}${formatDuration(Math.abs(durationDeltaMs))}`;
  } else if (typeof previous.durationMs !== "number" && typeof next.durationMs === "number") {
    durationChangeLabel = `Duration ${formatDuration(next.durationMs)}`;
  }

  const previousPercent = [...previous.progressEntries].reverse().find((entry) => typeof entry.percent === "number")?.percent;
  const nextPercent = [...next.progressEntries].reverse().find((entry) => typeof entry.percent === "number")?.percent;

  if (typeof previousPercent === "number" && typeof nextPercent === "number" && previousPercent !== nextPercent) {
    const percentDelta = nextPercent - previousPercent;

    if (Math.abs(percentDelta) >= 5) {
      percentChangeLabel = `Progress ${percentDelta > 0 ? "+" : ""}${percentDelta}%`;
    }
  } else if (typeof previousPercent !== "number" && typeof nextPercent === "number") {
    percentChangeLabel = `Progress ${nextPercent}%`;
  }

  const previousTransferEntry = [...previous.progressEntries].reverse().find(
    (entry) => typeof entry.completed === "number" || typeof entry.total === "number",
  );
  const nextTransferEntry = [...next.progressEntries].reverse().find(
    (entry) => typeof entry.completed === "number" || typeof entry.total === "number",
  );

  if (nextTransferEntry) {
    const previousCompleted = previousTransferEntry?.completed;
    const nextCompleted = nextTransferEntry.completed;
    const previousTotal = previousTransferEntry?.total;
    const nextTotal = nextTransferEntry.total;

    if (typeof nextCompleted === "number" && typeof nextTotal === "number") {
      if (typeof previousCompleted === "number" && nextCompleted !== previousCompleted) {
        const completedDelta = nextCompleted - previousCompleted;
        byteTransferChangeLabel = `Transfer ${completedDelta > 0 ? "+" : ""}${formatByteCount(Math.abs(completedDelta))} / ${formatByteCount(nextTotal)}`;
      } else if (typeof previousCompleted !== "number") {
        byteTransferChangeLabel = `Transfer ${formatByteCount(nextCompleted)} / ${formatByteCount(nextTotal)}`;
      }
    }

    if (typeof nextTotal === "number") {
      if (typeof previousTotal === "number" && nextTotal !== previousTotal) {
        totalByteTargetChangeLabel = `Target ${formatByteCount(previousTotal)} -> ${formatByteCount(nextTotal)}`;
        transferStateLabel = "Target revised";
      } else if (typeof previousTotal !== "number") {
        totalByteTargetChangeLabel = `Target ${formatByteCount(nextTotal)}`;
      }
    }

    if (
      typeof nextCompleted === "number"
      && typeof nextTotal === "number"
      && nextTotal > 0
      && nextCompleted >= nextTotal
      && (!(typeof previousCompleted === "number" && typeof previousTotal === "number") || previousCompleted < previousTotal)
    ) {
      transferStateLabel = "Transfer complete";
    }

    if (
      !transferStateLabel
      && previous.updatedAt !== next.updatedAt
      && typeof previousCompleted === "number"
      && typeof nextCompleted === "number"
      && typeof previousTotal === "number"
      && typeof nextTotal === "number"
      && previousCompleted === nextCompleted
      && previousTotal === nextTotal
      && previous.status === next.status
    ) {
      transferStateLabel = "Transfer idle";
    }
  }

  const newEntries = Math.max(0, next.progressEntries.length - previous.progressEntries.length);

  if (newEntries > 0) {
    items.push(`${newEntries} new timeline ${newEntries === 1 ? "entry" : "entries"} added.`);
    newEntryCountLabel = `+${newEntries} ${newEntries === 1 ? "entry" : "entries"}`;
  }

  if (items.length === 0 && previous.updatedAt !== next.updatedAt) {
    items.push("Detail timestamp advanced with no visible field changes.");
  }

  if (previous.updatedAt !== next.updatedAt) {
    const previousUpdatedAt = new Date(previous.updatedAt).getTime();
    const nextUpdatedAt = new Date(next.updatedAt).getTime();

    if (!Number.isNaN(previousUpdatedAt) && !Number.isNaN(nextUpdatedAt)) {
      const updatedAtDeltaMs = Math.max(0, nextUpdatedAt - previousUpdatedAt);
      updatedAtChangeLabel = updatedAtDeltaMs < 30_000
        ? "Update advanced"
        : `Update +${formatElapsedTime(updatedAtDeltaMs)}`;
    } else {
      updatedAtChangeLabel = "Update advanced";
    }
  }

  return {
    compared: true,
    items,
    newEntryStartIndex: newEntries > 0 ? previous.progressEntries.length : null,
    newEntryCountLabel,
    percentChangeLabel,
    byteTransferChangeLabel,
    totalByteTargetChangeLabel,
    transferStateLabel,
    statusChangeLabel,
    durationChangeLabel,
    updatedAtChangeLabel,
    queuePositionChangeLabel,
  };
}

function getScopeSummaryText(
  jobFilter: JobFilter,
  jobTypeFilter: JobTypeFilter,
  jobOwnershipFilter: JobOwnershipFilter,
) {
  return `${getJobFilterFamilyLabel(jobFilter)} across ${getJobTypeFamilyLabel(jobTypeFilter).toLowerCase()} for ${jobOwnershipFilter === "mine" ? "your jobs" : "all operators"}.`;
}

function getCurrentScopeBadgeText(
  jobFilter: JobFilter,
  jobTypeFilter: JobTypeFilter,
  jobOwnershipFilter: JobOwnershipFilter,
  jobSnapshotLimit: JobSnapshotLimit,
) {
  const statusScope = jobFilter === "all"
    ? "all statuses"
    : jobFilter === "completed"
      ? "succeeded only"
      : `${jobFilter} only`;
  const typeScope = jobTypeFilter === "all"
    ? "all jobs"
    : jobTypeFilter === "model.pull"
      ? "pulls"
      : "deletes";
  const ownershipScope = jobOwnershipFilter === "mine" ? "my jobs" : "all operators";

  return `${statusScope} · ${typeScope} · ${ownershipScope} · ${jobSnapshotLimit} jobs`;
}

function getCopyScopeText(
  jobFilter: JobFilter,
  jobTypeFilter: JobTypeFilter,
  jobOwnershipFilter: JobOwnershipFilter,
  jobSnapshotLimit: JobSnapshotLimit,
) {
  return `Jobs scope: ${getCurrentScopeBadgeText(jobFilter, jobTypeFilter, jobOwnershipFilter, jobSnapshotLimit)} (${getScopeSummaryText(jobFilter, jobTypeFilter, jobOwnershipFilter)})`;
}

function getScopeSignature(
  jobFilter: JobFilter,
  jobTypeFilter: JobTypeFilter,
  jobOwnershipFilter: JobOwnershipFilter,
  jobSnapshotLimit: JobSnapshotLimit,
) {
  return `${jobFilter}|${jobTypeFilter}|${jobOwnershipFilter}|${jobSnapshotLimit}`;
}

function getOwnershipFilterLabel(jobOwnershipFilter: JobOwnershipFilter) {
  return jobOwnershipFilter === "mine" ? "My jobs" : "All operators";
}

function getActiveJobsQuickScope(input: {
  currentUser: SessionUser | null;
  jobFilter: JobFilter;
  jobTypeFilter: JobTypeFilter;
  jobOwnershipFilter: JobOwnershipFilter;
}): JobsQuickScope | null {
  if (input.currentUser?.displayName && input.jobOwnershipFilter === "mine" && input.jobFilter === "queued" && input.jobTypeFilter === "all") {
    return "my-queued";
  }

  if (input.currentUser?.displayName && input.jobOwnershipFilter === "mine" && input.jobFilter === "failed" && input.jobTypeFilter === "model.pull") {
    return "my-failed-pulls";
  }

  if (input.jobOwnershipFilter === "all" && input.jobFilter === "queued" && input.jobTypeFilter === "model.pull") {
    return "pull-queue-only";
  }

  if (input.jobOwnershipFilter === "all" && input.jobFilter === "running" && input.jobTypeFilter === "model.pull") {
    return "running-pulls";
  }

  return null;
}

function getJobsQuickScopeLabel(value: JobsQuickScope) {
  if (value === "my-queued") {
    return "My queued";
  }

  if (value === "my-failed-pulls") {
    return "My failed pulls";
  }

  if (value === "pull-queue-only") {
    return "Pull queue only";
  }

  return "Running pulls";
}

function getSelectedJobScopeReasonLabel(input: {
  job: JobRecord;
  currentUser: SessionUser | null;
  jobFilter: JobFilter;
  jobTypeFilter: JobTypeFilter;
  jobOwnershipFilter: JobOwnershipFilter;
}) {
  if (input.jobTypeFilter !== "all" && input.job.type !== input.jobTypeFilter) {
    return input.jobTypeFilter === "model.pull"
      ? "Outside current pull-only scope"
      : "Outside current delete-only scope";
  }

  if (input.jobOwnershipFilter === "mine" && input.currentUser?.displayName !== input.job.requestedBy) {
    return "Outside your ownership scope";
  }

  if (input.jobFilter !== "all") {
    const matchesStatus = input.jobFilter === "completed"
      ? input.job.status === "succeeded"
      : input.job.status === input.jobFilter;

    if (!matchesStatus) {
      return `Outside current ${input.jobFilter === "completed" ? "succeeded" : input.jobFilter} view`;
    }
  }

  return "In current scope";
}

function getSelectedJobBulkActionLabel(job: JobRecord) {
  if (job.type !== "model.pull") {
    return "Not part of pull bulk actions";
  }

  if (job.status === "queued") {
    return "Included in queued-cancel scope";
  }

  if (job.status === "failed" || job.status === "cancelled") {
    return "Included in retry scope";
  }

  return "Outside current bulk-action states";
}

function getRetryLineageLabel(job: JobRecord | null) {
  if (!job || job.type !== "model.pull") {
    return null;
  }

  return job.progressEntries[0]?.message === "Retry queued."
    ? "Retry run"
    : "Original run";
}

function getJobTypeFamilyLabel(jobTypeFilter: JobTypeFilter) {
  if (jobTypeFilter === "model.pull") {
    return "Pull scope";
  }

  if (jobTypeFilter === "model.delete") {
    return "Delete scope";
  }

  return "Mixed types";
}

function getJobFilterFamilyLabel(jobFilter: JobFilter) {
  if (jobFilter === "queued" || jobFilter === "running") {
    return "Active view";
  }

  if (jobFilter === "failed" || jobFilter === "cancelled" || jobFilter === "completed") {
    return "Terminal view";
  }

  return "Mixed view";
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs < 1000) {
    return durationMs === 0 ? "0s" : "In progress";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No data";
  }

  return `${Math.round(value * 100)}%`;
}

function getTrendClasses(trend: JobHistoryAnalytics["averagePullWaitTrend"]) {
  if (trend === "improving") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (trend === "worsening") {
    return "bg-amber-100 text-amber-900";
  }

  if (trend === "steady") {
    return "bg-stone-200 text-stone-900";
  }

  return "bg-white text-muted";
}

function getTrendLabel(trend: JobHistoryAnalytics["averagePullWaitTrend"]) {
  if (trend === "improving") {
    return "Improving";
  }

  if (trend === "worsening") {
    return "Worsening";
  }

  if (trend === "steady") {
    return "Steady";
  }

  return "No baseline";
}

function getAnalyticsScopeText(typeFilter: JobTypeFilter, ownershipFilter: JobOwnershipFilter) {
  if (ownershipFilter === "mine") {
    if (typeFilter === "model.pull") {
      return {
        subject: "your pull jobs",
        location: "your pull-job scope",
      };
    }

    if (typeFilter === "model.delete") {
      return {
        subject: "your delete jobs",
        location: "your delete-job scope",
      };
    }

    return {
      subject: "your jobs",
      location: "your current scope",
    };
  }

  if (typeFilter === "model.pull") {
    return {
      subject: "pull jobs in this view",
      location: "the current pull-job scope",
    };
  }

  if (typeFilter === "model.delete") {
    return {
      subject: "delete jobs in this view",
      location: "the current delete-job scope",
    };
  }

  return {
    subject: "jobs in this view",
    location: "the current scope",
  };
}

function getAveragePullWaitHelpText(input: {
  typeFilter: JobTypeFilter;
  scopedSummary: JobSummary;
  averagePullWaitMs: number | null;
  trend: JobHistoryAnalytics["averagePullWaitTrend"];
  analyticsScopeText: ReturnType<typeof getAnalyticsScopeText>;
}) {
  if (input.typeFilter === "model.delete") {
    return "Delete jobs do not produce pull wait metrics.";
  }

  if (input.scopedSummary.total === 0) {
    return `No ${input.analyticsScopeText.subject} have been recorded yet.`;
  }

  if (input.averagePullWaitMs === null) {
    return "No pull in this scope has reached execution yet, so wait time is not available.";
  }

  if (input.trend === "unknown") {
    return `Mean time from pull creation to actual execution start within ${input.analyticsScopeText.location}. More history is needed for a trend.`;
  }

  return `Mean time from pull creation to actual execution start within ${input.analyticsScopeText.location}.`;
}

function getFailureRateHelpText(input: {
  scopedSummary: JobSummary;
  terminalFailureRate: number | null;
  trend: JobHistoryAnalytics["terminalFailureRateTrend"];
  analyticsScopeText: ReturnType<typeof getAnalyticsScopeText>;
}) {
  if (input.scopedSummary.total === 0) {
    return `No ${input.analyticsScopeText.subject} have been recorded yet.`;
  }

  if (input.terminalFailureRate === null) {
    return "No job in this scope has reached a terminal succeeded or failed state yet.";
  }

  if (input.trend === "unknown") {
    return `Share of terminal jobs that ended failed rather than succeeded within ${input.analyticsScopeText.location}. More history is needed for a trend.`;
  }

  return `Share of terminal jobs that ended failed rather than succeeded within ${input.analyticsScopeText.location}.`;
}

function getCountCardHelpText(input: {
  label: "queued" | "running" | "failed" | "cancelled" | "completed";
  value: number;
  scopedSummary: JobSummary;
  analyticsScopeText: ReturnType<typeof getAnalyticsScopeText>;
}) {
  if (input.scopedSummary.total === 0) {
    return `No ${input.analyticsScopeText.subject} match the current view.`;
  }

  if (input.value === 0) {
    if (input.label === "queued") {
      return `No ${input.analyticsScopeText.subject} are waiting in queue right now.`;
    }

    if (input.label === "running") {
      return `No ${input.analyticsScopeText.subject} are actively running right now.`;
    }

    if (input.label === "failed") {
      return `No ${input.analyticsScopeText.subject} have failed in the current scope.`;
    }

    if (input.label === "cancelled") {
      return `No ${input.analyticsScopeText.subject} were cancelled in the current scope.`;
    }

    return `No ${input.analyticsScopeText.subject} have succeeded in the current scope.`;
  }

  if (input.label === "queued") {
    return `${input.value} ${input.analyticsScopeText.subject} are currently queued.`;
  }

  if (input.label === "running") {
    return `${input.value} ${input.analyticsScopeText.subject} are currently running.`;
  }

  if (input.label === "failed") {
    return `${input.value} ${input.analyticsScopeText.subject} are marked failed in the current scope.`;
  }

  if (input.label === "cancelled") {
    return `${input.value} ${input.analyticsScopeText.subject} were cancelled in the current scope.`;
  }

  return `${input.value} ${input.analyticsScopeText.subject} succeeded in the current scope.`;
}

function getRetryQueuedHelpText(input: {
  scopedSummary: JobSummary;
  retryQueuedCount: number;
  trend: JobHistoryAnalytics["retryQueuedTrend"];
  analyticsScopeText: ReturnType<typeof getAnalyticsScopeText>;
}) {
  if (input.scopedSummary.total === 0) {
    return `No ${input.analyticsScopeText.subject} have been recorded yet.`;
  }

  if (input.retryQueuedCount === 0) {
    return `No retry jobs have been queued within ${input.analyticsScopeText.location}.`;
  }

  if (input.trend === "unknown") {
    return `Recent retry jobs created within ${input.analyticsScopeText.location}. More history is needed for a trend.`;
  }

  return `Recent retry jobs created within ${input.analyticsScopeText.location}.`;
}

function formatRefreshTime(value: string | null) {
  if (!value) {
    return "Not refreshed yet";
  }

  return new Date(value).toLocaleTimeString();
}

function formatRelativeTimeFromNow(value: string | null, nowMs: number) {
  if (!value) {
    return "never";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const elapsedMs = Math.max(0, nowMs - timestamp);

  if (elapsedMs < 30_000) {
    return "just now";
  }

  if (elapsedMs < 60 * 60_000) {
    return `${Math.round(elapsedMs / 60_000)}m ago`;
  }

  if (elapsedMs < 24 * 60 * 60_000) {
    return `${Math.round(elapsedMs / (60 * 60_000))}h ago`;
  }

  return `${Math.round(elapsedMs / (24 * 60 * 60_000))}d ago`;
}

function formatElapsedTime(elapsedMs: number) {
  if (elapsedMs < 30_000) {
    return "moments";
  }

  if (elapsedMs < 60 * 60_000) {
    return `${Math.round(elapsedMs / 60_000)}m`;
  }

  if (elapsedMs < 24 * 60 * 60_000) {
    return `${Math.round(elapsedMs / (60 * 60_000))}h`;
  }

  return `${Math.round(elapsedMs / (24 * 60 * 60_000))}d`;
}

function getPinnedSelectionViewTiming(
  selectedJobRefreshedAt: string | null,
  jobsChangedAt: string | null,
  jobsRefreshedAt: string | null,
) {
  if (!selectedJobRefreshedAt) {
    return null;
  }

  const selectedTimestamp = new Date(selectedJobRefreshedAt).getTime();

  if (Number.isNaN(selectedTimestamp)) {
    return null;
  }

  const changedTimestamp = jobsChangedAt ? new Date(jobsChangedAt).getTime() : Number.NaN;

  if (!Number.isNaN(changedTimestamp)) {
    const deltaMs = Math.abs(changedTimestamp - selectedTimestamp);

    if (deltaMs < 30_000) {
      return "Visible list changed at about the same time as this detail refresh.";
    }

    if (changedTimestamp > selectedTimestamp) {
      return `Visible list changed ${formatElapsedTime(deltaMs)} after this detail refresh.`;
    }

    return `This detail refresh is ${formatElapsedTime(deltaMs)} newer than the last visible-list change.`;
  }

  const refreshedTimestamp = jobsRefreshedAt ? new Date(jobsRefreshedAt).getTime() : Number.NaN;

  if (Number.isNaN(refreshedTimestamp)) {
    return null;
  }

  const deltaMs = Math.abs(refreshedTimestamp - selectedTimestamp);

  if (deltaMs < 30_000) {
    return "Visible list was refreshed at about the same time as this detail refresh.";
  }

  if (refreshedTimestamp > selectedTimestamp) {
    return `Visible list was refreshed ${formatElapsedTime(deltaMs)} after this detail refresh.`;
  }

  return `This detail refresh is ${formatElapsedTime(deltaMs)} newer than the current list snapshot.`;
}

function getRefreshStatus(value: string | null, nowMs: number) {
  if (!value) {
    return {
      label: "Unknown",
      classes: "bg-white text-muted",
    };
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return {
      label: "Unknown",
      classes: "bg-white text-muted",
    };
  }

  const elapsedMs = Math.max(0, nowMs - timestamp);

  if (elapsedMs <= 2 * 60_000) {
    return {
      label: "Fresh",
      classes: "bg-emerald-100 text-emerald-900",
    };
  }

  if (elapsedMs <= 5 * 60_000) {
    return {
      label: "Aging",
      classes: "bg-amber-100 text-amber-900",
    };
  }

  return {
    label: "Stale",
    classes: "bg-rose-100 text-rose-900",
  };
}

function getTrendWindowText(analytics: JobHistoryAnalytics) {
  if (!analytics.recentWindowLabel) {
    return "Trend window unavailable.";
  }

  if (!analytics.previousWindowLabel) {
    return `Recent window ${analytics.recentWindowLabel}. Prior window unavailable.`;
  }

  return `Recent window ${analytics.recentWindowLabel} vs prior ${analytics.previousWindowLabel}.`;
}

function getAnalyticsRecentChangeSignal(input: {
  jobsChangedAt: string | null;
  lastManualJobsRefreshAt: string | null;
  nowMs: number;
}) {
  if (!input.jobsChangedAt) {
    return null;
  }

  const changedAtMs = new Date(input.jobsChangedAt).getTime();

  if (Number.isNaN(changedAtMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, input.nowMs - changedAtMs);
  const changedSinceManualRefresh = Boolean(
    input.lastManualJobsRefreshAt
      && changedAtMs > new Date(input.lastManualJobsRefreshAt).getTime(),
  );

  if (elapsedMs <= 2 * 60_000) {
    return {
      label: "Changed just now",
      detail: "The visible jobs list changed within the last two minutes.",
      classes: "bg-amber-100 text-amber-900",
    };
  }

  if (changedSinceManualRefresh) {
    return {
      label: `Changed ${formatElapsedTime(elapsedMs)} ago`,
      detail: "The visible jobs list changed after the last manual refresh.",
      classes: "bg-amber-100 text-amber-900",
    };
  }

  if (elapsedMs <= 10 * 60_000) {
    return {
      label: `Changed ${formatElapsedTime(elapsedMs)} ago`,
      detail: "The visible jobs list changed recently in the current analytics scope.",
      classes: "bg-blue-100 text-blue-900",
    };
  }

  return {
    label: `Stable for ${formatElapsedTime(elapsedMs)}`,
    detail: "The visible jobs list has not changed recently in the current analytics scope.",
    classes: "bg-stone-200 text-stone-900",
  };
}

function formatByteCount(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let current = value / 1024;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatProgressStatusLabel(statusLabel?: string) {
  if (!statusLabel) {
    return null;
  }

  if (statusLabel === "completed") {
    return "Succeeded";
  }

  return `${statusLabel.slice(0, 1).toUpperCase()}${statusLabel.slice(1)}`;
}

function getProgressStatusChipClasses(statusLabel?: string) {
  if (statusLabel === "completed") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (statusLabel === "running") {
    return "bg-blue-100 text-blue-900";
  }

  if (statusLabel === "queued") {
    return "bg-violet-100 text-violet-900";
  }

  if (statusLabel === "failed") {
    return "bg-amber-100 text-amber-900";
  }

  if (statusLabel === "cancelled") {
    return "bg-zinc-200 text-zinc-800";
  }

  if (statusLabel === "cancelling") {
    return "bg-rose-100 text-rose-900";
  }

  return "bg-white/10 text-[#f3eadf]";
}

function getProgressEntryRowClasses(statusLabel?: string) {
  if (statusLabel === "completed") {
    return "bg-emerald-500/10 ring-1 ring-emerald-400/30";
  }

  if (statusLabel === "running") {
    return "bg-blue-500/10 ring-1 ring-blue-400/30";
  }

  if (statusLabel === "queued") {
    return "bg-violet-500/10 ring-1 ring-violet-400/30";
  }

  if (statusLabel === "failed") {
    return "bg-amber-500/10 ring-1 ring-amber-400/30";
  }

  if (statusLabel === "cancelled" || statusLabel === "cancelling") {
    return "bg-rose-500/10 ring-1 ring-rose-400/30";
  }

  return "";
}

function getSummaryCardClasses(isActive: boolean) {
  return isActive
    ? "bg-[color:color-mix(in_srgb,var(--accent)_10%,white)] ring-1 ring-[var(--accent)]"
    : "bg-white/55";
}

function getSummaryDeltaBadge(label: keyof JobSummary, delta: number) {
  if (delta === 0) {
    return {
      label: "No change",
      classes: "bg-stone-200 text-stone-900",
      detail: "No change since the last manual refresh in this scope.",
    };
  }

  const magnitudeLabel = `${delta > 0 ? "+" : "-"}${Math.abs(delta)}`;

  if (label === "completed") {
    return delta > 0
      ? {
        label: magnitudeLabel,
        classes: "bg-emerald-100 text-emerald-900",
        detail: "More jobs have succeeded since the last manual refresh in this scope.",
      }
      : {
        label: magnitudeLabel,
        classes: "bg-stone-200 text-stone-900",
        detail: "Fewer succeeded jobs are visible than at the last manual refresh in this scope.",
      };
  }

  if (label === "failed" || label === "cancelled") {
    return delta > 0
      ? {
        label: magnitudeLabel,
        classes: "bg-amber-100 text-amber-900",
        detail: `More ${label} jobs are visible since the last manual refresh in this scope.`,
      }
      : {
        label: magnitudeLabel,
        classes: "bg-emerald-100 text-emerald-900",
        detail: `Fewer ${label} jobs are visible than at the last manual refresh in this scope.`,
      };
  }

  return delta > 0
    ? {
      label: magnitudeLabel,
      classes: "bg-blue-100 text-blue-900",
      detail: `More ${label} jobs are visible since the last manual refresh in this scope.`,
    }
    : {
      label: magnitudeLabel,
      classes: "bg-stone-200 text-stone-900",
      detail: `Fewer ${label} jobs are visible than at the last manual refresh in this scope.`,
    };
}

function getSummaryKeyForSectionStatus(status: JobRecord["status"]): keyof JobSummary {
  if (status === "succeeded") {
    return "completed";
  }

  return status;
}

function getJobSectionDeltaInsight(status: JobRecord["status"], delta: number) {
  const sectionLabel = status === "succeeded" ? "succeeded" : status;

  if (delta === 0) {
    return `No net ${sectionLabel} change since the last manual refresh.`;
  }

  const magnitude = Math.abs(delta);
  const direction = delta > 0 ? "more" : "fewer";

  return `${magnitude} ${direction} ${sectionLabel} job${magnitude === 1 ? "" : "s"} than at the last manual refresh.`;
}

function parseQueuedPosition(entry: JobProgressEntry) {
  if (entry.statusLabel !== "queued") {
    return null;
  }

  if (entry.message === "Queued. Next to run.") {
    return 1;
  }

  const match = entry.message.match(/Queued in position (\d+)\./);
  return match ? Number(match[1]) : null;
}

function getQueueMovementIndicator(entries: JobProgressEntry[], index: number) {
  const currentPosition = parseQueuedPosition(entries[index]);

  if (currentPosition === null) {
    return null;
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousPosition = parseQueuedPosition(entries[previousIndex]);

    if (previousPosition === null) {
      continue;
    }

    if (currentPosition < previousPosition) {
      if (currentPosition === 1) {
        return {
          label: "Now next",
          detail: `Moved earlier from position ${previousPosition} to next-to-run.`,
          classes: "bg-emerald-100 text-emerald-900",
        };
      }

      return {
        label: "Moved earlier",
        detail: `Moved earlier from position ${previousPosition} to ${currentPosition}.`,
        classes: "bg-emerald-100 text-emerald-900",
      };
    }

    if (currentPosition > previousPosition) {
      return {
        label: "Moved later",
        detail: `Moved later from position ${previousPosition} to ${currentPosition}.`,
        classes: "bg-amber-100 text-amber-900",
      };
    }

    return null;
  }

  return currentPosition === 1
    ? {
        label: "Next to run",
        detail: "Entered the queue as next-to-run.",
        classes: "bg-emerald-100 text-emerald-900",
      }
    : null;
}

function getLatestQueueMovementSummary(entries: JobProgressEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const indicator = getQueueMovementIndicator(entries, index);

    if (indicator) {
      return indicator.detail;
    }
  }

  return null;
}

function renderProgressMeta(entry: JobProgressEntry) {
  const parts: string[] = [];
  const completed = formatByteCount(entry.completed);
  const total = formatByteCount(entry.total);

  if (typeof entry.percent === "number") {
    parts.push(`${entry.percent}%`);
  }

  if (completed && total) {
    parts.push(`${completed} / ${total}`);
  }

  return parts.filter(Boolean).join(" · ");
}

function summarizeVisibleJobs(jobs: JobRecord[]): JobSummary {
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    cancelled: jobs.filter((job) => job.status === "cancelled").length,
    completed: jobs.filter((job) => job.status === "succeeded").length,
  };
}

type ModelOperationsPanelProps = {
  currentUser: SessionUser | null;
  fetchedAt: string;
  isReachable: boolean;
  models: OllamaModel[];
  runningModels: OllamaRuntime[];
  runningCount: number;
  userCount: number;
  version?: string;
  onStatusChange: (status: OllamaStatus) => void;
};

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function ModelOperationsPanel({
  currentUser,
  fetchedAt,
  isReachable,
  models,
  runningModels,
  runningCount,
  userCount,
  version,
  onStatusChange,
}: ModelOperationsPanelProps) {
  const collapsedSectionsStorageKey = getCollapsedSectionsStorageKey(currentUser?.id);
  const selectedJobStorageKey = getSelectedJobStorageKey(currentUser?.id);
  const jobHintsStorageKey = getJobHintsStorageKey(currentUser?.id);
  const jobSnapshotLimitStorageKey = getJobSnapshotLimitStorageKey(currentUser?.id);
  const modelLibraryFilterStorageKey = getModelLibraryFilterStorageKey(currentUser?.id);
  const modelLibrarySortStorageKey = getModelLibrarySortStorageKey(currentUser?.id);
  const [pullName, setPullName] = useState("");
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<JobTypeFilter>("all");
  const [jobOwnershipFilter, setJobOwnershipFilter] = useState<JobOwnershipFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [activePullJobId, setActivePullJobId] = useState<string | null>(null);
  const [jobSummary, setJobSummary] = useState<JobSummary>(EMPTY_JOB_SUMMARY);
  const [scopedJobSummary, setScopedJobSummary] = useState<JobSummary>(EMPTY_JOB_SUMMARY);
  const [jobAnalytics, setJobAnalytics] = useState<JobHistoryAnalytics>(EMPTY_JOB_ANALYTICS);
  const [jobBulkActions, setJobBulkActions] = useState<JobHistoryBulkActions>(EMPTY_JOB_BULK_ACTIONS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingJobDetail, setIsLoadingJobDetail] = useState(false);
  const [isCancellingJob, setIsCancellingJob] = useState(false);
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [isReorderingJob, setIsReorderingJob] = useState(false);
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false);
  const [confirmBulkRetry, setConfirmBulkRetry] = useState(false);
  const [actionSummary, setActionSummary] = useState<ActionSummary | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(DEFAULT_COLLAPSED_SECTIONS);
  const [loadedCollapsedSectionsKey, setLoadedCollapsedSectionsKey] = useState<string | null>(null);
  const [loadedSelectedJobKey, setLoadedSelectedJobKey] = useState<string | null>(null);
  const [compactJobHints, setCompactJobHints] = useState(false);
  const [loadedJobHintsKey, setLoadedJobHintsKey] = useState<string | null>(null);
  const [jobSnapshotLimit, setJobSnapshotLimit] = useState<JobSnapshotLimit>(12);
  const [loadedJobSnapshotLimitKey, setLoadedJobSnapshotLimitKey] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [modelLibraryFilter, setModelLibraryFilter] = useState<ModelLibraryFilter>("all");
  const [modelLibrarySort, setModelLibrarySort] = useState<ModelLibrarySort>("recent");
  const [loadedModelLibraryFilterKey, setLoadedModelLibraryFilterKey] = useState<string | null>(null);
  const [loadedModelLibrarySortKey, setLoadedModelLibrarySortKey] = useState<string | null>(null);
  const [lastManualScopedJobSummary, setLastManualScopedJobSummary] = useState<JobSummary | null>(null);
  const [lastManualScopeSignature, setLastManualScopeSignature] = useState<string | null>(null);
  const [selectedJobScopeSignature, setSelectedJobScopeSignature] = useState<string | null>(null);
  const [timelineEntryFilter, setTimelineEntryFilter] = useState<"all" | "new" | "changed">("all");
  const [jobDetailRefreshDiff, setJobDetailRefreshDiff] = useState<JobDetailRefreshDiff>({
    compared: false,
    items: [],
    newEntryStartIndex: null,
    newEntryCountLabel: null,
    percentChangeLabel: null,
    byteTransferChangeLabel: null,
    totalByteTargetChangeLabel: null,
    transferStateLabel: null,
    statusChangeLabel: null,
    durationChangeLabel: null,
    updatedAtChangeLabel: null,
    queuePositionChangeLabel: null,
  });
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [pendingRevealJobId, setPendingRevealJobId] = useState<string | null>(null);
  const [selectedJobRefreshedAt, setSelectedJobRefreshedAt] = useState<string | null>(null);
  const [jobsRefreshedAt, setJobsRefreshedAt] = useState<string | null>(null);
  const [jobsChangedAt, setJobsChangedAt] = useState<string | null>(null);
  const [lastManualJobsRefreshAt, setLastManualJobsRefreshAt] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [pullLog, setPullLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [auth, setAuth] = useState<AdminSessionStatus>({
    authEnabled: false,
    authenticated: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const jobsSnapshotRef = useRef<string>(createJobsSnapshot([]));
  const jobSectionHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const jobRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    void refreshActivity();
  }, [auth.authEnabled, auth.authenticated]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!selectedJobRefreshedAt && !jobsRefreshedAt && !jobsChangedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [jobsChangedAt, jobsRefreshedAt, selectedJobRefreshedAt]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(collapsedSectionsStorageKey);
      setCollapsedSections(
        parseCollapsedSections(storedValue) ?? DEFAULT_COLLAPSED_SECTIONS,
      );
    } catch {
      setCollapsedSections(DEFAULT_COLLAPSED_SECTIONS);
    } finally {
      setLoadedCollapsedSectionsKey(collapsedSectionsStorageKey);
    }
  }, [collapsedSectionsStorageKey]);

  useEffect(() => {
    if (loadedCollapsedSectionsKey !== collapsedSectionsStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(
        collapsedSectionsStorageKey,
        JSON.stringify(collapsedSections),
      );
    } catch {
      // Ignore storage failures and keep the in-memory preference state.
    }
  }, [collapsedSections, collapsedSectionsStorageKey, loadedCollapsedSectionsKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(selectedJobStorageKey);
      setSelectedJobId(parseSelectedJobId(storedValue));
    } catch {
      setSelectedJobId(null);
    } finally {
      setLoadedSelectedJobKey(selectedJobStorageKey);
    }
  }, [selectedJobStorageKey]);

  useEffect(() => {
    if (loadedSelectedJobKey !== selectedJobStorageKey) {
      return;
    }

    try {
      if (selectedJobId) {
        window.localStorage.setItem(selectedJobStorageKey, selectedJobId);
        return;
      }

      window.localStorage.removeItem(selectedJobStorageKey);
    } catch {
      // Ignore storage failures and keep the in-memory selection state.
    }
  }, [loadedSelectedJobKey, selectedJobId, selectedJobStorageKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(jobHintsStorageKey);
      setCompactJobHints(parseCompactHints(storedValue));
    } catch {
      setCompactJobHints(false);
    } finally {
      setLoadedJobHintsKey(jobHintsStorageKey);
    }
  }, [jobHintsStorageKey]);

  useEffect(() => {
    if (loadedJobHintsKey !== jobHintsStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(jobHintsStorageKey, String(compactJobHints));
    } catch {
      // Ignore storage failures and keep the in-memory hint mode state.
    }
  }, [compactJobHints, jobHintsStorageKey, loadedJobHintsKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(jobSnapshotLimitStorageKey);
      setJobSnapshotLimit(parseJobSnapshotLimit(storedValue));
    } catch {
      setJobSnapshotLimit(12);
    } finally {
      setLoadedJobSnapshotLimitKey(jobSnapshotLimitStorageKey);
    }
  }, [jobSnapshotLimitStorageKey]);

  useEffect(() => {
    if (loadedJobSnapshotLimitKey !== jobSnapshotLimitStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(jobSnapshotLimitStorageKey, String(jobSnapshotLimit));
    } catch {
      // Ignore storage failures and keep the in-memory snapshot limit.
    }
  }, [jobSnapshotLimit, jobSnapshotLimitStorageKey, loadedJobSnapshotLimitKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(modelLibraryFilterStorageKey);
      setModelLibraryFilter(parseModelLibraryFilter(storedValue));
    } catch {
      setModelLibraryFilter("all");
    } finally {
      setLoadedModelLibraryFilterKey(modelLibraryFilterStorageKey);
    }
  }, [modelLibraryFilterStorageKey]);

  useEffect(() => {
    if (loadedModelLibraryFilterKey !== modelLibraryFilterStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(modelLibraryFilterStorageKey, modelLibraryFilter);
    } catch {
      // Ignore storage failures and keep the in-memory model filter state.
    }
  }, [loadedModelLibraryFilterKey, modelLibraryFilter, modelLibraryFilterStorageKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(modelLibrarySortStorageKey);
      setModelLibrarySort(parseModelLibrarySort(storedValue));
    } catch {
      setModelLibrarySort("recent");
    } finally {
      setLoadedModelLibrarySortKey(modelLibrarySortStorageKey);
    }
  }, [modelLibrarySortStorageKey]);

  useEffect(() => {
    if (loadedModelLibrarySortKey !== modelLibrarySortStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(modelLibrarySortStorageKey, modelLibrarySort);
    } catch {
      // Ignore storage failures and keep the in-memory model sort state.
    }
  }, [loadedModelLibrarySortKey, modelLibrarySort, modelLibrarySortStorageKey]);

  const refreshJobsEvent = useEffectEvent(() => {
    void refreshJobs();
  });

  const refreshSelectedJobEvent = useEffectEvent(() => {
    void refreshSelectedJob();
  });

  useEffect(() => {
    refreshJobsEvent();
  }, [
    auth.authEnabled,
    auth.authenticated,
    currentUser?.id,
    currentUser?.role,
    jobFilter,
    jobTypeFilter,
    jobOwnershipFilter,
    jobSnapshotLimit,
  ]);

  async function refreshAuth() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const status = (await response.json()) as AdminSessionStatus;
      setAuth(status);
    } catch {
      setAuth({ authEnabled: false, authenticated: false });
    }
  }

  async function refreshActivity() {
    setIsLoadingActivity(true);

    try {
      const response = await fetch("/api/admin/activity", { cache: "no-store" });

      if (!response.ok) {
        if (response.status === 401) {
          setActivityEvents([]);
          return;
        }

        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { events: ActivityEvent[] };
      setActivityEvents(payload.events.slice(0, 12));
    } catch {
      setActivityEvents([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }

  async function refreshJobs(source: "manual" | "system" = "system") {
    setIsLoadingJobs(true);
    const requestScopeSignature = getScopeSignature(
      jobFilter,
      jobTypeFilter,
      jobOwnershipFilter,
      jobSnapshotLimit,
    );

    if (source === "manual") {
      setLastManualJobsRefreshAt(new Date().toISOString());
    }

    try {
      const params = new URLSearchParams({
        limit: String(jobSnapshotLimit),
        status: jobFilter,
        type: jobTypeFilter,
      });
      if (jobOwnershipFilter === "mine" && currentUser?.displayName) {
        params.set("requestedBy", currentUser.displayName);
      }
      const response = await fetch(`/api/admin/jobs?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 401) {
          const emptySnapshot = createJobsSnapshot([]);

          if (jobsSnapshotRef.current !== emptySnapshot) {
            jobsSnapshotRef.current = emptySnapshot;
            setJobsChangedAt(new Date().toISOString());
          }

          setJobs([]);
          setJobSummary(EMPTY_JOB_SUMMARY);
          setScopedJobSummary(EMPTY_JOB_SUMMARY);
          setJobAnalytics(EMPTY_JOB_ANALYTICS);
          setJobBulkActions(EMPTY_JOB_BULK_ACTIONS);
          setJobsRefreshedAt(new Date().toISOString());
          return;
        }

        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        jobs: JobRecord[];
        summary: JobSummary;
        scopedSummary: JobSummary;
        analytics: JobHistoryAnalytics;
        bulkActions: JobHistoryBulkActions;
      };
      const nextSnapshot = createJobsSnapshot(payload.jobs);

      if (jobsSnapshotRef.current !== nextSnapshot) {
        jobsSnapshotRef.current = nextSnapshot;
        setJobsChangedAt(new Date().toISOString());
      }

      setJobs(payload.jobs);
      setJobSummary(payload.summary);
      setScopedJobSummary(payload.scopedSummary);
      setJobAnalytics(payload.analytics);
      setJobBulkActions(payload.bulkActions);
      if (source === "manual") {
        setLastManualScopedJobSummary(payload.scopedSummary);
        setLastManualScopeSignature(requestScopeSignature);
      }
      setJobsRefreshedAt(new Date().toISOString());
    } catch {
      const emptySnapshot = createJobsSnapshot([]);

      if (jobsSnapshotRef.current !== emptySnapshot) {
        jobsSnapshotRef.current = emptySnapshot;
        setJobsChangedAt(new Date().toISOString());
      }

      setJobs([]);
      setJobSummary(EMPTY_JOB_SUMMARY);
      setScopedJobSummary(EMPTY_JOB_SUMMARY);
      setJobAnalytics(EMPTY_JOB_ANALYTICS);
      setJobBulkActions(EMPTY_JOB_BULK_ACTIONS);
      setJobsRefreshedAt(null);
    } finally {
      setIsLoadingJobs(false);
    }
  }

  async function refreshSelectedJob(jobId = selectedJobId) {
    if (!jobId) {
      setSelectedJob(null);
      setSelectedJobRefreshedAt(null);
      setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
      return;
    }

    setIsLoadingJobDetail(true);

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setSelectedJob(null);
          setSelectedJobRefreshedAt(null);
          setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
          return;
        }

        if (response.status === 404) {
          setSelectedJob(null);
          setSelectedJobId(null);
          setSelectedJobRefreshedAt(null);
          setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
          return;
        }

        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as JobDetailPayload;
      const previousJob = selectedJob?.id === payload.job.id ? selectedJob : null;
      setSelectedJob(payload.job);
      setSelectedJobRefreshedAt(new Date().toISOString());
      setJobDetailRefreshDiff(getJobDetailRefreshDiff(previousJob, payload.job));
    } catch {
      setSelectedJob(null);
      setSelectedJobRefreshedAt(null);
      setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
    } finally {
      setIsLoadingJobDetail(false);
    }
  }

  async function copyCurrentScope() {
    const scopeText = getCopyScopeText(jobFilter, jobTypeFilter, jobOwnershipFilter, jobSnapshotLimit);

    try {
      await navigator.clipboard.writeText(scopeText);
      setActionSummary({
        tone: "info",
        message: "Copied the current jobs scope to the clipboard.",
      });
    } catch {
      setActionSummary({
        tone: "warning",
        message: `Unable to copy automatically. Scope: ${scopeText}`,
      });
    }
  }

  async function cancelSelectedJob() {
    if (!selectedJob || selectedJob.type !== "model.pull") {
      return;
    }

    setIsCancellingJob(true);
    setError(null);
    setActionSummary(null);

    try {
      const response = await fetch(`/api/admin/jobs/${selectedJob.id}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      if (activePullJobId === selectedJob.id) {
        abortControllerRef.current?.abort();
        setActivePullJobId(null);
        startTransition(() => {
          setPullLog((current) => [...current, "Cancellation requested."]);
        });
      }

      await refreshActivity();
      await refreshJobs();
      await refreshSelectedJob(selectedJob.id);
      setActionSummary({
        tone: "warning",
        message:
          selectedJob.status === "queued"
            ? `Cancelled queued pull job for ${selectedJob.target}.`
            : `Cancellation requested for running pull job ${selectedJob.target}.`,
      });
    } catch (jobError) {
      setError(
        jobError instanceof Error ? jobError.message : "Unable to cancel the job.",
      );
    } finally {
      setIsCancellingJob(false);
    }
  }

  async function cancelQueuedPullJobs() {
    setIsRunningBulkAction(true);
    setError(null);
    setConfirmBulkCancel(false);
    setActionSummary(null);

    try {
      const response = await fetch("/api/admin/jobs/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel-queued-pulls",
          requestedBy: jobOwnershipFilter === "mine" ? currentUser?.displayName : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { cancelledCount: number };

      if (selectedJob?.status === "queued") {
        await refreshSelectedJob(selectedJob.id);
      }

      await refreshActivity();
      await refreshJobs();
      setActionSummary({
        tone: payload.cancelledCount > 0 ? "warning" : "info",
        message:
          payload.cancelledCount > 0
            ? `Cancelled ${payload.cancelledCount} queued pull job${payload.cancelledCount === 1 ? "" : "s"}${jobOwnershipFilter === "mine" ? " in your scope" : ""}.`
            : `No queued pull jobs${jobOwnershipFilter === "mine" ? " in your scope" : ""} were waiting to be cancelled.`,
      });
    } catch (jobError) {
      setError(
        jobError instanceof Error
          ? jobError.message
          : "Unable to run the bulk action.",
      );
    } finally {
      setIsRunningBulkAction(false);
    }
  }

  async function retryFailedPullJobs() {
    setIsRunningBulkAction(true);
    setError(null);
    setConfirmBulkRetry(false);
    setActionSummary(null);

    try {
      const response = await fetch("/api/admin/jobs/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "retry-failed-pulls",
          requestedBy: jobOwnershipFilter === "mine" ? currentUser?.displayName : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { retriedCount: number };

      await refreshActivity();
      await refreshJobs();
      setActionSummary({
        tone: payload.retriedCount > 0 ? "info" : "warning",
        message:
          payload.retriedCount > 0
            ? `Queued ${payload.retriedCount} failed pull job${payload.retriedCount === 1 ? "" : "s"}${jobOwnershipFilter === "mine" ? " in your scope" : ""} for retry.`
            : `No failed pull jobs${jobOwnershipFilter === "mine" ? " in your scope" : ""} were available to retry.`,
      });
    } catch (jobError) {
      setError(
        jobError instanceof Error
          ? jobError.message
          : "Unable to retry failed pull jobs.",
      );
    } finally {
      setIsRunningBulkAction(false);
    }
  }

  async function reorderQueuedJob(job: JobRecord, direction: "up" | "down") {
    if (job.type !== "model.pull" || job.status !== "queued") {
      return;
    }

    setIsReorderingJob(true);
    setError(null);
    setActionSummary(null);

    try {
      const response = await fetch(`/api/admin/jobs/${job.id}/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ direction }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await refreshActivity();
      await refreshJobs();
      if (selectedJobId === job.id) {
        await refreshSelectedJob(job.id);
      }
      setActionSummary({
        tone: "info",
        message:
          direction === "up"
            ? `Moved ${job.target} earlier in the pull queue.`
            : `Moved ${job.target} later in the pull queue.`,
      });
    } catch (jobError) {
      setError(
        jobError instanceof Error
          ? jobError.message
          : "Unable to reorder the queued job.",
      );
    } finally {
      setIsReorderingJob(false);
    }
  }

  async function retrySelectedJobOnServer() {
    if (!selectedJob || selectedJob.type !== "model.pull") {
      return;
    }

    setIsPulling(true);
    setError(null);
    setActionSummary(null);

    try {
      const response = await fetch(`/api/admin/jobs/${selectedJob.id}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { jobId: string };
      setSelectedJobId(payload.jobId);
      startTransition(() => {
        setPullLog((current) => [
          `Retry queued for ${selectedJob.target}.`,
          ...current.slice(0, 24),
        ]);
      });
      await refreshActivity();
      await refreshJobs();
      await refreshSelectedJob(payload.jobId);
      setActionSummary({
        tone: "info",
        message: `Queued retry for ${selectedJob.target}.`,
      });
    } catch (jobError) {
      setError(
        jobError instanceof Error ? jobError.message : "Unable to retry the job.",
      );
    } finally {
      setIsPulling(false);
    }
  }

  function toggleSection(status: JobRecord["status"]) {
    setCollapsedSections((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }

  function collapseAllSections() {
    setCollapsedSections(setAllSectionStates(true));
  }

  function expandAllSections() {
    setCollapsedSections(setAllSectionStates(false));
  }

  function focusJobsKeyboardTarget(targetId: string) {
    if (targetId.startsWith("job-section-header-")) {
      jobSectionHeaderRefs.current[targetId]?.focus();
      return;
    }

    jobRowRefs.current[targetId]?.focus();
  }

  function focusJobsKeyboardTargetByOffset(currentId: string, offset: number) {
    const currentIndex = jobsKeyboardFocusOrder.indexOf(currentId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = currentIndex + offset;

    if (nextIndex < 0 || nextIndex >= jobsKeyboardFocusOrder.length) {
      return;
    }

    focusJobsKeyboardTarget(jobsKeyboardFocusOrder[nextIndex]);
  }

  function handleJobSectionHeaderKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    status: JobRecord["status"],
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusJobsKeyboardTargetByOffset(getJobSectionHeaderId(status), 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusJobsKeyboardTargetByOffset(getJobSectionHeaderId(status), -1);
      return;
    }

    if (event.key === "ArrowRight" && collapsedSections[status]) {
      event.preventDefault();
      toggleSection(status);
      return;
    }

    if (event.key === "ArrowLeft" && !collapsedSections[status]) {
      event.preventDefault();
      toggleSection(status);
    }
  }

  function handleJobRowKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    job: JobRecord,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setSelectedJobId(job.id);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusJobsKeyboardTargetByOffset(getJobRowId(job.id), 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusJobsKeyboardTargetByOffset(getJobRowId(job.id), -1);
    }
  }

  function shouldIgnoreJobsPanelShortcut(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName;

    return tagName === "INPUT"
      || tagName === "TEXTAREA"
      || tagName === "SELECT"
      || target.isContentEditable;
  }

  function handleJobsPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || shouldIgnoreJobsPanelShortcut(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "r" && !isLoadingJobs) {
      event.preventDefault();
      void refreshJobs("manual");
      return;
    }

    if (key === "d" && selectedJobId && !isLoadingJobDetail) {
      event.preventDefault();
      void refreshSelectedJob();
      return;
    }

    if (key === "j" && selectedJob) {
      event.preventDefault();

      if (selectedJobIsVisibleInList) {
        jumpToSelectedJobInList();
        return;
      }

      revealSelectedJobInList();
      return;
    }

    if (event.key === "Escape") {
      if (!selectedJobId && !confirmBulkCancel && !confirmBulkRetry) {
        return;
      }

      event.preventDefault();
      setSelectedJobId(null);
      setConfirmBulkCancel(false);
      setConfirmBulkRetry(false);
    }
  }

  function jumpToSelectedJobInList() {
    if (!selectedJob || !selectedJobIsVisibleInList) {
      return;
    }

    setCollapsedSections((current) => ({
      ...current,
      [selectedJob.status]: false,
    }));

    window.requestAnimationFrame(() => {
      const selectedRow = document.getElementById(getJobRowId(selectedJob.id));
      selectedRow?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedJobId(selectedJob.id);

      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedJobId(null);
        highlightTimeoutRef.current = null;
      }, 1800);
    });
  }

  function revealSelectedJobInList() {
    if (!selectedJob) {
      return;
    }

    if (selectedJobIsVisibleInList) {
      jumpToSelectedJobInList();
      return;
    }

    setPendingRevealJobId(selectedJob.id);
    setJobTypeFilter(selectedJob.type);
    setJobFilter(getRevealFilterForStatus(selectedJob.status));
    setJobOwnershipFilter(
      currentUser?.displayName && currentUser.displayName === selectedJob.requestedBy
        ? "mine"
        : "all",
    );
    setActionSummary(null);
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password.trim() || isAuthenticating) {
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await refreshActivity();
      setPassword("");
      await refreshAuth();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to authenticate admin session.",
      );
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function logout() {
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await refreshActivity();
      await refreshAuth();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to clear admin session.",
      );
    }
  }

  async function refreshStatus() {
    setError(null);
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/ollama/models", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const status = (await response.json()) as OllamaStatus;
      onStatusChange(status);
      await refreshActivity();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to refresh model status.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function removeModel(name: string) {
    setBusyModel(name);
    setError(null);

    try {
      const response = await fetch("/api/ollama/models", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          await refreshAuth();
        }

        throw new Error(await readErrorMessage(response));
      }

      await refreshStatus();
      await refreshActivity();
      await refreshJobs();
      await refreshSelectedJob();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to delete the model.",
      );
    } finally {
      setBusyModel(null);
    }
  }

  async function startPull(name: string) {
    const modelName = name.trim();

    if (!modelName || isPulling) {
      return;
    }

    const controller = new AbortController();

    abortControllerRef.current = controller;
    setError(null);
    setIsPulling(true);
    setPullLog([`Starting pull for ${modelName}...`]);

    try {
      const response = await fetch("/api/ollama/models/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          await refreshAuth();
        }

        throw new Error(await readErrorMessage(response));
      }

      const jobId = response.headers.get("X-Oload-Job-Id");

      if (jobId) {
        setActivePullJobId(jobId);
        setSelectedJobId(jobId);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed) {
            continue;
          }

          startTransition(() => {
            setPullLog((current) => [...current, trimmed]);
          });
        }
      }

      const tail = buffer.trim();

      if (tail) {
        startTransition(() => {
          setPullLog((current) => [...current, tail]);
        });
      }

      await refreshStatus();
      await refreshActivity();
      await refreshJobs();
      await refreshSelectedJob();
      setPullName("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        startTransition(() => {
          setPullLog((current) => [...current, "Pull cancelled."]);
        });
        return;
      }

      setError(
        error instanceof Error ? error.message : "Unable to pull the model.",
      );
    } finally {
      abortControllerRef.current = null;
      setActivePullJobId(null);
      setIsPulling(false);
    }
  }

  async function pullModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await startPull(pullName);
  }

  function cancelPull() {
    abortControllerRef.current?.abort();
  }

  const adminLocked = currentUser?.role === "admin"
    ? false
    : userCount > 0
      ? true
      : auth.authEnabled && !auth.authenticated;
  const adminStatusLabel = auth.authEnabled
    ? auth.authenticated
      ? "Admin session active"
      : "Admin locked"
    : currentUser?.role === "admin"
      ? "Local admin active"
      : "Auth disabled";
  const analyticsScopeText = getAnalyticsScopeText(jobTypeFilter, jobOwnershipFilter);
  const averagePullWaitHelpText = getAveragePullWaitHelpText({
    typeFilter: jobTypeFilter,
    scopedSummary: scopedJobSummary,
    averagePullWaitMs: jobAnalytics.averagePullWaitMs,
    trend: jobAnalytics.averagePullWaitTrend,
    analyticsScopeText,
  });
  const failureRateHelpText = getFailureRateHelpText({
    scopedSummary: scopedJobSummary,
    terminalFailureRate: jobAnalytics.terminalFailureRate,
    trend: jobAnalytics.terminalFailureRateTrend,
    analyticsScopeText,
  });
  const trendWindowText = getTrendWindowText(jobAnalytics);
  const retryQueuedHelpText = getRetryQueuedHelpText({
    scopedSummary: scopedJobSummary,
    retryQueuedCount: jobAnalytics.retryQueuedCount,
    trend: jobAnalytics.retryQueuedTrend,
    analyticsScopeText,
  });
  const selectedJobRefreshRelativeTime = formatRelativeTimeFromNow(
    selectedJobRefreshedAt,
    currentTimeMs,
  );
  const selectedJobRefreshStatus = getRefreshStatus(selectedJobRefreshedAt, currentTimeMs);
  const jobsRefreshRelativeTime = formatRelativeTimeFromNow(jobsRefreshedAt, currentTimeMs);
  const jobsRefreshStatus = getRefreshStatus(jobsRefreshedAt, currentTimeMs);
  const jobsChangedRelativeTime = formatRelativeTimeFromNow(jobsChangedAt, currentTimeMs);
  const lastManualJobsRefreshRelativeTime = formatRelativeTimeFromNow(
    lastManualJobsRefreshAt,
    currentTimeMs,
  );
  const jobsChangedSinceManualRefresh = Boolean(
    jobsChangedAt
    && lastManualJobsRefreshAt
    && new Date(jobsChangedAt).getTime() > new Date(lastManualJobsRefreshAt).getTime(),
  );
  const currentScopeSignature = getScopeSignature(jobFilter, jobTypeFilter, jobOwnershipFilter, jobSnapshotLimit);
  const analyticsRecentChangeSignal = getAnalyticsRecentChangeSignal({
    jobsChangedAt,
    lastManualJobsRefreshAt,
    nowMs: currentTimeMs,
  });
  const manualSummaryBaselineMatchesScope = lastManualScopeSignature === currentScopeSignature;
  const queuedSummaryDelta = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? scopedJobSummary.queued - lastManualScopedJobSummary.queued
    : null;
  const runningSummaryDelta = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? scopedJobSummary.running - lastManualScopedJobSummary.running
    : null;
  const failedSummaryDelta = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? scopedJobSummary.failed - lastManualScopedJobSummary.failed
    : null;
  const cancelledSummaryDelta = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? scopedJobSummary.cancelled - lastManualScopedJobSummary.cancelled
    : null;
  const completedSummaryDelta = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? scopedJobSummary.completed - lastManualScopedJobSummary.completed
    : null;
  const queuedSummaryDeltaBadge = queuedSummaryDelta === null ? null : getSummaryDeltaBadge("queued", queuedSummaryDelta);
  const runningSummaryDeltaBadge = runningSummaryDelta === null ? null : getSummaryDeltaBadge("running", runningSummaryDelta);
  const failedSummaryDeltaBadge = failedSummaryDelta === null ? null : getSummaryDeltaBadge("failed", failedSummaryDelta);
  const cancelledSummaryDeltaBadge = cancelledSummaryDelta === null ? null : getSummaryDeltaBadge("cancelled", cancelledSummaryDelta);
  const completedSummaryDeltaBadge = completedSummaryDelta === null ? null : getSummaryDeltaBadge("completed", completedSummaryDelta);
  const queuedCountHelpText = getCountCardHelpText({
    label: "queued",
    value: scopedJobSummary.queued,
    scopedSummary: scopedJobSummary,
    analyticsScopeText,
  });
  const runningCountHelpText = getCountCardHelpText({
    label: "running",
    value: scopedJobSummary.running,
    scopedSummary: scopedJobSummary,
    analyticsScopeText,
  });
  const failedCountHelpText = getCountCardHelpText({
    label: "failed",
    value: scopedJobSummary.failed,
    scopedSummary: scopedJobSummary,
    analyticsScopeText,
  });
  const cancelledCountHelpText = getCountCardHelpText({
    label: "cancelled",
    value: scopedJobSummary.cancelled,
    scopedSummary: scopedJobSummary,
    analyticsScopeText,
  });
  const completedCountHelpText = getCountCardHelpText({
    label: "completed",
    value: scopedJobSummary.completed,
    scopedSummary: scopedJobSummary,
    analyticsScopeText,
  });
  const ownerScopedJobSummary = currentUser?.displayName
    ? summarizeVisibleJobs(jobs.filter((job) => job.requestedBy === currentUser.displayName))
    : null;
  const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
  const selectedJobIsActive = selectedJob?.status === "queued" || selectedJob?.status === "running";
  const selectedJobIsVisibleInList = selectedJob
    ? jobs.some((job) => job.id === selectedJob.id)
    : false;
  const selectedJobNeedsManualRefresh = Boolean(
    selectedJob
    && hasActiveJobs
    && selectedJobRefreshStatus.label === "Stale",
  );
  const selectedJobLatestQueueMovement = selectedJob
    ? getLatestQueueMovementSummary(selectedJob.progressEntries)
    : null;
  const selectedJobRetryLineageLabel = getRetryLineageLabel(selectedJob);
  const selectedJobOwnershipLabel = selectedJob
    ? currentUser?.displayName === selectedJob.requestedBy
      ? "Your job"
      : "Other operator"
    : null;
  const activeJobsQuickScope = getActiveJobsQuickScope({
    currentUser,
    jobFilter,
    jobTypeFilter,
    jobOwnershipFilter,
  });
  const canRunBulkPullActions = jobTypeFilter !== "model.delete";
  const normalizedModelSearch = modelSearch.trim().toLowerCase();
  const activeRuntimeModelNames = new Set(
    runningModels.flatMap((runtime) => [runtime.model, runtime.name]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())),
  );
  const runningLibraryModelCount = models.filter((model) => activeRuntimeModelNames.has(model.name.toLowerCase())).length;
  const visibleModels = models
    .filter((model) => {
      if (normalizedModelSearch && !model.name.toLowerCase().includes(normalizedModelSearch)) {
        return false;
      }

      if (modelLibraryFilter === "running" && !activeRuntimeModelNames.has(model.name.toLowerCase())) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (modelLibrarySort === "name") {
        return left.name.localeCompare(right.name);
      }

      if (modelLibrarySort === "size") {
        return right.size - left.size || left.name.localeCompare(right.name);
      }

      const leftTime = left.modified_at ? new Date(left.modified_at).getTime() : 0;
      const rightTime = right.modified_at ? new Date(right.modified_at).getTime() : 0;
      return rightTime - leftTime || left.name.localeCompare(right.name);
    });
  const modelLibraryScopeLabel = modelLibraryFilter === "running"
    ? `Showing ${visibleModels.length} running model${visibleModels.length === 1 ? "" : "s"}.`
    : `Showing ${visibleModels.length} installed model${visibleModels.length === 1 ? "" : "s"}.`;
  const bulkRetryLabel = jobOwnershipFilter === "mine" ? "Retry my failed pulls" : "Retry failed pulls";
  const bulkCancelLabel = jobOwnershipFilter === "mine" ? "Cancel my queued pulls" : "Cancel queued pulls";
  const bulkScopeSummaryText = !canRunBulkPullActions
    ? "Bulk pull actions are unavailable while the view is scoped to delete jobs only."
    : jobOwnershipFilter === "mine"
      ? `${jobBulkActions.queuedPulls} queued pull job${jobBulkActions.queuedPulls === 1 ? "" : "s"} and ${jobBulkActions.retryablePulls} retryable pull job${jobBulkActions.retryablePulls === 1 ? "" : "s"} are currently in your scope.`
      : `${jobBulkActions.queuedPulls} queued pull job${jobBulkActions.queuedPulls === 1 ? "" : "s"} and ${jobBulkActions.retryablePulls} retryable pull job${jobBulkActions.retryablePulls === 1 ? "" : "s"} are currently visible across all operators.`;
  const analyticsOwnershipLabel = jobOwnershipFilter === "mine" ? "Your jobs only" : "All operators";
  const analyticsTypeLabel = jobTypeFilter === "all"
    ? "All job types"
    : jobTypeFilter === "model.pull"
      ? "Pull jobs only"
      : "Delete jobs only";
  const selectedJobScopeReasonLabel = selectedJob
    ? getSelectedJobScopeReasonLabel({
      job: selectedJob,
      currentUser,
      jobFilter,
      jobTypeFilter,
      jobOwnershipFilter,
    })
    : null;
  const selectedJobIsInCurrentScope = selectedJobScopeReasonLabel === "In current scope";
  const selectedJobBulkActionLabel = selectedJob
    ? getSelectedJobBulkActionLabel(selectedJob)
    : null;
  const selectedJobActionScopeMessage = selectedJob && !selectedJobIsInCurrentScope
    ? "Detail actions are disabled while this selected job falls outside the current jobs scope."
    : null;
  const selectedJobScopeChanged = Boolean(
    selectedJob
    && selectedJobScopeSignature
    && selectedJobScopeSignature !== currentScopeSignature,
  );
  const visibleSelectedJobProgressEntries = selectedJob
    ? timelineEntryFilter === "new" && jobDetailRefreshDiff.newEntryStartIndex !== null
      ? selectedJob.progressEntries.slice(jobDetailRefreshDiff.newEntryStartIndex)
      : timelineEntryFilter === "changed"
        ? selectedJob.progressEntries.filter((entry, index) => Boolean(
          formatProgressStatusLabel(entry.statusLabel)
          || getQueueMovementIndicator(selectedJob.progressEntries, index)
          || renderProgressMeta(entry),
        ))
        : selectedJob.progressEntries
    : [];
  const groupedJobs = ["queued", "running", "failed", "cancelled", "succeeded"].map((status) => ({
    key: status as JobRecord["status"],
    title: getJobSectionTitle(status as JobRecord["status"]),
    jobs: jobs.filter((job) => job.status === status),
    ownerCount: jobs.filter(
      (job) => job.status === status && currentUser?.displayName && job.requestedBy === currentUser.displayName,
    ).length,
  })).filter((section) => section.jobs.length > 0) as JobSection[];
  const sectionDeltaBadges = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
    ? groupedJobs.reduce<Record<JobRecord["status"], ReturnType<typeof getSummaryDeltaBadge> | null>>((accumulator, section) => {
      const summaryKey = getSummaryKeyForSectionStatus(section.key);
      const delta = scopedJobSummary[summaryKey] - lastManualScopedJobSummary[summaryKey];
      accumulator[section.key] = getSummaryDeltaBadge(summaryKey, delta);
      return accumulator;
    }, {
      queued: null,
      running: null,
      failed: null,
      cancelled: null,
      succeeded: null,
    })
    : {
      queued: null,
      running: null,
      failed: null,
      cancelled: null,
      succeeded: null,
    };
  const visibleSectionCounts = groupedJobs.map((section) => ({
    key: section.key,
    title: section.title,
    count: section.jobs.length,
  }));
  const jobsKeyboardFocusOrder = groupedJobs.flatMap((section) => [
    getJobSectionHeaderId(section.key),
    ...(collapsedSections[section.key] ? [] : section.jobs.map((job) => getJobRowId(job.id))),
  ]);
  const selectedJobViewTiming = selectedJobIsVisibleInList
    ? null
    : getPinnedSelectionViewTiming(selectedJobRefreshedAt, jobsChangedAt, jobsRefreshedAt);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      setSelectedJobScopeSignature(null);
      setTimelineEntryFilter("all");
      setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
      return;
    }

    setSelectedJobScopeSignature(currentScopeSignature);
    setTimelineEntryFilter("all");
    setJobDetailRefreshDiff({ compared: false, items: [], newEntryStartIndex: null, newEntryCountLabel: null, percentChangeLabel: null, byteTransferChangeLabel: null, totalByteTargetChangeLabel: null, transferStateLabel: null, statusChangeLabel: null, durationChangeLabel: null, updatedAtChangeLabel: null, queuePositionChangeLabel: null });
    refreshSelectedJobEvent();
  }, [currentScopeSignature, selectedJobId]);

  useEffect(() => {
    if (!pendingRevealJobId || isLoadingJobs || !selectedJob || selectedJob.id !== pendingRevealJobId) {
      return;
    }

    if (selectedJobIsVisibleInList) {
      setPendingRevealJobId(null);
      setActionSummary({
        tone: "info",
        message: `Revealed ${selectedJob.target} in the current jobs list.`,
      });

      window.requestAnimationFrame(() => {
        const selectedRow = document.getElementById(getJobRowId(selectedJob.id));
        selectedRow?.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedJobId(selectedJob.id);

        if (highlightTimeoutRef.current !== null) {
          window.clearTimeout(highlightTimeoutRef.current);
        }

        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedJobId(null);
          highlightTimeoutRef.current = null;
        }, 1800);
      });

      return;
    }

    if (
      jobTypeFilter === selectedJob.type
      && jobFilter === getRevealFilterForStatus(selectedJob.status)
    ) {
      setPendingRevealJobId(null);
      setActionSummary({
        tone: "warning",
        message: `${selectedJob.target} is still outside the current ${jobSnapshotLimit}-job list. Its detail remains pinned above for review.`,
      });
    }
  }, [isLoadingJobs, jobFilter, jobSnapshotLimit, jobTypeFilter, pendingRevealJobId, selectedJob, selectedJobIsVisibleInList]);

  useEffect(() => {
    if (adminLocked || !hasActiveJobs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshJobsEvent();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [adminLocked, hasActiveJobs]);

  useEffect(() => {
    if (adminLocked || !selectedJobId || !selectedJobIsActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshSelectedJobEvent();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [adminLocked, selectedJobId, selectedJobIsActive]);

  return (
    <section className="grid gap-6">
      <div className="glass-panel rounded-[36px] p-6 sm:p-8" onKeyDown={handleJobsPanelKeyDown}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label text-xs font-semibold">Model ops</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Library control
            </h2>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isReachable
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isReachable ? "Reachable" : "Offline"}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] bg-white/55 px-4 py-4">
            <p className="eyebrow text-muted">Installed</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{models.length}</p>
          </div>
          <div className="rounded-[24px] bg-white/55 px-4 py-4">
            <p className="eyebrow text-muted">Running</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{runningCount}</p>
          </div>
          <div className="rounded-[24px] bg-white/55 px-4 py-4">
            <p className="eyebrow text-muted">Version</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{version ?? "Unknown"}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Last sync {new Date(fetchedAt).toLocaleTimeString()}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-label="Refresh the model library and current Ollama status"
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRefreshing || isPulling}
              type="button"
              onClick={refreshStatus}
            >
              {isRefreshing ? "Refreshing..." : "Refresh library"}
            </button>
            {auth.authEnabled ? (
              currentUser?.role === "admin" ? (
                <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
                  Admin account
                </div>
              ) : auth.authenticated ? (
                <button
                  aria-label="Sign out the current admin session"
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                  type="button"
                  onClick={logout}
                >
                  Sign out admin
                </button>
              ) : (
                <div className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
                  Admin locked
                </div>
              )
            ) : (
              <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
                {adminStatusLabel}
              </div>
            )}
          </div>
        </div>

        {userCount === 0 && auth.authEnabled && !auth.authenticated ? (
          <form className="mt-6 space-y-3 rounded-[28px] border border-dashed border-line bg-white/45 p-4 sm:p-5" onSubmit={login}>
            <div>
              <p className="eyebrow text-muted">Admin session</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Pull and delete operations require the admin password configured in the environment.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="admin-password-input">
                Admin password
              </label>
              <input
                id="admin-password-input"
                aria-label="Admin password"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Admin password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                aria-label="Unlock admin controls"
                className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!password.trim() || isAuthenticating}
                type="submit"
              >
                {isAuthenticating ? "Signing in..." : "Unlock admin"}
              </button>
            </div>
          </form>
        ) : null}

        <form className="mt-6 space-y-3" onSubmit={pullModel}>
          <label className="eyebrow text-muted" htmlFor="pull-model-name">
            Pull model
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="pull-model-name"
              aria-label="Model name to pull"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              placeholder="llama3.2:latest"
              value={pullName}
              onChange={(event) => setPullName(event.target.value)}
            />
            <button
              aria-label="Start pulling the requested model"
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!pullName.trim() || isPulling || adminLocked}
              type="submit"
            >
              {isPulling ? "Pulling..." : "Pull model"}
            </button>
            <button
              aria-label="Cancel the active model pull"
              className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isPulling}
              type="button"
              onClick={cancelPull}
            >
              Cancel
            </button>
          </div>
        </form>

        {error ? (
          <div aria-live="polite" role="alert" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          <div className="flex flex-col gap-3 rounded-[24px] bg-white/45 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  aria-label="Show all installed models"
                  aria-pressed={modelLibraryFilter === "all"}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    modelLibraryFilter === "all"
                      ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  type="button"
                  onClick={() => setModelLibraryFilter("all")}
                >
                  All installed
                </button>
                <button
                  aria-label="Show only models with active runtimes"
                  aria-pressed={modelLibraryFilter === "running"}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    modelLibraryFilter === "running"
                      ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  type="button"
                  onClick={() => setModelLibraryFilter("running")}
                >
                  Running now
                  <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">
                    {runningLibraryModelCount}
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Visible</span>
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                  {visibleModels.length} of {models.length}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <label className="sr-only" htmlFor="model-library-search">
                  Search installed models
                </label>
                <input
                  id="model-library-search"
                  aria-label="Search installed models"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none lg:max-w-sm"
                  placeholder="Search installed models"
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="model-library-sort">
                  Sort installed models
                </label>
                <select
                  id="model-library-sort"
                  aria-label="Sort installed models"
                  className="rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-foreground outline-none"
                  value={modelLibrarySort}
                  onChange={(event) => setModelLibrarySort(event.target.value as ModelLibrarySort)}
                >
                  <option value="recent">Latest update</option>
                  <option value="name">Name</option>
                  <option value="size">Largest size</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-muted">
              {modelLibraryScopeLabel} {runningLibraryModelCount} model{runningLibraryModelCount === 1 ? " is" : "s are"} currently loaded in memory.
            </p>
          </div>
          {visibleModels.map((model) => (
            <div
              key={model.name}
              className="flex items-center justify-between gap-4 rounded-[24px] bg-white/55 px-4 py-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{model.name}</p>
                  {activeRuntimeModelNames.has(model.name.toLowerCase()) ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
                      Running now
                    </span>
                  ) : null}
                  <span className="rounded-full bg-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-900">
                    {formatByteCount(model.size) ?? "Unknown size"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Updated {new Date(model.modified_at ?? fetchedAt).toLocaleString()}
                </p>
              </div>
              <button
                aria-label={`${busyModel === model.name ? "Deleting" : "Delete"} model ${model.name}`}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busyModel === model.name || isPulling || adminLocked}
                type="button"
                onClick={() => removeModel(model.name)}
              >
                {busyModel === model.name ? "Deleting..." : "Delete"}
              </button>
            </div>
          ))}
          {models.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
              No models installed yet.
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
              {modelLibraryFilter === "running"
                ? "No running models match the current library scope."
                : "No installed models match the current search."}
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-panel rounded-[36px] p-6 sm:p-8">
        <p className="section-label text-xs font-semibold">Pull progress</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          Streaming job log
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {auth.authEnabled
            ? currentUser?.role === "admin"
              ? "Admin account active. Privileged model operations are unlocked."
              : auth.authenticated
              ? "Admin session active. Privileged model operations are unlocked."
              : "Admin auth is enabled. Unlock the panel to run pull and delete operations."
            : currentUser?.role === "admin"
              ? "Local admin account active. Privileged model operations are unlocked without the fallback environment password flow."
              : "Admin auth is currently disabled. Configure environment secrets to require sign-in."}
        </p>
        <div aria-busy={isPulling} aria-label="Streaming pull job log" aria-live="polite" role="log" className="mt-5 max-h-72 overflow-y-auto rounded-[24px] bg-[#201812] px-4 py-4 font-mono text-xs leading-6 text-[#f3eadf]">
          {pullLog.length > 0 ? pullLog.join("\n") : "No pull job has been started yet."}
        </div>
      </div>

      <div className="glass-panel rounded-[36px] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-label text-xs font-semibold">Jobs</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Recent job history
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              aria-label={`${confirmBulkRetry ? "Confirm" : "Retry"} failed pull jobs${jobOwnershipFilter === "mine" ? " in your scope" : " across all operators"}`}
              aria-pressed={confirmBulkRetry}
              className={`rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                confirmBulkRetry
                  ? "border border-emerald-600 bg-emerald-600 text-white"
                  : "border border-emerald-300 bg-emerald-50 text-emerald-900"
              }`}
              disabled={isRunningBulkAction || !canRunBulkPullActions || jobBulkActions.retryablePulls === 0}
              type="button"
              onClick={() => {
                if (!confirmBulkRetry) {
                  setConfirmBulkRetry(true);
                  setConfirmBulkCancel(false);
                  return;
                }

                void retryFailedPullJobs();
              }}
            >
              {isRunningBulkAction
                ? "Retrying failed..."
                : confirmBulkRetry
                  ? `Confirm ${bulkRetryLabel.toLowerCase()}`
                  : bulkRetryLabel}
            </button>
            <button
              aria-label={`${confirmBulkCancel ? "Confirm" : "Cancel"} queued pull jobs${jobOwnershipFilter === "mine" ? " in your scope" : " across all operators"}`}
              aria-pressed={confirmBulkCancel}
              className={`rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                confirmBulkCancel
                  ? "border border-amber-700 bg-amber-600 text-white"
                  : "border border-amber-300 bg-amber-50 text-amber-900"
              }`}
              disabled={isRunningBulkAction || !canRunBulkPullActions || jobBulkActions.queuedPulls === 0}
              type="button"
              onClick={() => {
                if (!confirmBulkCancel) {
                  setConfirmBulkCancel(true);
                  setConfirmBulkRetry(false);
                  return;
                }

                void cancelQueuedPullJobs();
              }}
            >
              {isRunningBulkAction
                ? "Cancelling queued..."
                : confirmBulkCancel
                  ? `Confirm ${bulkCancelLabel.toLowerCase()}`
                  : bulkCancelLabel}
            </button>
            {(confirmBulkRetry || confirmBulkCancel) && !isRunningBulkAction ? (
              <button
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                type="button"
                onClick={() => {
                  setConfirmBulkRetry(false);
                  setConfirmBulkCancel(false);
                }}
              >
                Clear confirm
              </button>
            ) : null}
            <button
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoadingJobs}
              type="button"
              onClick={() => {
                void refreshJobs("manual");
              }}
            >
              {isLoadingJobs ? "Refreshing..." : "Refresh jobs"}
            </button>
            <button
              aria-label={compactJobHints ? "Switch to expanded jobs hints" : "Switch to compact jobs hints"}
              aria-pressed={compactJobHints}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                compactJobHints
                  ? "bg-[var(--accent)] text-white"
                  : "border border-line bg-white text-foreground"
              }`}
              type="button"
              onClick={() => setCompactJobHints((current) => !current)}
            >
              {compactJobHints ? "Expanded hints" : "Compact hints"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold">Bulk scope</span>
          <span>{bulkScopeSummaryText}</span>
          {canRunBulkPullActions ? (
            <>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                Queued {jobBulkActions.queuedPulls}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                Retryable {jobBulkActions.retryablePulls}
              </span>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Current scope</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
            {getCurrentScopeBadgeText(jobFilter, jobTypeFilter, jobOwnershipFilter, jobSnapshotLimit)}
          </span>
          <button
            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
            type="button"
            onClick={() => {
              void copyCurrentScope();
            }}
          >
            Copy scope
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Ownership</span>
            {(["all", "mine"] as const).map((value) => (
              <button
                key={value}
                aria-label={`Show ${getOwnershipFilterLabel(value).toLowerCase()} in the jobs view`}
                aria-pressed={jobOwnershipFilter === value}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  jobOwnershipFilter === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                disabled={value === "mine" && !currentUser?.displayName}
                type="button"
                onClick={() => setJobOwnershipFilter(value)}
              >
                {getOwnershipFilterLabel(value)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Operator shortcuts</span>
            {([
              ["my-queued", "My queued"],
              ["my-failed-pulls", "My failed pulls"],
              ["pull-queue-only", "Pull queue only"],
              ["running-pulls", "Running pulls"],
            ] as const).map(([value, label]) => {
              const requiresUser = value === "my-queued" || value === "my-failed-pulls";

              return (
                <button
                  key={value}
                  aria-label={`${activeJobsQuickScope === value ? "Clear" : "Apply"} jobs quick scope ${label.toLowerCase()}`}
                  aria-pressed={activeJobsQuickScope === value}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    activeJobsQuickScope === value
                      ? "bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  disabled={requiresUser && !currentUser?.displayName}
                  type="button"
                  onClick={() => {
                    if (activeJobsQuickScope === value) {
                      setJobFilter("all");
                      setJobTypeFilter("all");
                      setJobOwnershipFilter("all");
                      return;
                    }

                    if (value === "my-queued") {
                      setJobOwnershipFilter("mine");
                      setJobTypeFilter("all");
                      setJobFilter("queued");
                      return;
                    }

                    if (value === "my-failed-pulls") {
                      setJobOwnershipFilter("mine");
                      setJobTypeFilter("model.pull");
                      setJobFilter("failed");
                      return;
                    }

                    if (value === "pull-queue-only") {
                      setJobOwnershipFilter("all");
                      setJobTypeFilter("model.pull");
                      setJobFilter("queued");
                      return;
                    }

                    setJobOwnershipFilter("all");
                    setJobTypeFilter("model.pull");
                    setJobFilter("running");
                  }}
                >
                  {label}
                </button>
              );
            })}
            {activeJobsQuickScope ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                Shortcut {getJobsQuickScopeLabel(activeJobsQuickScope)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Quick pivot</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
              {jobFilter === "all" ? "All statuses" : `Status: ${jobFilter === "completed" ? "succeeded" : jobFilter}`}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
              {getJobFilterFamilyLabel(jobFilter)}
            </span>
            {jobFilter !== "all" ? (
              <button
                aria-label="Reset the status quick pivot to all jobs"
                className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                type="button"
                onClick={() => setJobFilter("all")}
              >
                Reset pivots
              </button>
            ) : null}
            {(jobFilter !== "all" || jobTypeFilter !== "all" || jobOwnershipFilter !== "all") ? (
              <button
                aria-label="Clear all jobs filters and return to the full jobs scope"
                className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                type="button"
                onClick={() => {
                  setJobFilter("all");
                  setJobTypeFilter("all");
                  setJobOwnershipFilter("all");
                }}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted">{getScopeSummaryText(jobFilter, jobTypeFilter, jobOwnershipFilter)}</p>
          {manualSummaryBaselineMatchesScope && lastManualJobsRefreshAt ? (
            <p className="text-xs text-muted">
              Summary deltas compare against the last manual refresh for this scope from {lastManualJobsRefreshRelativeTime}.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Terminal only</span>
            {([
              ["failed", "Failed"],
              ["cancelled", "Cancelled"],
              ["completed", "Succeeded"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                aria-label={`${jobFilter === value ? "Hide" : "Show only"} ${label.toLowerCase()} jobs`}
                aria-pressed={jobFilter === value}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  jobFilter === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                type="button"
                onClick={() => setJobFilter((current) => current === value ? "all" : value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Active only</span>
            {([
              ["queued", "Queued"],
              ["running", "Running"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                aria-label={`${jobFilter === value ? "Hide" : "Show only"} ${label.toLowerCase()} jobs`}
                aria-pressed={jobFilter === value}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  jobFilter === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                type="button"
                onClick={() => setJobFilter((current) => current === value ? "all" : value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              aria-label={jobFilter === "queued" ? "Show all jobs instead of queued only" : "Show only queued jobs"}
              aria-pressed={jobFilter === "queued"}
              className={`rounded-[24px] px-4 py-4 text-left ${getSummaryCardClasses(jobFilter === "queued")}`}
              type="button"
              onClick={() => setJobFilter((current) => current === "queued" ? "all" : "queued")}
            >
              <p className="eyebrow text-muted">Queued</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-foreground">{scopedJobSummary.queued}</p>
                {ownerScopedJobSummary ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    {jobOwnershipFilter === "mine"
                      ? `${ownerScopedJobSummary.queued} yours`
                      : ownerScopedJobSummary.queued > 0
                        ? `Yours ${ownerScopedJobSummary.queued}`
                        : "None yours"}
                  </span>
                ) : null}
                {queuedSummaryDeltaBadge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${queuedSummaryDeltaBadge.classes}`}
                    title={queuedSummaryDeltaBadge.detail}
                  >
                    {queuedSummaryDeltaBadge.label}
                  </span>
                ) : null}
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end">
                  <HintButton label="Queued jobs help" text={queuedCountHelpText} />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted">{queuedCountHelpText}</p>
              )}
            </button>
            <button
              aria-label={jobFilter === "running" ? "Show all jobs instead of running only" : "Show only running jobs"}
              aria-pressed={jobFilter === "running"}
              className={`rounded-[24px] px-4 py-4 text-left ${getSummaryCardClasses(jobFilter === "running")}`}
              type="button"
              onClick={() => setJobFilter((current) => current === "running" ? "all" : "running")}
            >
              <p className="eyebrow text-muted">Running</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-foreground">{scopedJobSummary.running}</p>
                {ownerScopedJobSummary ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    {jobOwnershipFilter === "mine"
                      ? `${ownerScopedJobSummary.running} yours`
                      : ownerScopedJobSummary.running > 0
                        ? `Yours ${ownerScopedJobSummary.running}`
                        : "None yours"}
                  </span>
                ) : null}
                {runningSummaryDeltaBadge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${runningSummaryDeltaBadge.classes}`}
                    title={runningSummaryDeltaBadge.detail}
                  >
                    {runningSummaryDeltaBadge.label}
                  </span>
                ) : null}
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end">
                  <HintButton label="Running jobs help" text={runningCountHelpText} />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted">{runningCountHelpText}</p>
              )}
            </button>
            <button
              aria-label={jobFilter === "failed" ? "Show all jobs instead of failed only" : "Show only failed jobs"}
              aria-pressed={jobFilter === "failed"}
              className={`rounded-[24px] px-4 py-4 text-left ${getSummaryCardClasses(jobFilter === "failed")}`}
              type="button"
              onClick={() => setJobFilter((current) => current === "failed" ? "all" : "failed")}
            >
              <p className="eyebrow text-muted">Failed</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-foreground">{scopedJobSummary.failed}</p>
                {ownerScopedJobSummary ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    {jobOwnershipFilter === "mine"
                      ? `${ownerScopedJobSummary.failed} yours`
                      : ownerScopedJobSummary.failed > 0
                        ? `Yours ${ownerScopedJobSummary.failed}`
                        : "None yours"}
                  </span>
                ) : null}
                {failedSummaryDeltaBadge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${failedSummaryDeltaBadge.classes}`}
                    title={failedSummaryDeltaBadge.detail}
                  >
                    {failedSummaryDeltaBadge.label}
                  </span>
                ) : null}
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end">
                  <HintButton label="Failed jobs help" text={failedCountHelpText} />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted">{failedCountHelpText}</p>
              )}
            </button>
            <button
              aria-label={jobFilter === "cancelled" ? "Show all jobs instead of cancelled only" : "Show only cancelled jobs"}
              aria-pressed={jobFilter === "cancelled"}
              className={`rounded-[24px] px-4 py-4 text-left ${getSummaryCardClasses(jobFilter === "cancelled")}`}
              type="button"
              onClick={() => setJobFilter((current) => current === "cancelled" ? "all" : "cancelled")}
            >
              <p className="eyebrow text-muted">Cancelled</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-foreground">{scopedJobSummary.cancelled}</p>
                {ownerScopedJobSummary ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    {jobOwnershipFilter === "mine"
                      ? `${ownerScopedJobSummary.cancelled} yours`
                      : ownerScopedJobSummary.cancelled > 0
                        ? `Yours ${ownerScopedJobSummary.cancelled}`
                        : "None yours"}
                  </span>
                ) : null}
                {cancelledSummaryDeltaBadge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${cancelledSummaryDeltaBadge.classes}`}
                    title={cancelledSummaryDeltaBadge.detail}
                  >
                    {cancelledSummaryDeltaBadge.label}
                  </span>
                ) : null}
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end">
                  <HintButton label="Cancelled jobs help" text={cancelledCountHelpText} />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted">{cancelledCountHelpText}</p>
              )}
            </button>
            <button
              aria-label={jobFilter === "completed" ? "Show all jobs instead of succeeded only" : "Show only succeeded jobs"}
              aria-pressed={jobFilter === "completed"}
              className={`rounded-[24px] px-4 py-4 text-left ${getSummaryCardClasses(jobFilter === "completed")}`}
              type="button"
              onClick={() => setJobFilter((current) => current === "completed" ? "all" : "completed")}
            >
              <p className="eyebrow text-muted">Succeeded</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-foreground">{scopedJobSummary.completed}</p>
                {ownerScopedJobSummary ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    {jobOwnershipFilter === "mine"
                      ? `${ownerScopedJobSummary.completed} yours`
                      : ownerScopedJobSummary.completed > 0
                        ? `Yours ${ownerScopedJobSummary.completed}`
                        : "None yours"}
                  </span>
                ) : null}
                {completedSummaryDeltaBadge ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${completedSummaryDeltaBadge.classes}`}
                    title={completedSummaryDeltaBadge.detail}
                  >
                    {completedSummaryDeltaBadge.label}
                  </span>
                ) : null}
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end">
                  <HintButton label="Succeeded jobs help" text={completedCountHelpText} />
                </div>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted">{completedCountHelpText}</p>
              )}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Analytics scope</span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                {analyticsOwnershipLabel}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                {analyticsTypeLabel}
              </span>
              {analyticsRecentChangeSignal ? (
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${analyticsRecentChangeSignal.classes}`}
                  title={analyticsRecentChangeSignal.detail}
                >
                  {analyticsRecentChangeSignal.label}
                </span>
              ) : null}
              <span>{trendWindowText}</span>
            </div>
            <div className="rounded-[24px] border border-line/80 bg-white/45 px-4 py-4">
              <p className="eyebrow text-muted">Avg pull wait</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                  {analyticsOwnershipLabel}
                </span>
                {analyticsRecentChangeSignal ? (
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${analyticsRecentChangeSignal.classes}`}
                    title={analyticsRecentChangeSignal.detail}
                  >
                    {analyticsRecentChangeSignal.label}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xl font-semibold text-foreground">
                  {jobAnalytics.averagePullWaitMs === null
                    ? "No data"
                    : formatDuration(jobAnalytics.averagePullWaitMs)}
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTrendClasses(jobAnalytics.averagePullWaitTrend)}`}>
                  {getTrendLabel(jobAnalytics.averagePullWaitTrend)}
                </span>
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <HintButton label="Average pull wait help" text={averagePullWaitHelpText} />
                  <HintButton label="Average pull wait trend window" text={trendWindowText} />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-6 text-muted">
                    {averagePullWaitHelpText}
                  </p>
                </>
              )}
            </div>
            <div className="rounded-[24px] border border-line/80 bg-white/45 px-4 py-4">
              <p className="eyebrow text-muted">Retry queued</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                  {analyticsOwnershipLabel}
                </span>
                {analyticsRecentChangeSignal ? (
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${analyticsRecentChangeSignal.classes}`}
                    title={analyticsRecentChangeSignal.detail}
                  >
                    {analyticsRecentChangeSignal.label}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xl font-semibold text-foreground">{jobAnalytics.retryQueuedCount}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTrendClasses(jobAnalytics.retryQueuedTrend)}`}>
                  {getTrendLabel(jobAnalytics.retryQueuedTrend)}
                </span>
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <HintButton label="Retry queued help" text={retryQueuedHelpText} />
                  <HintButton label="Retry queued trend window" text={trendWindowText} />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-6 text-muted">
                    {retryQueuedHelpText}
                  </p>
                </>
              )}
            </div>
            <div className="rounded-[24px] border border-line/80 bg-white/45 px-4 py-4">
              <p className="eyebrow text-muted">Failure rate</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                  {analyticsOwnershipLabel}
                </span>
                {analyticsRecentChangeSignal ? (
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${analyticsRecentChangeSignal.classes}`}
                    title={analyticsRecentChangeSignal.detail}
                  >
                    {analyticsRecentChangeSignal.label}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xl font-semibold text-foreground">
                  {formatPercent(jobAnalytics.terminalFailureRate)}
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getTrendClasses(jobAnalytics.terminalFailureRateTrend)}`}>
                  {getTrendLabel(jobAnalytics.terminalFailureRateTrend)}
                </span>
              </div>
              {compactJobHints ? (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <HintButton label="Failure rate help" text={failureRateHelpText} />
                  <HintButton label="Failure rate trend window" text={trendWindowText} />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-6 text-muted">
                    {failureRateHelpText}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["queued", "Queued"],
              ["running", "Running"],
              ["failed", "Failed"],
              ["cancelled", "Cancelled"],
              ["completed", "Succeeded"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                aria-label={`Set jobs status filter to ${label.toLowerCase()}`}
                aria-pressed={jobFilter === value}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  jobFilter === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                type="button"
                onClick={() => setJobFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All jobs"],
              ["model.pull", "Pulls"],
              ["model.delete", "Deletes"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                aria-label={`Set jobs type filter to ${label.toLowerCase()}`}
                aria-pressed={jobTypeFilter === value}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  jobTypeFilter === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                type="button"
                onClick={() => setJobTypeFilter(value)}
              >
                {label}
              </button>
            ))}
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
              {getJobTypeFamilyLabel(jobTypeFilter)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Snapshot</span>
            {JOB_SNAPSHOT_LIMIT_OPTIONS.map((value) => (
              <button
                key={value}
                aria-label={`Show the latest ${value} jobs in the current scope`}
                aria-pressed={jobSnapshotLimit === value}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  jobSnapshotLimit === value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-line bg-white text-foreground"
                }`}
                type="button"
                onClick={() => setJobSnapshotLimit(value)}
              >
                {value} jobs
              </button>
            ))}
          </div>
          {groupedJobs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                aria-label="Expand every visible job section"
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                type="button"
                onClick={expandAllSections}
              >
                Expand all sections
              </button>
              <button
                aria-label="Collapse every visible job section"
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                type="button"
                onClick={collapseAllSections}
              >
                Collapse all sections
              </button>
            </div>
          ) : null}
          {selectedJob ? (
            <div className="rounded-[24px] border border-[var(--accent)]/30 bg-[color:color-mix(in_srgb,var(--accent)_8%,white)] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-muted">Pinned selection</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{selectedJob.target}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatJobType(selectedJob.type)} job · requested by {selectedJob.requestedBy}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Detail refreshed {formatRefreshTime(selectedJobRefreshedAt)} · {selectedJobRefreshRelativeTime}
                  </p>
                  {jobDetailRefreshDiff.compared && (jobDetailRefreshDiff.newEntryCountLabel || jobDetailRefreshDiff.percentChangeLabel || jobDetailRefreshDiff.byteTransferChangeLabel || jobDetailRefreshDiff.totalByteTargetChangeLabel || jobDetailRefreshDiff.transferStateLabel || jobDetailRefreshDiff.statusChangeLabel || jobDetailRefreshDiff.durationChangeLabel || jobDetailRefreshDiff.updatedAtChangeLabel || jobDetailRefreshDiff.queuePositionChangeLabel) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {jobDetailRefreshDiff.newEntryCountLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.newEntryCountLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.percentChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.percentChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.byteTransferChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.byteTransferChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.totalByteTargetChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.totalByteTargetChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.transferStateLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.transferStateLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.statusChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          Status {jobDetailRefreshDiff.statusChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.durationChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.durationChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.updatedAtChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.updatedAtChangeLabel}
                        </span>
                      ) : null}
                      {jobDetailRefreshDiff.queuePositionChangeLabel ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                          {jobDetailRefreshDiff.queuePositionChangeLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedJobScopeChanged ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                        Scope changed since pin
                      </span>
                      <button
                        className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                        type="button"
                        onClick={() => setSelectedJobScopeSignature(currentScopeSignature)}
                      >
                        Re-pin to current scope
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedJobRefreshStatus.classes}`}>
                    {selectedJobRefreshStatus.label}
                  </span>
                  {!selectedJobIsVisibleInList ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                      Outside current list view
                    </span>
                  ) : null}
                  <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-900">
                    {formatDuration(selectedJob.durationMs)}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getJobStatusClasses(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                  {selectedJobRetryLineageLabel ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                      {selectedJobRetryLineageLabel}
                    </span>
                  ) : null}
                  {selectedJobOwnershipLabel ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                      {selectedJobOwnershipLabel}
                    </span>
                  ) : null}
                  {selectedJobScopeReasonLabel ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedJobIsInCurrentScope
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-900"
                    }`}>
                      {selectedJobScopeReasonLabel}
                    </span>
                  ) : null}
                  {selectedJobBulkActionLabel ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                      {selectedJobBulkActionLabel}
                    </span>
                  ) : null}
                  <button
                    aria-label={selectedJobNeedsManualRefresh ? "Refresh stale selected job detail now" : "Refresh selected job detail"}
                    className={`rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedJobNeedsManualRefresh
                        ? "border border-amber-700 bg-amber-600 text-white"
                        : "border border-line bg-white text-foreground"
                    }`}
                    disabled={isLoadingJobDetail}
                    type="button"
                    onClick={() => {
                      void refreshSelectedJob(selectedJob.id);
                    }}
                  >
                    {isLoadingJobDetail
                      ? "Refreshing..."
                      : selectedJobNeedsManualRefresh
                        ? "Refresh now"
                        : "Refresh detail"}
                  </button>
                  {selectedJobIsVisibleInList ? (
                    <button
                      className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                      type="button"
                      onClick={jumpToSelectedJobInList}
                    >
                      Jump to row
                    </button>
                  ) : null}
                  {!selectedJobIsVisibleInList ? (
                    <button
                      className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                      type="button"
                      onClick={revealSelectedJobInList}
                    >
                      Reveal in list
                    </button>
                  ) : null}
                  <button
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
                    type="button"
                    onClick={() => setSelectedJobId(null)}
                  >
                    Clear selection
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-muted">{selectedJob.progressMessage}</p>
              {selectedJobNeedsManualRefresh ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">
                    Manual refresh recommended
                  </span>
                  <span>
                    The jobs list is still active, but this selected detail is stale. Use Refresh now to compare it with the latest queue state.
                  </span>
                </div>
              ) : null}
              {!selectedJobIsVisibleInList ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted">Current view</span>
                  {visibleSectionCounts.length > 0 ? visibleSectionCounts.map((section) => (
                    <span
                      key={section.key}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {section.title} {section.count}
                    </span>
                  )) : (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                      No visible jobs
                    </span>
                  )}
                </div>
              ) : null}
              {!selectedJobIsVisibleInList && selectedJobViewTiming ? (
                <p className="mt-2 text-xs leading-6 text-muted">{selectedJobViewTiming}</p>
              ) : null}
            </div>
          ) : null}
          {jobs.length > 0 ? (
            groupedJobs.map((section) => {
              const sectionDeltaBadge = sectionDeltaBadges[section.key];
              const sectionDeltaInsight = manualSummaryBaselineMatchesScope && lastManualScopedJobSummary
                ? getJobSectionDeltaInsight(
                  section.key,
                  scopedJobSummary[getSummaryKeyForSectionStatus(section.key)]
                    - lastManualScopedJobSummary[getSummaryKeyForSectionStatus(section.key)],
                )
                : null;

              return (
              <div key={section.key} className="space-y-3">
                <button
                  ref={(node) => {
                    jobSectionHeaderRefs.current[getJobSectionHeaderId(section.key)] = node;
                  }}
                  aria-controls={`job-section-panel-${section.key}`}
                  aria-expanded={!collapsedSections[section.key]}
                  className="flex w-full items-center justify-between gap-4 px-1 text-left"
                  id={getJobSectionHeaderId(section.key)}
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  onKeyDown={(event) => handleJobSectionHeaderKeyDown(event, section.key)}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <p className="section-label text-xs font-semibold">{section.title}</p>
                      <span className="text-xs text-muted">{section.jobs.length}</span>
                      {currentUser?.displayName ? (
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
                          {jobOwnershipFilter === "mine"
                            ? `${section.ownerCount} in scope`
                            : section.ownerCount > 0
                              ? `Yours ${section.ownerCount}`
                              : "None yours"}
                        </span>
                      ) : null}
                      {sectionDeltaBadge ? (
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${sectionDeltaBadge.classes}`}
                          title={sectionDeltaBadge.detail}
                        >
                          {sectionDeltaBadge.label}
                        </span>
                      ) : null}
                    </div>
                    {currentUser?.displayName ? (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span className="rounded-full bg-white/70 px-3 py-1 font-semibold text-foreground">
                          {getJobSectionInsight(section, currentUser)}
                        </span>
                        {sectionDeltaInsight ? (
                          <span className="rounded-full bg-white/70 px-3 py-1 font-semibold text-foreground">
                            {sectionDeltaInsight}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted">
                    {collapsedSections[section.key] ? "Show" : "Hide"}
                  </span>
                </button>
                {!collapsedSections[section.key] ? section.jobs.map((job) => (
                  <div
                    ref={(node) => {
                      jobRowRefs.current[getJobRowId(job.id)] = node;
                    }}
                    aria-label={`${job.target}. ${formatJobType(job.type)} job requested by ${job.requestedBy}. Status ${job.status}.`}
                    aria-pressed={selectedJobId === job.id}
                    key={job.id}
                    id={getJobRowId(job.id)}
                    onKeyDown={(event) => handleJobRowKeyDown(event, job)}
                    role="button"
                    tabIndex={0}
                    className={`rounded-[24px] px-4 py-4 ${
                      selectedJobId === job.id
                        ? highlightedJobId === job.id
                          ? "bg-[color:color-mix(in_srgb,var(--accent)_18%,white)] ring-2 ring-amber-400 shadow-[0_0_0_4px_color-mix(in_srgb,white_55%,transparent)] transition-all animate-pulse"
                          : "bg-[color:color-mix(in_srgb,var(--accent)_12%,white)] ring-1 ring-[var(--accent)]"
                        : highlightedJobId === job.id
                          ? "bg-amber-50 ring-2 ring-amber-400 shadow-[0_0_0_4px_color-mix(in_srgb,white_55%,transparent)] transition-all animate-pulse"
                          : "bg-white/55"
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <button
                          className="text-left"
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {job.target}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {formatJobType(job.type)} job
                          </p>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentUser?.displayName ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                            {jobOwnershipFilter === "mine"
                              ? "In your scope"
                              : job.requestedBy === currentUser.displayName
                                ? "Your job"
                                : "Other operator"}
                          </span>
                        ) : null}
                        {job.status === "queued" && typeof job.queuePosition === "number" ? (
                          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">
                            {job.queuePosition === 1 ? "Next to run" : `Queue #${job.queuePosition}`}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-900">
                          {formatDuration(job.durationMs)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getJobStatusClasses(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-muted">
                      {job.progressMessage}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Requested by {job.requestedBy} · started {new Date(job.createdAt).toLocaleString()}
                      {job.finishedAt ? ` · finished ${new Date(job.finishedAt).toLocaleString()}` : ""}
                    </p>
                    {job.type === "model.pull" && job.status === "queued" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isReorderingJob || job.queuePosition === 1}
                          type="button"
                          onClick={() => {
                            void reorderQueuedJob(job, "up");
                          }}
                        >
                          {isReorderingJob && selectedJobId === job.id ? "Moving..." : "Move earlier"}
                        </button>
                        <button
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isReorderingJob || job.queuePosition === jobSummary.queued}
                          type="button"
                          onClick={() => {
                            void reorderQueuedJob(job, "down");
                          }}
                        >
                          Move later
                        </button>
                      </div>
                    ) : null}
                  </div>
                )) : (
                  <div
                    className="rounded-[20px] border border-dashed border-line bg-white/35 px-4 py-3 text-sm text-muted"
                    id={`job-section-panel-${section.key}`}
                  >
                    {section.title} jobs are collapsed.
                  </div>
                )}
              </div>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
              {adminLocked
                ? "Unlock admin access to inspect job history."
                : jobSummary.total === 0
                  ? "No model jobs have been recorded yet."
                  : "No jobs match the current filter."}
            </div>
          )}
        </div>
        {!adminLocked && hasActiveJobs ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <p>Auto-refresh is active while queued or running jobs exist.</p>
            <span className={`rounded-full px-3 py-1 font-semibold ${jobsRefreshStatus.classes}`}>
              {jobsRefreshStatus.label}
            </span>
            <span>Jobs refreshed {formatRefreshTime(jobsRefreshedAt)} · {jobsRefreshRelativeTime}</span>
            {jobsChangedAt ? (
              <span>Last changed {formatRefreshTime(jobsChangedAt)} · {jobsChangedRelativeTime}</span>
            ) : null}
            {lastManualJobsRefreshAt ? (
              <span>Manual refresh {formatRefreshTime(lastManualJobsRefreshAt)} · {lastManualJobsRefreshRelativeTime}</span>
            ) : null}
            {jobsChangedSinceManualRefresh ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">
                Changed since manual refresh
              </span>
            ) : null}
          </div>
        ) : null}
        {!hasActiveJobs && jobsRefreshedAt ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className={`rounded-full px-3 py-1 font-semibold ${jobsRefreshStatus.classes}`}>
              {jobsRefreshStatus.label}
            </span>
            <span>Jobs refreshed {formatRefreshTime(jobsRefreshedAt)} · {jobsRefreshRelativeTime}</span>
            {jobsChangedAt ? (
              <span>Last changed {formatRefreshTime(jobsChangedAt)} · {jobsChangedRelativeTime}</span>
            ) : null}
            {lastManualJobsRefreshAt ? (
              <span>Manual refresh {formatRefreshTime(lastManualJobsRefreshAt)} · {lastManualJobsRefreshRelativeTime}</span>
            ) : null}
            {jobsChangedSinceManualRefresh ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">
                Changed since manual refresh
              </span>
            ) : null}
          </div>
        ) : null}
        {groupedJobs.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            Keyboard: focus a section header or job row, then use Up and Down to move, Enter or Space to pin a row, Left or Right to collapse or expand a section, R to refresh jobs, D to refresh pinned detail, J to jump to the pinned job, and Escape to clear selection.
          </p>
        ) : null}
        {(confirmBulkRetry || confirmBulkCancel) && !isRunningBulkAction ? (
          <p aria-live="polite" className="mt-2 text-xs text-muted">
            Bulk actions require a second click to confirm.
          </p>
        ) : null}
        {actionSummary ? (
          <div
            aria-live="polite"
            role="status"
            className={`mt-3 flex items-center justify-between gap-3 rounded-[20px] px-4 py-3 text-sm ${
              actionSummary.tone === "warning"
                ? "bg-amber-50 text-amber-900"
                : "bg-emerald-50 text-emerald-900"
            }`}
          >
            <p>{actionSummary.message}</p>
            <button
              className="rounded-full border border-current px-3 py-1 text-xs font-semibold"
              type="button"
              onClick={() => setActionSummary(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="glass-panel rounded-[36px] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-label text-xs font-semibold">Job detail</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Selected job timeline
            </h2>
          </div>
          {selectedJobId ? (
            <button
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoadingJobDetail}
              type="button"
              onClick={() => {
                void refreshSelectedJob();
              }}
            >
              {isLoadingJobDetail ? "Refreshing..." : "Refresh detail"}
            </button>
          ) : null}
        </div>
        {selectedJob ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-[24px] bg-white/55 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedJob.target}</p>
                  <p className="mt-1 text-xs text-muted">{formatJobType(selectedJob.type)} job</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-900">
                    {formatDuration(selectedJob.durationMs)}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getJobStatusClasses(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                Requested by {selectedJob.requestedBy} · latest update {new Date(selectedJob.updatedAt).toLocaleString()}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {selectedJobScopeReasonLabel ? (
                  <span className={`rounded-full px-3 py-1 font-semibold ${
                    selectedJobIsInCurrentScope
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}>
                    {selectedJobScopeReasonLabel}
                  </span>
                ) : null}
                {selectedJobBulkActionLabel ? (
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                    {selectedJobBulkActionLabel}
                  </span>
                ) : null}
              </div>
              {selectedJobActionScopeMessage ? (
                <div className="mt-3 rounded-[18px] bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {selectedJobActionScopeMessage}
                </div>
              ) : null}
              {selectedJob.status === "queued" && typeof selectedJob.queuePosition === "number" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Queue position {selectedJob.queuePosition}</span>
                  {selectedJobLatestQueueMovement ? (
                    <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                      {selectedJobLatestQueueMovement}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {selectedJob.type === "model.pull"
                && (selectedJob.status === "queued" || selectedJob.status === "running") ? (
                <div className="mt-4">
                  <button
                    className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isCancellingJob || !selectedJobIsInCurrentScope}
                    type="button"
                    onClick={() => {
                      void cancelSelectedJob();
                    }}
                  >
                    {isCancellingJob ? "Cancelling..." : selectedJob.status === "queued" ? "Cancel queued job" : "Cancel running job"}
                  </button>
                </div>
              ) : null}
              {selectedJob.type === "model.pull" && selectedJob.status === "queued" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isReorderingJob || !selectedJobIsInCurrentScope}
                    type="button"
                    onClick={() => {
                      void reorderQueuedJob(selectedJob, "up");
                    }}
                  >
                    {isReorderingJob ? "Moving..." : "Move earlier"}
                  </button>
                  <button
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isReorderingJob || !selectedJobIsInCurrentScope}
                    type="button"
                    onClick={() => {
                      void reorderQueuedJob(selectedJob, "down");
                    }}
                  >
                    Move later
                  </button>
                </div>
              ) : null}
              {selectedJob.type === "model.pull"
                && (selectedJob.status === "failed" || selectedJob.status === "cancelled") ? (
                <div className="mt-4">
                  <button
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isPulling || !selectedJobIsInCurrentScope}
                    type="button"
                    onClick={() => {
                      void retrySelectedJobOnServer();
                    }}
                  >
                    {isPulling ? "Retrying..." : "Retry pull"}
                  </button>
                </div>
              ) : null}
            </div>
            {jobDetailRefreshDiff.compared ? (
              <div className="rounded-[24px] border border-line/80 bg-white/45 px-4 py-4 text-sm text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">
                    Since last detail refresh
                  </span>
                  {jobDetailRefreshDiff.items.length > 0 ? (
                    jobDetailRefreshDiff.items.map((item) => (
                      <span key={item} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-900">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-900">
                      No visible change
                    </span>
                  )}
                </div>
              </div>
            ) : null}
            {jobDetailRefreshDiff.newEntryStartIndex !== null || selectedJob.progressEntries.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted">Timeline</span>
                <button
                  aria-label="Show all timeline entries for the selected job"
                  aria-pressed={timelineEntryFilter === "all"}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    timelineEntryFilter === "all"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  type="button"
                  onClick={() => setTimelineEntryFilter("all")}
                >
                  All entries
                </button>
                <button
                  aria-label="Show only new timeline entries since the last detail refresh"
                  aria-pressed={timelineEntryFilter === "new"}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    timelineEntryFilter === "new"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  disabled={jobDetailRefreshDiff.newEntryStartIndex === null}
                  type="button"
                  onClick={() => setTimelineEntryFilter("new")}
                >
                  New since refresh
                </button>
                <button
                  aria-label="Show only changed timeline entries for the selected job"
                  aria-pressed={timelineEntryFilter === "changed"}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    timelineEntryFilter === "changed"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-line bg-white text-foreground"
                  }`}
                  type="button"
                  onClick={() => setTimelineEntryFilter("changed")}
                >
                  Changed only
                </button>
              </div>
            ) : null}
            <div className="max-h-80 overflow-y-auto rounded-[24px] bg-[#201812] px-4 py-4 font-mono text-xs leading-6 text-[#f3eadf]">
              {visibleSelectedJobProgressEntries.map((entry) => {
                const actualIndex = selectedJob.progressEntries.indexOf(entry);
                const queueMovementIndicator = getQueueMovementIndicator(selectedJob.progressEntries, actualIndex);

                return (
                <div
                  key={`${entry.createdAt}-${actualIndex}`}
                  className={`border-b border-white/10 py-2 last:border-b-0 ${getProgressEntryRowClasses(entry.statusLabel)}`}
                >
                  <div className="flex items-center gap-2 text-[#cdbfaa]">
                    <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                    {formatProgressStatusLabel(entry.statusLabel) ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getProgressStatusChipClasses(entry.statusLabel)}`}>
                        {formatProgressStatusLabel(entry.statusLabel)}
                      </span>
                    ) : null}
                    {queueMovementIndicator ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${queueMovementIndicator.classes}`}>
                        {queueMovementIndicator.label}
                      </span>
                    ) : null}
                    {jobDetailRefreshDiff.newEntryStartIndex !== null && actualIndex >= jobDetailRefreshDiff.newEntryStartIndex ? (
                      <span className="rounded-full bg-[#d57a42] px-2 py-0.5 text-[10px] font-semibold text-white">
                        New
                      </span>
                    ) : null}
                  </div>
                  <div>{entry.message}</div>
                  {queueMovementIndicator ? (
                    <div className="text-[#cdbfaa]">{queueMovementIndicator.detail}</div>
                  ) : null}
                  {renderProgressMeta(entry) ? (
                    <div className="text-[#cdbfaa]">{renderProgressMeta(entry)}</div>
                  ) : null}
                  {typeof entry.percent === "number" ? (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#d57a42]"
                        style={{ width: `${Math.max(0, Math.min(entry.percent, 100))}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              )})}
              {visibleSelectedJobProgressEntries.length === 0 ? (
                <div className="py-2 text-[#cdbfaa]">
                  {timelineEntryFilter === "new"
                    ? "No new timeline entries since the last detail refresh."
                    : timelineEntryFilter === "changed"
                      ? "No changed timeline entries match the current filter."
                      : "No timeline entries available."}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
            {adminLocked
              ? "Unlock admin access to inspect job details."
              : "Select a job to inspect its full progress trail."}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-[36px] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-label text-xs font-semibold">Activity</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Recent control-plane events
            </h2>
          </div>
          <button
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoadingActivity}
            type="button"
            onClick={refreshActivity}
          >
            {isLoadingActivity ? "Refreshing..." : "Refresh log"}
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {activityEvents.length > 0 ? (
            activityEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-[24px] bg-white/55 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-foreground">
                    {event.summary}
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      event.level === "warning"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {event.level}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {event.details || event.type}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
              {auth.authEnabled && !auth.authenticated
                ? userCount > 0
                  ? "Sign in as an admin user to read the activity log."
                  : "Unlock admin to read the activity log."
                : "No activity recorded yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}