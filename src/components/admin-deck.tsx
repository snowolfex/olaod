"use client";

import { ModelOperationsPanel } from "@/components/model-operations-panel";
import { UserAccessPanel } from "@/components/user-access-panel";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus } from "@/lib/user-types";

type AdminDeckProps = {
  activeTab: AdminTabId;
  onSessionChange: (status: UserSessionStatus) => void;
  onTabChange: (tab: AdminTabId) => void;
  surface?: "embedded" | "page";
  status: OllamaStatus;
  userSession: UserSessionStatus;
};

export type AdminTabId = "access" | "models" | "jobs" | "activity";

const adminTabs: Array<{
  id: AdminTabId;
  label: string;
  hint: string;
  detail: string;
  eyebrow: string;
}> = [
  {
    id: "access",
    label: "Access",
    hint: "Accounts and preferences",
    detail: "Manage sign-in state, self-service account settings, local users, and workspace backup safety from one place.",
    eyebrow: "Identity",
  },
  {
    id: "models",
    label: "Models",
    hint: "Library and ready",
    detail: "Inspect runtime readiness, model inventory, and download posture across the local stack.",
    eyebrow: "Runtime",
  },
  {
    id: "jobs",
    label: "Jobs",
    hint: "Queue and detail",
    detail: "Track queued and active operations with retry, cancellation, and timeline inspection tools.",
    eyebrow: "Execution",
  },
  {
    id: "activity",
    label: "Activity",
    hint: "Audit trail",
    detail: "Review operational history, warnings, and administrative change traces.",
    eyebrow: "Audit",
  },
];

function AccessIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    </svg>
  );
}

function ModelsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4 5 7.5 12 11l7-3.5L12 4Z" strokeLinejoin="round" />
      <path d="M5 12.5 12 16l7-3.5" strokeLinejoin="round" />
      <path d="M5 17.5 12 21l7-3.5" strokeLinejoin="round" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6.5h8" strokeLinecap="round" />
      <path d="M8 12h8" strokeLinecap="round" />
      <path d="M8 17.5h5" strokeLinecap="round" />
      <circle cx="6" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 18.5h14" strokeLinecap="round" />
      <path d="M7.5 15.5V10" strokeLinecap="round" />
      <path d="M12 15.5V6.5" strokeLinecap="round" />
      <path d="M16.5 15.5V12" strokeLinecap="round" />
    </svg>
  );
}

function AdminTabIcon({ tab }: { tab: AdminTabId }) {
  if (tab === "access") {
    return <AccessIcon />;
  }

  if (tab === "models") {
    return <ModelsIcon />;
  }

  if (tab === "jobs") {
    return <JobsIcon />;
  }

  return <ActivityIcon />;
}

export function AdminDeck({
  activeTab,
  onSessionChange,
  onTabChange,
  surface = "embedded",
  status,
  userSession,
}: AdminDeckProps) {
  const isAdminSession = userSession.user?.role === "admin";
  const availableTabs = isAdminSession
    ? adminTabs
    : adminTabs.filter((tab) => tab.id === "access");
  const activeTabMeta = availableTabs.find((tab) => tab.id === activeTab) ?? availableTabs[0];
  const isPageSurface = surface === "page";
  const runningModelsCount = status.runningCount;
  const isGatewayHealthy = status.isReachable;

  return (
    <section className={isPageSurface ? "glass-panel flex flex-col rounded-[32px] p-4 sm:rounded-[36px] sm:p-6" : "flex min-h-0 flex-col gap-3"}>
      {isPageSurface ? (
        <div className="theme-surface-elevated rounded-[28px] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="section-label text-xs font-semibold">Admin page</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
                {isAdminSession ? "Operations and access control" : "Account and access"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
                {isAdminSession
                  ? "The command deck now opens admin as a full desktop destination so user access, model operations, jobs, and activity can breathe outside the chat stage."
                  : "This destination keeps your account, sign-in controls, and workspace preferences separate from the chat stage without exposing admin-only tooling."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`ui-pill ${status.isReachable ? "ui-pill-success" : "ui-pill-warning"}`}>
                {status.isReachable ? "Gateway online" : "Gateway offline"}
              </span>
              <span className="ui-pill ui-pill-surface">
                {userSession.user?.displayName ?? "Guest"}
              </span>
              <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                {userSession.user?.role ?? "viewer"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">Current area</p>
              <p className="mt-2 text-base font-semibold text-foreground">{activeTabMeta?.label ?? "Users"}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{activeTabMeta?.hint ?? "Accounts and backup"}</p>
            </div>
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">Gateway posture</p>
              <p className="mt-2 text-base font-semibold text-foreground">{isGatewayHealthy ? "Operational" : "Attention needed"}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {isGatewayHealthy ? `${status.modelCount} models visible, ${runningModelsCount} active runtime${runningModelsCount === 1 ? "" : "s"}.` : "Gateway refreshes are degraded, so operational data may be stale."}
              </p>
            </div>
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">Access scope</p>
              <p className="mt-2 text-base font-semibold text-foreground">{isAdminSession ? "Full deck" : "Limited deck"}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{userSession.userCount} workspace user{userSession.userCount === 1 ? "" : "s"} with {availableTabs.length} visible admin section{availableTabs.length === 1 ? "" : "s"}.</p>
            </div>
          </div>

          <div className="theme-surface-panel mt-4 rounded-[24px] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="eyebrow text-muted">Current briefing</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(188,95,61,0.24)]">
                    <AdminTabIcon tab={activeTabMeta.id} />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{activeTabMeta.label}</p>
                    <p className="text-xs text-muted">{activeTabMeta.eyebrow}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{activeTabMeta.detail}</p>
              </div>

              <div className="grid min-w-[15rem] gap-2 sm:grid-cols-2">
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{isAdminSession ? "Models ready" : "Signed-in role"}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{isAdminSession ? status.modelCount : userSession.user?.role ?? "viewer"}</p>
                </div>
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{isAdminSession ? "Runtime live" : "Gateway status"}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{isAdminSession ? runningModelsCount : isGatewayHealthy ? "Online" : "Offline"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={isPageSurface ? "mt-4" : ""}>
        <div className="glass-panel sticky top-3 z-10 rounded-[28px] p-2.5 sm:rounded-[30px] sm:p-3 lg:static">
          <div className={isPageSurface ? "grid gap-2 xl:grid-cols-4" : "grid grid-cols-2 gap-2"}>
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={`rounded-[22px] border px-4 py-4 text-left transition ${isPageSurface ? "min-h-[8.25rem]" : "min-h-[4rem]"} ${isActive ? "theme-accent-gradient border-transparent text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "theme-surface-strong text-foreground hover:border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"}`}
                  data-help-id={tab.id === "access" ? "admin.users" : tab.id === "models" ? "admin.models" : tab.id === "jobs" ? "admin.jobs" : "admin.activity"}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isActive ? "bg-white/18 text-white" : "theme-accent-soft"}`}>
                      <AdminTabIcon tab={tab.id} />
                    </span>
                    <span className={`ui-pill ${isActive ? "border border-white/20 bg-white/12 text-white" : "ui-pill-surface"}`}>
                      {tab.eyebrow}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-semibold">{tab.label}</p>
                  <p className={`mt-1 text-[11px] ${isActive ? "text-white/80" : "text-muted"}`}>{tab.hint}</p>
                  {isPageSurface ? (
                    <p className={`mt-3 text-xs leading-5 ${isActive ? "text-white/78" : "text-muted"}`}>{tab.detail}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={isPageSurface ? "mt-4 pr-1" : "min-h-0 flex-1 overflow-y-auto pr-1"}>
        {activeTab === "access" ? (
          <UserAccessPanel availableModels={status.models} onSessionChange={onSessionChange} session={userSession} surface={isPageSurface ? "page" : "embedded"} />
        ) : (
          <ModelOperationsPanel
            cli={status.cli}
            currentUser={userSession.user}
            fetchedAt={status.fetchedAt}
            isReachable={status.isReachable}
            models={status.models}
            onStatusChange={() => {
              // The parent surface owns live status refreshes.
            }}
            runningModels={status.running}
            runningCount={status.runningCount}
            server={status.server}
            surface={isPageSurface ? "page" : "embedded"}
            userCount={userSession.userCount}
            version={status.version}
            view={activeTab}
          />
        )}
      </div>
    </section>
  );
}