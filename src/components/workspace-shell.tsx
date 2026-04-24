"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CommandDeckHud } from "@/components/command-deck-hud";
import { InteractionSurface } from "@/components/interaction-surface";
import { translateUi, translateUiText } from "@/lib/ui-language";
import type {
  ActiveConversationSnapshot,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus, VoiceTranscriptionLanguage } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

type WorkspaceShellProps = {
  defaultUiLanguage: VoiceTranscriptionLanguage;
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  initialDesktopPage: DesktopWorkspacePage;
  initialStatus: OllamaStatus;
  initialUserSession: UserSessionStatus;
};

type LogoutConversationAction = "none" | "continue" | "archive";

type LogoutConversationPreference = {
  action: LogoutConversationAction;
  skipPrompt: boolean;
};

const LOGOUT_CONVERSATION_PREFERENCE_STORAGE_KEY = "oload:logout-conversation-preference";

function getLogoutConversationPreferenceKey(userId?: string) {
  return `${LOGOUT_CONVERSATION_PREFERENCE_STORAGE_KEY}:${userId ?? "guest"}`;
}

function readLogoutConversationPreference(userId?: string): LogoutConversationPreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLogoutConversationPreferenceKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<LogoutConversationPreference>;

    if (!parsed.skipPrompt || (parsed.action !== "none" && parsed.action !== "continue" && parsed.action !== "archive")) {
      return null;
    }

    return {
      action: parsed.action,
      skipPrompt: true,
    };
  } catch {
    return null;
  }
}

function writeLogoutConversationPreference(userId: string | undefined, preference: LogoutConversationPreference | null) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getLogoutConversationPreferenceKey(userId);

  if (!preference) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(preference));
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function WorkspaceShell({
  defaultUiLanguage,
  initialConversation,
  initialConversations,
  initialDesktopPage,
  initialStatus,
  initialUserSession,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [activeWorkspacePage, setActiveWorkspacePage] = useState<DesktopWorkspacePage>(initialDesktopPage);
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [activeConversation, setActiveConversation] = useState<ActiveConversationSnapshot | null>(
    initialConversation
      ? {
        archivedAt: initialConversation.archivedAt,
        id: initialConversation.id,
        messageCount: initialConversation.messages.length,
        modelName: initialConversation.settings.model,
        title: initialConversation.title,
      }
      : null,
  );
  const [isNavigatingWorkspacePage, setIsNavigatingWorkspacePage] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [rememberLogoutChoice, setRememberLogoutChoice] = useState(false);
  const [uiLanguagePreference, setUiLanguagePreference] = useState<VoiceTranscriptionLanguage>(
    initialUserSession.user?.preferredVoiceTranscriptionLanguage ?? defaultUiLanguage,
  );

  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = (text: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, text, variables);

  useEffect(() => {
    setActiveWorkspacePage(initialDesktopPage);
    setIsNavigatingWorkspacePage(false);
  }, [initialDesktopPage]);

  useEffect(() => {
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setActiveConversation(
      initialConversation
        ? {
          archivedAt: initialConversation.archivedAt,
          id: initialConversation.id,
          messageCount: initialConversation.messages.length,
          modelName: initialConversation.settings.model,
          title: initialConversation.title,
        }
        : null,
    );
  }, [initialConversation]);

  const activeModelName = activeConversation?.modelName?.trim() ?? "";
  const isConversationModelRunning = Boolean(
    activeModelName
    && currentStatus.running.some((runtime) => runtime.model === activeModelName || runtime.name === activeModelName),
  );
  const isConversationModelInstalled = Boolean(
    activeModelName && currentStatus.models.some((model) => model.name === activeModelName),
  );
  const conversationModelNote = !activeModelName
    ? literal("No model is selected for this thread right now. If you keep it ready, the conversation will reopen, but you will need to choose a model before sending the next message.")
    : isConversationModelRunning
      ? literal("{modelName} is running now. Keeping this conversation ready will reopen this thread with that model still selected.", {
        modelName: activeModelName,
      })
      : isConversationModelInstalled
        ? literal("{modelName} is installed but not running right now. Keeping this conversation ready will reopen the thread with that model selected, and it will load when you start chatting again.", {
          modelName: activeModelName,
        })
        : literal("{modelName} is not available right now. If you keep this conversation ready, it will still reopen, but you may need to start Ollama or choose another model after you sign back in.", {
          modelName: activeModelName,
        });

  const completeLogout = async (action: LogoutConversationAction, rememberChoice = false) => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      if (rememberChoice) {
        writeLogoutConversationPreference(initialUserSession.user?.id, {
          action,
          skipPrompt: true,
        });
      } else {
        writeLogoutConversationPreference(initialUserSession.user?.id, null);
      }

      if (activeConversation?.id && action !== "none") {
        const response = await fetch(`/api/conversations/${activeConversation.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            archived: action === "archive",
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
      }

      const logoutResponse = await fetch("/api/users/logout", {
        method: "POST",
      });

      if (!logoutResponse.ok) {
        throw new Error(await readErrorMessage(logoutResponse));
      }

      setIsLogoutDialogOpen(false);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const requestLogout = async () => {
    const savedPreference = readLogoutConversationPreference(initialUserSession.user?.id);
    const hasActivePersistedConversation = Boolean(activeConversation?.id);

    if (!hasActivePersistedConversation) {
      await completeLogout("none", false);
      return;
    }

    if (savedPreference?.skipPrompt) {
      await completeLogout(savedPreference.action, false);
      return;
    }

    setRememberLogoutChoice(false);
    setLogoutError(null);
    setIsLogoutDialogOpen(true);
  };

  const navigateWorkspacePage = async (page: DesktopWorkspacePage) => {
    if (isNavigatingWorkspacePage || page === activeWorkspacePage) {
      return;
    }

    const previousPage = activeWorkspacePage;
    setActiveWorkspacePage(page);
    setIsNavigatingWorkspacePage(true);

    try {
      const response = await fetch("/api/workspace/page", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ page }),
      });

      if (!response.ok) {
        setActiveWorkspacePage(previousPage);
      }
    } catch {
      setActiveWorkspacePage(previousPage);
    } finally {
      startTransition(() => {
        router.refresh();
      });
    }
  };

  return (
    <>
      <CommandDeckHud
        activeWorkspacePage={activeWorkspacePage}
        baseUrl={initialStatus.baseUrl}
        currentUser={initialUserSession.user!}
        isNavigatingWorkspacePage={isNavigatingWorkspacePage}
        isReachable={initialStatus.isReachable}
        modelCount={currentStatus.modelCount}
        onNavigateWorkspacePage={navigateWorkspacePage}
        onRequestLogout={requestLogout}
        onUiLanguagePreferenceChange={setUiLanguagePreference}
        runningCount={currentStatus.runningCount}
        uiLanguagePreference={uiLanguagePreference}
        userCount={initialUserSession.userCount}
      />

      <div className="mx-auto flex min-h-full w-full max-w-[1800px] flex-col">
        <InteractionSurface
          activeDesktopPage={activeWorkspacePage}
          initialConversation={initialConversation}
          initialConversations={initialConversations}
          initialStatus={initialStatus}
          initialUserSession={initialUserSession}
          onActiveConversationChange={setActiveConversation}
          defaultUiLanguage={defaultUiLanguage}
          onDesktopPageChange={navigateWorkspacePage}
          onRequestLogout={requestLogout}
          onStatusChange={setCurrentStatus}
          onUiLanguagePreferenceChange={setUiLanguagePreference}
          uiLanguagePreference={uiLanguagePreference}
        />
      </div>

      {isLogoutDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.52)] px-4 py-6 backdrop-blur-sm">
          <div className="theme-surface-elevated w-full max-w-[36rem] max-h-[calc(100dvh-3rem)] overflow-hidden rounded-[34px] border border-line/80 p-3 shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
            <div className="glass-panel max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-[28px] p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-label text-xs font-semibold">{t("beforeSignOut")}</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                    {t("keepConversationReady")}
                  </h2>
                </div>
                <span className="ui-pill ui-pill-meta text-xs text-muted">
                  {t("conversationSafety")}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-muted sm:text-[15px]">
                {literal("Your conversations already stay stored locally, which helps protect work if a machine crashes. Choose whether this thread should stay ready to reopen where you left off, move into the archive so you can start it again later, or just sign out with no change.")}
              </p>

              <div className="theme-surface-panel mt-5 rounded-[24px] px-4 py-4">
                <p className="eyebrow text-muted">{t("currentConversation")}</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {activeConversation?.title || t("currentConversation")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  <span className="ui-pill ui-pill-label">
                    {(activeConversation?.messageCount ?? 0) === 1
                      ? literal("{count} message", { count: activeConversation?.messageCount ?? 0 })
                      : literal("{count} messages", { count: activeConversation?.messageCount ?? 0 })}
                  </span>
                  <span className="ui-pill ui-pill-label">
                    {activeModelName || t("noModelSelected")}
                  </span>
                  <span className="ui-pill ui-pill-meta text-xs text-muted">
                    {activeConversation?.archivedAt ? t("currentlyArchived") : t("currentlyActive")}
                  </span>
                  <span className="ui-pill ui-pill-meta text-xs text-muted">
                    {!activeModelName
                      ? t("pickModelLater")
                      : isConversationModelRunning
                        ? t("modelsReady")
                        : isConversationModelInstalled
                          ? t("installedNotRunning")
                          : t("modelUnavailable")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {conversationModelNote}
                </p>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-[22px] border border-line/80 px-4 py-4 text-sm text-foreground">
                <input
                  checked={rememberLogoutChoice}
                  className="mt-1 h-4 w-4 rounded border-line"
                  type="checkbox"
                  onChange={(event) => setRememberLogoutChoice(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">{t("doNotAskAgain")}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {literal("The exact choice you make below becomes the default logout behavior for this account on this machine until you clear the saved preference.")}
                  </span>
                </span>
              </label>

              {logoutError ? (
                <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                  {logoutError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-row gap-3">
                <button
                  className="ui-button ui-button-primary min-h-[3.5rem] min-w-0 flex-1 justify-center px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("continue", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? t("saving") : t("yes")}
                </button>
                <button
                  className="ui-button ui-button-secondary min-h-[3.5rem] min-w-0 flex-1 justify-center border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("archive", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? t("archiving") : t("archive")}
                </button>
                <button
                  className="ui-button ui-button-secondary min-h-[3.5rem] min-w-0 flex-1 justify-center px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("none", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? t("signingOut") : t("no")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}