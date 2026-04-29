import "server-only";

import { freemem, totalmem } from "node:os";

import { getInstallBindingStatus } from "@/lib/install-binding";
import { getOllamaStatus } from "@/lib/ollama-status";
import type { OllamaStatus } from "@/lib/ollama";
import type {
  AdminSystemMonitorSnapshot,
  SystemMonitorModelSnapshot,
  SystemMonitorSeriesPoint,
} from "@/lib/system-monitor-types";

type ModelTrafficMeta = {
  providerId: string;
  model: string;
};

type MemoryHistorySample = {
  timestampMs: number;
  freeBytes: number;
  usedBytes: number;
};

const MEMORY_HISTORY_LIMIT = 45;
const TRAFFIC_HISTORY_SECONDS = 45;
const CURRENT_TRAFFIC_WINDOW_SECONDS = 3;

const trafficBuckets = new Map<number, Map<string, number>>();
const modelLastSeenAt = new Map<string, number>();
const memoryHistory: MemoryHistorySample[] = [];

function getModelKey(providerId: string, model: string) {
  return `${providerId}:${model}`;
}

function normalizeModelName(value: string) {
  return value.trim().toLowerCase();
}

function trimMonitorHistory(nowMs: number) {
  const cutoffSecond = Math.floor((nowMs - TRAFFIC_HISTORY_SECONDS * 1000) / 1000) * 1000;

  for (const second of trafficBuckets.keys()) {
    if (second < cutoffSecond) {
      trafficBuckets.delete(second);
    }
  }

  const lastAllowedSeenAt = nowMs - TRAFFIC_HISTORY_SECONDS * 1000;
  for (const [key, timestampMs] of modelLastSeenAt.entries()) {
    if (timestampMs < lastAllowedSeenAt) {
      modelLastSeenAt.delete(key);
    }
  }

  while (memoryHistory.length > MEMORY_HISTORY_LIMIT) {
    memoryHistory.shift();
  }
}

function recordMemorySnapshot(nowMs: number) {
  const totalBytes = totalmem();
  const freeBytes = freemem();

  memoryHistory.push({
    timestampMs: nowMs,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
  });
}

function buildSeriesFromBuckets(
  nowMs: number,
  selector: (secondMs: number) => number,
): SystemMonitorSeriesPoint[] {
  const currentSecond = Math.floor(nowMs / 1000) * 1000;
  const points: SystemMonitorSeriesPoint[] = [];

  for (let index = TRAFFIC_HISTORY_SECONDS - 1; index >= 0; index -= 1) {
    const secondMs = currentSecond - index * 1000;
    points.push({
      timestamp: new Date(secondMs).toISOString(),
      value: selector(secondMs),
    });
  }

  return points;
}

function getBucketValue(secondMs: number, key?: string) {
  const bucket = trafficBuckets.get(secondMs);

  if (!bucket) {
    return 0;
  }

  if (key) {
    return bucket.get(key) ?? 0;
  }

  let total = 0;
  for (const value of bucket.values()) {
    total += value;
  }
  return total;
}

function getCurrentBytesPerSecond(nowMs: number, key?: string) {
  const currentSecond = Math.floor(nowMs / 1000) * 1000;
  let totalBytes = 0;

  for (let index = 0; index < CURRENT_TRAFFIC_WINDOW_SECONDS; index += 1) {
    totalBytes += getBucketValue(currentSecond - index * 1000, key);
  }

  return totalBytes / CURRENT_TRAFFIC_WINDOW_SECONDS;
}

function resolveInstalledEstimate(status: OllamaStatus, modelName: string) {
  const normalized = normalizeModelName(modelName);
  const match = status.models.find((model) => normalizeModelName(model.name) === normalized);
  return match?.size ?? null;
}

function resolveRuntimeModelName(runtime: OllamaStatus["running"][number]) {
  return runtime.model?.trim() || runtime.name?.trim() || "unknown-model";
}

export function recordModelTraffic(meta: ModelTrafficMeta, bytes: number, timestampMs = Date.now()) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return;
  }

  const secondMs = Math.floor(timestampMs / 1000) * 1000;
  const key = getModelKey(meta.providerId, meta.model);
  let bucket = trafficBuckets.get(secondMs);

  if (!bucket) {
    bucket = new Map<string, number>();
    trafficBuckets.set(secondMs, bucket);
  }

  bucket.set(key, (bucket.get(key) ?? 0) + bytes);
  modelLastSeenAt.set(key, timestampMs);
  trimMonitorHistory(timestampMs);
}

export async function getAdminSystemMonitorSnapshot(): Promise<AdminSystemMonitorSnapshot> {
  const nowMs = Date.now();
  recordMemorySnapshot(nowMs);
  trimMonitorHistory(nowMs);

  const [status, installBinding] = await Promise.all([
    getOllamaStatus(),
    getInstallBindingStatus(),
  ]);
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);

  const memoryUsedHistory = memoryHistory.map((entry) => ({
    timestamp: new Date(entry.timestampMs).toISOString(),
    value: entry.usedBytes,
  }));
  const memoryFreeHistory = memoryHistory.map((entry) => ({
    timestamp: new Date(entry.timestampMs).toISOString(),
    value: entry.freeBytes,
  }));

  const aggregateTrafficHistory = buildSeriesFromBuckets(nowMs, (secondMs) => getBucketValue(secondMs));
  const modelSnapshots = new Map<string, SystemMonitorModelSnapshot>();

  for (const runtime of status.running) {
    const modelName = resolveRuntimeModelName(runtime);
    const key = getModelKey("ollama", modelName);
    const activeMemoryBytes = typeof runtime.size_vram === "number" && runtime.size_vram > 0
      ? runtime.size_vram
      : resolveInstalledEstimate(status, modelName);

    modelSnapshots.set(key, {
      key,
      providerId: "ollama",
      model: modelName,
      activeMemoryBytes,
      estimatedFootprintBytes: resolveInstalledEstimate(status, modelName),
      currentBytesPerSecond: getCurrentBytesPerSecond(nowMs, key),
      history: buildSeriesFromBuckets(nowMs, (secondMs) => getBucketValue(secondMs, key)),
      lastSeenAt: modelLastSeenAt.has(key) ? new Date(modelLastSeenAt.get(key) ?? nowMs).toISOString() : status.fetchedAt,
    });
  }

  for (const [key, timestampMs] of modelLastSeenAt.entries()) {
    if (modelSnapshots.has(key)) {
      continue;
    }

    const separatorIndex = key.indexOf(":");
    const providerId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : "ollama";
    const model = separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key;

    modelSnapshots.set(key, {
      key,
      providerId,
      model,
      activeMemoryBytes: providerId === "ollama" ? resolveInstalledEstimate(status, model) : null,
      estimatedFootprintBytes: providerId === "ollama" ? resolveInstalledEstimate(status, model) : null,
      currentBytesPerSecond: getCurrentBytesPerSecond(nowMs, key),
      history: buildSeriesFromBuckets(nowMs, (secondMs) => getBucketValue(secondMs, key)),
      lastSeenAt: new Date(timestampMs).toISOString(),
    });
  }

  return {
    capturedAt: new Date(nowMs).toISOString(),
    runningModelCount: status.runningCount,
    installBinding,
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usedHistory: memoryUsedHistory,
      freeHistory: memoryFreeHistory,
    },
    traffic: {
      currentBytesPerSecond: getCurrentBytesPerSecond(nowMs),
      history: aggregateTrafficHistory,
    },
    models: [...modelSnapshots.values()].sort((left, right) => {
      if (right.currentBytesPerSecond !== left.currentBytesPerSecond) {
        return right.currentBytesPerSecond - left.currentBytesPerSecond;
      }

      const leftMemory = left.activeMemoryBytes ?? left.estimatedFootprintBytes ?? 0;
      const rightMemory = right.activeMemoryBytes ?? right.estimatedFootprintBytes ?? 0;

      return rightMemory - leftMemory || left.model.localeCompare(right.model);
    }),
  };
}