"use client";

import { useEffect, useState } from "react";

import type { AdminSystemMonitorSnapshot, SystemMonitorSeriesPoint } from "@/lib/system-monitor-types";
import { translateUiText } from "@/lib/ui-language";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

type AdminSystemMonitorProps = {
  variant?: "default" | "compact";
  uiLanguagePreference: VoiceTranscriptionLanguage;
};

const monitorPollIntervalMs = 2000;

function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown";
  }

  const gib = 1024 ** 3;
  const mib = 1024 ** 2;

  if (bytes >= gib) {
    return `${(bytes / gib).toFixed(bytes >= 10 * gib ? 0 : 1)} GB`;
  }

  return `${Math.max(1, Math.round(bytes / mib))} MB`;
}

function formatMbps(bytesPerSecond: number) {
  const megabytesPerSecond = bytesPerSecond / (1024 ** 2);

  if (megabytesPerSecond >= 10) {
    return `${megabytesPerSecond.toFixed(1)} MB/s`;
  }

  if (megabytesPerSecond >= 1) {
    return `${megabytesPerSecond.toFixed(2)} MB/s`;
  }

  if (megabytesPerSecond >= 0.1) {
    return `${megabytesPerSecond.toFixed(3)} MB/s`;
  }

  return `${megabytesPerSecond.toFixed(4)} MB/s`;
}

function formatTimeAgo(value: string | null) {
  if (!value) {
    return "No traffic yet";
  }

  const deltaMs = Date.now() - new Date(value).getTime();

  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return "Just now";
  }

  if (deltaMs < 10_000) {
    return "Just now";
  }

  const seconds = Math.round(deltaMs / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function buildSparklinePath(points: SystemMonitorSeriesPoint[], maxValue: number) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = maxValue <= 0 ? 56 : 56 - (point.value / maxValue) * 56;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${Math.max(0, Math.min(56, y)).toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({
  accent,
  points,
}: {
  accent: string;
  points: SystemMonitorSeriesPoint[];
}) {
  const maxValue = Math.max(0, ...points.map((point) => point.value));
  const path = buildSparklinePath(points, maxValue);

  return (
    <svg aria-hidden="true" className="h-14 w-full" viewBox="0 0 100 56" preserveAspectRatio="none">
      <path d="M0,56 L100,56" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
      {path ? <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function AdminSystemMonitor({ uiLanguagePreference, variant = "default" }: AdminSystemMonitorProps) {
  const literal = (text: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, text, variables);
  const [snapshot, setSnapshot] = useState<AdminSystemMonitorSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refreshSnapshot = async () => {
      try {
        const response = await fetch("/api/admin/system/monitor", { cache: "no-store" });

        if (!response.ok) {
          throw new Error((await response.text()).trim() || "Unable to load system monitor.");
        }

        const payload = await response.json() as { snapshot: AdminSystemMonitorSnapshot };

        if (!cancelled) {
          setSnapshot(payload.snapshot);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load system monitor.");
        }
      }
    };

    void refreshSnapshot();
    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, monitorPollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const memoryAvailableBytes = snapshot?.memory.freeBytes ?? 0;
  const memoryUsedBytes = snapshot?.memory.usedBytes ?? 0;
  const totalTraffic = snapshot?.traffic.currentBytesPerSecond ?? 0;
  const activeModels = snapshot?.models ?? [];
  const topModel = activeModels[0] ?? null;
  const isCompact = variant === "compact";

  return (
    <div className={`theme-surface-panel ${isCompact ? "rounded-[24px] px-4 py-4" : "mt-4 rounded-[28px] px-5 py-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="eyebrow text-muted">{literal("System monitor")}</p>
          <h3 className="mt-2 text-lg font-semibold text-foreground sm:text-xl">{literal("Live runtime and model traffic")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isCompact
              ? literal("App-routed traffic and memory pressure for the models this workspace is actively touching.")
              : literal("This panel tracks app-routed model traffic plus current machine memory so you can see active runtime pressure near real time.")}
          </p>
        </div>
        <div className="theme-surface-soft rounded-[20px] px-4 py-3 text-right">
          <p className="eyebrow text-muted">{literal("Refresh cadence")}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{literal("About every 2 seconds")}</p>
          <p className="mt-1 text-xs text-muted">{snapshot ? new Date(snapshot.capturedAt).toLocaleTimeString() : literal("Waiting for first sample")}</p>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${isCompact ? "xl:grid-cols-3" : "lg:grid-cols-3"}`}>
        <div className="theme-surface-soft rounded-[22px] px-4 py-4">
          <p className="eyebrow text-muted">{literal("Available memory")}</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{formatBytes(memoryAvailableBytes)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {literal("Using {used} of {total} right now.", {
              used: formatBytes(memoryUsedBytes),
              total: formatBytes(snapshot?.memory.totalBytes ?? 0),
            })}
          </p>
          <div className="mt-3">
            <Sparkline accent="#f97316" points={snapshot?.memory.usedHistory ?? []} />
          </div>
        </div>

        <div className="theme-surface-soft rounded-[22px] px-4 py-4">
          <p className="eyebrow text-muted">{literal("App-routed model traffic")}</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{formatMbps(totalTraffic)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {literal("Aggregate throughput attributed to model traffic flowing through the shared gateway.")}
          </p>
          <div className="mt-3">
            <Sparkline accent="#0f766e" points={snapshot?.traffic.history ?? []} />
          </div>
        </div>

        <div className="theme-surface-soft rounded-[22px] px-4 py-4">
          <p className="eyebrow text-muted">{literal("Hot model")}</p>
          <p className="mt-2 text-lg font-semibold text-foreground">{topModel?.model ?? literal("No active model traffic")}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {topModel
              ? literal("{provider} at {traffic} with {memory} active footprint.", {
                  provider: topModel.providerId,
                  traffic: formatMbps(topModel.currentBytesPerSecond),
                  memory: formatBytes(topModel.activeMemoryBytes ?? topModel.estimatedFootprintBytes),
                })
              : literal("Traffic cards fill in as chat requests move through the gateway.")}
          </p>
          <div className="mt-3">
            <Sparkline accent="#2563eb" points={topModel?.history ?? []} />
          </div>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${isCompact ? "xl:grid-cols-2" : "xl:grid-cols-2"}`}>
        {activeModels.length > 0 ? activeModels.slice(0, isCompact ? 4 : 6).map((model) => (
          <div key={model.key} className="theme-surface-elevated rounded-[24px] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{model.model}</p>
                  <span className="ui-pill ui-pill-meta text-[11px] text-muted">{model.providerId}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{literal("Last seen {when}", { when: formatTimeAgo(model.lastSeenAt) })}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatMbps(model.currentBytesPerSecond)}</p>
                <p className="text-xs text-muted">{formatBytes(model.activeMemoryBytes ?? model.estimatedFootprintBytes)} {literal("footprint")}</p>
              </div>
            </div>
            <div className="mt-3">
              <Sparkline accent="#14b8a6" points={model.history} />
            </div>
          </div>
        )) : (
          <div className="theme-surface-soft rounded-[24px] px-4 py-5 text-sm text-muted xl:col-span-2">
            {literal("No model-specific traffic has been observed yet. Send a chat request or start a runtime to populate the monitor.")}
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-4 text-xs text-[var(--danger)]">{errorMessage}</p>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-muted">
        {literal("Network values are attributed to gateway traffic by model, not low-level NIC counters. Local-memory values come from the current machine plus the active Ollama runtime footprint when available.")}
      </p>
    </div>
  );
}