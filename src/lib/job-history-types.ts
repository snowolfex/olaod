export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JobType = "model.pull" | "model.delete";

export type JobProgressEntry = {
  createdAt: string;
  message: string;
  statusLabel?: string;
  completed?: number;
  total?: number;
  percent?: number;
};

export type JobRecord = {
  id: string;
  type: JobType;
  target: string;
  status: JobStatus;
  queuePosition?: number;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  durationMs?: number;
  requestedBy: string;
  progressMessage: string;
  progressEntries: JobProgressEntry[];
};