"use client";

import { AdminSystemMonitor } from "@/components/admin-system-monitor";
import { ModelOperationsPanel } from "@/components/model-operations-panel";
import { UserAccessPanel } from "@/components/user-access-panel";
import { translateUi, translateUiText } from "@/lib/ui-language";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus, VoiceTranscriptionLanguage } from "@/lib/user-types";

type AdminDeckProps = {
  activeTab: AdminTabId;
  onRequestLogout: () => Promise<void> | void;
  onSessionChange: (status: UserSessionStatus) => void;
  onTabChange: (tab: AdminTabId) => void;
  surface?: "embedded" | "page";
  status: OllamaStatus;
  uiLanguagePreference: VoiceTranscriptionLanguage;
  userSession: UserSessionStatus;
};

export type AdminTabId = "access" | "models" | "jobs" | "activity";

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
  onRequestLogout,
  onSessionChange,
  onTabChange,
  surface = "embedded",
  status,
  uiLanguagePreference,
  userSession,
}: AdminDeckProps) {
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = (text: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, text, variables);
  const roleLabel = (role: "admin" | "operator" | "viewer") =>
    role === "viewer" ? "Viewer" : t(role);
  const adminTabs: Array<{
    id: AdminTabId;
    label: string;
    hint: string;
    detail: string;
    eyebrow: string;
    ariaLabel: string;
  }> = [
    { id: "access", label: t("access"), hint: t("access"), detail: t("accountAndAccess"), eyebrow: t("identity"), ariaLabel: literal("Identity Access Account and access") },
    { id: "models", label: t("modelsTab"), hint: t("models"), detail: t("models"), eyebrow: t("runtime"), ariaLabel: literal("Runtime Models Library and ready") },
    { id: "jobs", label: t("jobs"), hint: t("jobs"), detail: t("jobs"), eyebrow: t("execution"), ariaLabel: literal("Execution Jobs Queue and detail") },
    { id: "activity", label: t("activity"), hint: t("activity"), detail: t("activity"), eyebrow: t("activity"), ariaLabel: literal("Audit Activity Audit trail") },
  ];
  const isAdminSession = userSession.user?.role === "admin";
  const availableTabs = isAdminSession
    ? adminTabs
    : adminTabs.filter((tab) => tab.id === "access");
  const activeTabMeta = availableTabs.find((tab) => tab.id === activeTab) ?? availableTabs[0];
  const isPageSurface = surface === "page";
  const runningModelsCount = status.runningCount;
  const isGatewayHealthy = status.isReachable;

  return (
    <section data-tour-id="admin-shell" className={isPageSurface ? "glass-panel flex flex-col rounded-[32px] p-4 sm:rounded-[36px] sm:p-6" : "flex min-h-0 flex-col gap-3"}>
      {isPageSurface ? (
        <div className="theme-surface-elevated rounded-[28px] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="section-label text-xs font-semibold">{t("adminPage")}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
                {isAdminSession ? t("operationsAndAccessControl") : t("accountAndAccess")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
                {isAdminSession
                  ? t("operationsAndAccessControl")
                  : t("accountAndAccess")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`ui-pill ${status.isReachable ? "ui-pill-success" : "ui-pill-warning"}`}>
                {status.isReachable ? t("gatewayOnline") : t("gatewayOffline")}
              </span>
              <span className="ui-pill ui-pill-label">
                {userSession.user?.displayName ?? "Guest"}
              </span>
              <span className="ui-pill ui-pill-meta text-xs text-muted">
                {roleLabel(userSession.user?.role ?? "viewer")}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">{t("currentArea")}</p>
              <p className="mt-2 text-base font-semibold text-foreground">{activeTabMeta?.label ?? t("access")}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{activeTabMeta?.hint ?? t("access")}</p>
            </div>
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">{t("gatewayPosture")}</p>
              <p className="mt-2 text-base font-semibold text-foreground">{isGatewayHealthy ? t("operational") : t("attentionNeeded")}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {isGatewayHealthy
                  ? literal("{modelCount} models visible, {runningModelsCount} active runtime(s).", {
                      modelCount: status.modelCount,
                      runningModelsCount,
                    })
                  : literal("Gateway refreshes are degraded, so operational data may be stale.")}
              </p>
            </div>
            <div className="theme-surface-soft rounded-[22px] px-4 py-4">
              <p className="eyebrow text-muted">{t("accessScope")}</p>
              <p className="mt-2 text-base font-semibold text-foreground">{isAdminSession ? t("fullDeck") : t("limitedDeck")}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {literal("{userCount} workspace user(s) with {sectionCount} visible admin section(s).", {
                  userCount: userSession.userCount,
                  sectionCount: availableTabs.length,
                })}
              </p>
            </div>
          </div>

          <div className="theme-surface-panel mt-4 rounded-[24px] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="eyebrow text-muted">{t("currentBriefing")}</p>
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
                  <p className="eyebrow text-muted">{isAdminSession ? t("modelsReady") : t("signedInRole")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{isAdminSession ? status.modelCount : roleLabel(userSession.user?.role ?? "viewer")}</p>
                </div>
                <div className="theme-surface-soft rounded-[20px] px-3 py-3">
                  <p className="eyebrow text-muted">{isAdminSession ? t("runtimeLive") : t("gatewayStatus")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{isAdminSession ? runningModelsCount : isGatewayHealthy ? t("online") : t("offline")}</p>
                </div>
              </div>
            </div>
          </div>

          {isAdminSession ? <AdminSystemMonitor uiLanguagePreference={uiLanguagePreference} /> : null}
        </div>
      ) : null}

      <div className={isPageSurface ? "mt-4" : ""}>
        <div data-tour-id="admin-tabs" className="glass-panel sticky top-3 z-10 rounded-[28px] p-2.5 sm:rounded-[30px] sm:p-3 lg:static">
          <div className={isPageSurface ? "grid gap-2 xl:grid-cols-4" : "grid grid-cols-2 gap-2"}>
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  aria-label={tab.ariaLabel}
                  key={tab.id}
                  className={`rounded-[22px] border px-4 py-4 text-left transition ${isPageSurface ? "min-h-[8.25rem]" : "min-h-[4rem]"} ${isActive ? "theme-accent-gradient border-transparent text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "ui-button-surface theme-surface-strong text-foreground hover:border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"}`}
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

      {!isPageSurface && isAdminSession ? (
        <AdminSystemMonitor uiLanguagePreference={uiLanguagePreference} variant="compact" />
      ) : null}

      <div data-tour-id={`admin-panel-${activeTab}`} className={isPageSurface ? "mt-4 pr-1" : "min-h-0 flex-1 overflow-y-auto pr-1"}>
        {activeTab === "access" ? (
          <UserAccessPanel availableModels={status.models} onRequestLogout={onRequestLogout} onSessionChange={onSessionChange} session={userSession} surface={isPageSurface ? "page" : "embedded"} uiLanguagePreference={uiLanguagePreference} />
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
            uiLanguagePreference={uiLanguagePreference}
            userCount={userSession.userCount}
            version={status.version}
            view={activeTab}
          />
        )}
      </div>
    </section>
  );
}