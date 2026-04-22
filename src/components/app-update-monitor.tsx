"use client";

import { useEffect, useState } from "react";

type AppUpdateStatus = {
  canApplyUpdate: boolean;
  channel: string | null;
  currentVersion: string;
  installRoot: string | null;
  latestVersion: string | null;
  notes: string | null;
  packageFormat: "zip" | "tar.gz" | null;
  packageUrl: string | null;
  publishedAt: string | null;
  statusMessage: string | null;
  updateAvailable: boolean;
  updateConfigured: boolean;
};

type AppUpdateMonitorProps = {
  canManageUpdates: boolean;
};

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function AppUpdateMonitor({ canManageUpdates }: AppUpdateMonitorProps) {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/system/update", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const nextStatus = (await response.json()) as AppUpdateStatus;

        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (error) {
        if (!cancelled) {
          setApplyError(error instanceof Error ? error.message : "Unable to check for updates.");
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isApplying || !targetVersion) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch("/api/system/update", {
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
          setApplySummary(`Updated to ${targetVersion}. Reloading the interface.`);
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
  }, [isApplying, targetVersion]);

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
        ? `Applying ${nextTargetVersion}. The app will restart automatically.`
        : "Applying the live patch. The app will restart automatically.");
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Unable to start the live patch.");
      setIsApplying(false);
    }
  };

  if (!canManageUpdates || isChecking || !status?.updateAvailable) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-40 flex justify-center sm:inset-x-auto sm:right-4 sm:top-4 sm:justify-end">
      <div className="pointer-events-auto w-full max-w-[30rem] rounded-[28px] border border-line/80 bg-[linear-gradient(145deg,rgba(255,252,247,0.98),rgba(247,239,227,0.96))] p-4 shadow-[0_26px_70px_rgba(71,44,20,0.18)] backdrop-blur-xl sm:max-w-[32rem]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label text-xs font-semibold">Live update ready</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-foreground">
              {status.latestVersion ? `Version ${status.latestVersion} is available` : "A newer version is available"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Running {status.currentVersion}{status.channel ? ` on the ${status.channel} channel.` : "."}
            </p>
          </div>
          <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
            {status.packageFormat ?? "patch"}
          </span>
        </div>

        {status.notes ? (
          <p className="mt-3 text-sm leading-6 text-muted">{status.notes}</p>
        ) : null}

        {status.statusMessage ? (
          <p className="mt-3 text-xs leading-5 text-muted">{status.statusMessage}</p>
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="ui-button ui-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status.canApplyUpdate || isApplying}
            type="button"
            onClick={applyUpdate}
          >
            {isApplying ? "Applying update..." : "Apply live update"}
          </button>
          <span className="text-xs text-muted">
            {status.canApplyUpdate
              ? "The server will restart automatically after the patch is staged."
              : "This deployment can see the update, but it cannot patch itself in place from the current runtime."}
          </span>
        </div>
      </div>
    </div>
  );
}