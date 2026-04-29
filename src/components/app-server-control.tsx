"use client";

import { useCallback, useEffect, useState } from "react";

import { translateUiText } from "@/lib/ui-language";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

type AppServerControlStatus = {
  actionInFlight: boolean;
  appPort: number;
  baseUrl: string;
  canRestart: boolean;
  canStart: boolean;
  canStop: boolean;
  controlUrl: string;
  lastAction: "start" | "stop" | "restart" | null;
  lastActionAt: string | null;
  lastError: string | null;
  pid: number | null;
  running: boolean;
  startMode: string | null;
};

type AppServerControlProps = {
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

function formatActionLabel(action: AppServerControlStatus["lastAction"]) {
  if (!action) {
    return "Idle";
  }

  return action[0].toUpperCase() + action.slice(1);
}

export function AppServerControl({ uiLanguagePreference }: AppServerControlProps) {
  const literal = useCallback(
    (sourceText: string, variables?: Record<string, string | number>) =>
      translateUiText(uiLanguagePreference, sourceText, variables),
    [uiLanguagePreference],
  );
  const [status, setStatus] = useState<AppServerControlStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/system/server", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextStatus = (await response.json()) as AppServerControlStatus;
      setStatus(nextStatus);
      setErrorMessage(null);
      return nextStatus;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : literal("Unable to read the local app server status.");
      setErrorMessage(messageText);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [literal]);

  useEffect(() => {
    void loadStatus();
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadStatus]);

  const submitAction = useCallback(async (action: "start" | "stop" | "restart") => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(action === "stop"
      ? literal("Stopping the app on port {port}. This Admin page will disconnect until it is started again.", { port: status?.appPort ?? 3000 })
      : action === "restart"
        ? literal("Restarting the app on port {port}. Expect a brief disconnect.", { port: status?.appPort ?? 3000 })
        : literal("Starting the app on port {port}.", { port: status?.appPort ?? 3000 }));

    try {
      const response = await fetch("/api/admin/system/server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { status: AppServerControlStatus };
      setStatus(payload.status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : literal("Unable to control the local app server."));
    } finally {
      setIsSubmitting(false);
    }
  }, [literal, status?.appPort]);

  const statusTone = status?.running
    ? {
      badgeClassName: "bg-emerald-500",
      badgeLabel: literal("Running"),
      panelClassName: "border-sky-200/80 bg-[linear-gradient(145deg,rgba(247,252,255,0.98),rgba(236,246,255,0.96))]",
      pillClassName: "border-emerald-200 bg-emerald-50/90 text-emerald-900",
    }
    : {
      badgeClassName: "bg-amber-500",
      badgeLabel: literal("Stopped"),
      panelClassName: "border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,252,247,0.98),rgba(247,239,227,0.96))]",
      pillClassName: "border-amber-200 bg-amber-50/90 text-amber-900",
    };

  return (
    <div className={`rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(71,44,20,0.12)] ${statusTone.panelClassName}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-3 w-3 rounded-full ${statusTone.badgeClassName}`} aria-hidden="true" />
            <p className="section-label text-xs font-semibold">{literal("App server")}</p>
            <span className={`ui-pill inline-flex border text-[11px] ${statusTone.pillClassName}`}>
              {isLoading ? literal("Checking...") : statusTone.badgeLabel}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
            {status?.running
              ? literal("Local server is live on port {port}", { port: status.appPort })
              : literal("Local server on port {port} is stopped", { port: status?.appPort ?? 3000 })}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {literal("This control uses a local broker outside the app, so it can stop or restart the current process and still bring it back later.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
            {status?.startMode ?? literal("broker")}
          </span>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || isSubmitting}
            type="button"
            onClick={() => {
              void loadStatus();
            }}
          >
            {isLoading ? literal("Checking...") : literal("Refresh")}
          </button>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status?.canStart || isSubmitting}
            type="button"
            onClick={() => {
              void submitAction("start");
            }}
          >
            {isSubmitting && status?.lastAction === "start" ? literal("Starting...") : literal("Start app")}
          </button>
          <button
            className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status?.canRestart || isSubmitting}
            type="button"
            onClick={() => {
              void submitAction("restart");
            }}
          >
            {isSubmitting && status?.lastAction === "restart" ? literal("Restarting...") : literal("Restart app")}
          </button>
          <button
            className="ui-button ui-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status?.canStop || isSubmitting}
            type="button"
            onClick={() => {
              void submitAction("stop");
            }}
          >
            {isSubmitting && status?.lastAction === "stop" ? literal("Stopping...") : literal("Stop app")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Port")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.appPort ?? 3000}</p>
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("PID")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{status?.pid ?? literal("Unavailable")}</p>
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Last action")}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{formatActionLabel(status?.lastAction ?? null)}</p>
        </div>
        <div className="rounded-[20px] bg-white/75 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">{literal("Fallback control")}</p>
          {status?.controlUrl ? (
            <a className="mt-2 inline-flex text-sm font-semibold text-[var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4" href={status.controlUrl} rel="noreferrer" target="_blank">
              {literal("Open broker page")}
            </a>
          ) : (
            <p className="mt-2 text-sm font-semibold text-foreground">{literal("Unavailable")}</p>
          )}
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          {errorMessage}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        {literal("If you stop the app entirely, this Admin page disappears with it. Use the broker page to start it again without reopening a terminal.")}
      </p>
    </div>
  );
}