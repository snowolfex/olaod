"use client";

import { useCallback, useEffect, useState } from "react";

import { translateUiText } from "@/lib/ui-language";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

type AppUpdateStatus = {
  autoCheckEnabled: boolean;
  canApplyUpdate: boolean;
  channel: string | null;
  checkedAt: string | null;
  currentVersion: string;
  installRoot: string | null;
  latestVersion: string | null;
  manifestSignatureKeyId: string | null;
  notes: string | null;
  packageFormat: "zip" | "tar.gz" | null;
  packageUrl: string | null;
  publishedAt: string | null;
  signatureVerified: boolean;
  statusMessage: string | null;
  updateAvailable: boolean;
  updateConfigured: boolean;
};

type AppUpdateMonitorProps = {
  canManageUpdates: boolean;
  displayMode?: "floating" | "inline";
  uiLanguagePreference: VoiceTranscriptionLanguage;
};

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function AppUpdateMonitor({ canManageUpdates, displayMode = "floating", uiLanguagePreference }: AppUpdateMonitorProps) {
  const literal = useCallback(
    (sourceText: string, variables?: Record<string, string | number>) =>
      translateUiText(uiLanguagePreference, sourceText, variables),
    [uiLanguagePreference],
  );
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState<string | null>(null);

  const loadStatus = useCallback(async (forceRefresh = false) => {
    setApplyError(null);
    setIsChecking(true);

    try {
      const response = await fetch(forceRefresh ? "/api/system/update?refresh=1" : "/api/system/update", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextStatus = (await response.json()) as AppUpdateStatus;
      setStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : literal("Unable to check for updates.");
      setApplyError(message);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [literal]);

  useEffect(() => {
    let cancelled = false;

    void loadStatus().then((nextStatus) => {
      if (cancelled || !nextStatus) {
        return;
      }

      setStatus(nextStatus);
    });

    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!isApplying || !targetVersion) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch("/api/system/update?refresh=1", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const nextStatus = (await response.json()) as AppUpdateStatus;

        if (cancelled) {
          return;
        }

        setStatus(nextStatus);

        if (nextStatus.currentVersion === targetVersion || (!nextStatus.updateAvailable && nextStatus.currentVersion === targetVersion)) {
          setApplySummary(literal("Updated to {version}. Reloading the interface.", { version: targetVersion }));
          setIsApplying(false);
          window.setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } catch {
        // The server is expected to drop briefly while the patch restarts it.
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isApplying, literal, targetVersion]);

  const applyUpdate = async () => {
    setApplyError(null);
    setApplySummary(null);

    try {
      const response = await fetch("/api/admin/system/update", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as { targetVersion?: string };
      const nextTargetVersion = data.targetVersion ?? status?.latestVersion ?? null;
      setTargetVersion(nextTargetVersion);
      setIsApplying(true);
      setApplySummary(nextTargetVersion
        ? literal("Applying {version}. The app will restart automatically.", { version: nextTargetVersion })
        : literal("Applying the live patch. The app will restart automatically."));
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : literal("Unable to start the live patch."));
      setIsApplying(false);
    }
  };

  if (!canManageUpdates) {
    return null;
  }

  const statusTone = status?.updateAvailable
    ? {
      badgeClassName: "bg-rose-500",
      badgeLabel: literal("Update available"),
      panelClassName: "border-rose-200/80 bg-[linear-gradient(145deg,rgba(255,248,248,0.98),rgba(255,236,232,0.96))]",
      pillClassName: "border-rose-200 bg-rose-50/90 text-rose-900",
    }
    : status?.signatureVerified
      ? {
        badgeClassName: "bg-emerald-500",
        badgeLabel: literal("Up to date"),
        panelClassName: "border-emerald-200/80 bg-[linear-gradient(145deg,rgba(248,255,251,0.98),rgba(237,250,242,0.96))]",
        pillClassName: "border-emerald-200 bg-emerald-50/90 text-emerald-900",
      }
      : {
        badgeClassName: "bg-amber-500",
        badgeLabel: literal("Needs attention"),
        panelClassName: "border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,252,247,0.98),rgba(247,239,227,0.96))]",
        pillClassName: "border-amber-200 bg-amber-50/90 text-amber-900",
      };

  const panelClassName = displayMode === "inline"
    ? `rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(71,44,20,0.12)] ${statusTone.panelClassName}`
    : `pointer-events-auto w-full max-w-[30rem] rounded-[28px] border p-4 shadow-[0_26px_70px_rgba(71,44,20,0.18)] backdrop-blur-xl sm:max-w-[32rem] ${statusTone.panelClassName}`;

  const content = (
    <div className={panelClassName}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-3 w-3 rounded-full ${statusTone.badgeClassName}`} aria-hidden="true" />
            <p className="section-label text-xs font-semibold">{literal("Updates")}</p>
            <span className={`ui-pill inline-flex border text-[11px] ${statusTone.pillClassName}`}>
              {isChecking ? literal("Checking...") : statusTone.badgeLabel}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
            {status?.updateAvailable && status.latestVersion
              ? literal("Version {version} is ready to install", { version: status.latestVersion })
              : literal("Version {version} is current", { version: status?.currentVersion ?? "..." })}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {status?.channel
              ? literal("Running {version} on the {channel} channel.", {
                version: status.currentVersion,
                channel: status.channel,
              })
              : literal("Running {version}.", { version: status?.currentVersion ?? "..." })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
            {status?.packageFormat ?? literal("manifest")}
          </span>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isChecking || isApplying}
            type="button"
            onClick={() => {
              void loadStatus(true);
            }}
          >
            {isChecking ? literal("Checking...") : literal("Check now")}
          </button>
          <button
            className="ui-button ui-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status?.canApplyUpdate || isApplying}
            type="button"
            onClick={applyUpdate}
          >
            {isApplying ? literal("Installing...") : literal("Install update")}
          </button>
        </div>
      </div>

      {status?.notes ? (
        <p className="mt-3 text-sm leading-6 text-muted">{status.notes}</p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Current")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.currentVersion ?? "..."}</p>
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Latest")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.latestVersion ?? literal("Current")}</p>
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Signature")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.signatureVerified ? literal("Verified") : literal("Not verified")}</p>
          {status?.manifestSignatureKeyId ? (
            <p className="mt-1 text-xs text-muted">{status.manifestSignatureKeyId}</p>
          ) : null}
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Last checked")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : literal("Pending")}</p>
          <p className="mt-1 text-xs text-muted">{status?.autoCheckEnabled ? literal("Auto-check runs on launch.") : literal("Auto-check on launch is disabled.")}</p>
        </div>
      </div>

      {status?.statusMessage ? (
        <p className="mt-4 text-xs leading-5 text-muted">{status.statusMessage}</p>
      ) : null}

      {applySummary ? (
        <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          {applySummary}
        </div>
      ) : null}

      {applyError ? (
        <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          {applyError}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        {status?.canApplyUpdate
          ? literal("The server will restart automatically after the signed patch is staged and verified.")
          : literal("Install stays disabled until a signed package for this platform is available and this runtime exposes an install root.")}
      </p>
    </div>
  );

  if (displayMode === "inline") {
    return content;
  }

  if (isChecking || !status?.updateAvailable) {
    return null;
  }

  return <div className="pointer-events-none fixed inset-x-3 top-3 z-40 flex justify-center sm:inset-x-auto sm:right-4 sm:top-4 sm:justify-end">{content}</div>;
}