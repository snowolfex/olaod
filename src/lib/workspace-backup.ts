import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataStorePath } from "@/lib/data-store";
import type { ActivityEvent } from "@/lib/activity-types";
import type { StoredConversation } from "@/lib/conversation-types";
import type { JobRecord } from "@/lib/job-history-types";
import type { StoredUser } from "@/lib/user-types";

const USERS_STORE_PATH = getDataStorePath("users.json");
const CONVERSATIONS_STORE_PATH = getDataStorePath("conversations.json");
const ACTIVITY_STORE_PATH = getDataStorePath("activity-log.json");
const JOB_HISTORY_STORE_PATH = getDataStorePath("job-history.json");
const SNAPSHOT_VERSION = 1;

export type WorkspaceBackupSnapshot = {
  version: 1;
  exportedAt: string;
  users: StoredUser[];
  conversations: StoredConversation[];
  activityEvents: ActivityEvent[];
  jobHistory: JobRecord[];
};

async function ensureStoreFile(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "[]\n", "utf8");
  }
}

async function readStoreFile<T>(filePath: string) {
  await ensureStoreFile(filePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeStoreFile(filePath: string, value: unknown) {
  await ensureStoreFile(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!isRecord(value)) {
    return false;
  }

  const authProvider = value.authProvider;
  const hasValidProvider = authProvider === undefined || authProvider === "local" || authProvider === "google";
  const hasValidPasswordShape = value.passwordHash === undefined || typeof value.passwordHash === "string";
  const hasValidSaltShape = value.passwordSalt === undefined || typeof value.passwordSalt === "string";

  return typeof value.id === "string"
    && typeof value.username === "string"
    && typeof value.displayName === "string"
    && (value.role === "viewer" || value.role === "operator" || value.role === "admin")
    && hasValidProvider
    && (value.email === undefined || typeof value.email === "string")
    && (value.providerSubject === undefined || typeof value.providerSubject === "string")
    && (value.avatarUrl === undefined || typeof value.avatarUrl === "string")
    && hasValidPasswordShape
    && hasValidSaltShape
    && typeof value.createdAt === "string";
}

function isConversationSettings(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.model === "string"
    && typeof value.systemPrompt === "string"
    && typeof value.temperature === "number";
}

function isChatMessage(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (value.role === "system" || value.role === "user" || value.role === "assistant")
    && typeof value.content === "string";
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.ownerId === "string"
    && typeof value.title === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && (value.archivedAt === null || typeof value.archivedAt === "string" || value.archivedAt === undefined)
    && Array.isArray(value.messages)
    && value.messages.every(isChatMessage)
    && isConversationSettings(value.settings);
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.summary === "string"
    && (value.details === undefined || typeof value.details === "string")
    && (value.level === "info" || value.level === "warning")
    && typeof value.createdAt === "string";
}

function isJobProgressEntry(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.createdAt === "string"
    && typeof value.message === "string"
    && (value.statusLabel === undefined || typeof value.statusLabel === "string")
    && (value.completed === undefined || typeof value.completed === "number")
    && (value.total === undefined || typeof value.total === "number")
    && (value.percent === undefined || typeof value.percent === "number");
}

function isJobRecord(value: unknown): value is JobRecord {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string"
    && (value.type === "model.pull" || value.type === "model.delete")
    && typeof value.target === "string"
    && isStringArray([])
    && (value.status === "queued" || value.status === "running" || value.status === "succeeded" || value.status === "failed" || value.status === "cancelled")
    && (value.queuePosition === undefined || typeof value.queuePosition === "number")
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && (value.finishedAt === undefined || typeof value.finishedAt === "string")
    && (value.durationMs === undefined || typeof value.durationMs === "number")
    && typeof value.requestedBy === "string"
    && typeof value.progressMessage === "string"
    && Array.isArray(value.progressEntries)
    && value.progressEntries.every(isJobProgressEntry);
}

export function validateWorkspaceBackupSnapshot(value: unknown): value is WorkspaceBackupSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === SNAPSHOT_VERSION
    && typeof value.exportedAt === "string"
    && Array.isArray(value.users)
    && value.users.every(isStoredUser)
    && Array.isArray(value.conversations)
    && value.conversations.every(isStoredConversation)
    && Array.isArray(value.activityEvents)
    && value.activityEvents.every(isActivityEvent)
    && Array.isArray(value.jobHistory)
    && value.jobHistory.every(isJobRecord);
}

export async function exportWorkspaceBackupSnapshot(): Promise<WorkspaceBackupSnapshot> {
  const [users, conversations, activityEvents, jobHistory] = await Promise.all([
    readStoreFile<StoredUser[]>(USERS_STORE_PATH),
    readStoreFile<StoredConversation[]>(CONVERSATIONS_STORE_PATH),
    readStoreFile<ActivityEvent[]>(ACTIVITY_STORE_PATH),
    readStoreFile<JobRecord[]>(JOB_HISTORY_STORE_PATH),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    users,
    conversations,
    activityEvents,
    jobHistory,
  };
}

export async function importWorkspaceBackupSnapshot(snapshot: WorkspaceBackupSnapshot) {
  await Promise.all([
    writeStoreFile(USERS_STORE_PATH, snapshot.users),
    writeStoreFile(CONVERSATIONS_STORE_PATH, snapshot.conversations),
    writeStoreFile(ACTIVITY_STORE_PATH, snapshot.activityEvents),
    writeStoreFile(JOB_HISTORY_STORE_PATH, snapshot.jobHistory),
  ]);

  return {
    userCount: snapshot.users.length,
    conversationCount: snapshot.conversations.length,
    activityEventCount: snapshot.activityEvents.length,
    jobCount: snapshot.jobHistory.length,
  };
}