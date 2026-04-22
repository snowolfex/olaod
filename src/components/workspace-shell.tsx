"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CommandDeckHud } from "@/components/command-deck-hud";
import { InteractionSurface } from "@/components/interaction-surface";
import type {
  ActiveConversationSnapshot,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

type WorkspaceShellProps = {
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
  initialConversation,
  initialConversations,
  initialDesktopPage,
  initialStatus,
  initialUserSession,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [activeWorkspacePage, setActiveWorkspacePage] = useState<DesktopWorkspacePage>(initialDesktopPage);
  const [activeConversation, setActiveConversation] = useState<ActiveConversationSnapshot | null>(
    initialConversation
      ? {
        archivedAt: initialConversation.archivedAt,
        id: initialConversation.id,
        messageCount: initialConversation.messages.length,
        title: initialConversation.title,
      }
      : null,
  );
  const [isNavigatingWorkspacePage, setIsNavigatingWorkspacePage] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [rememberLogoutChoice, setRememberLogoutChoice] = useState(false);

  useEffect(() => {
    setActiveWorkspacePage(initialDesktopPage);
    setIsNavigatingWorkspacePage(false);
  }, [initialDesktopPage]);

  useEffect(() => {
    setActiveConversation(
      initialConversation
        ? {
          archivedAt: initialConversation.archivedAt,
          id: initialConversation.id,
          messageCount: initialConversation.messages.length,
          title: initialConversation.title,
        }
        : null,
    );
  }, [initialConversation]);

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
        modelCount={initialStatus.modelCount}
        onNavigateWorkspacePage={navigateWorkspacePage}
        onRequestLogout={requestLogout}
        runningCount={initialStatus.runningCount}
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
          onDesktopPageChange={navigateWorkspacePage}
          onRequestLogout={requestLogout}
        />
      </div>

      {isLogoutDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.52)] px-4 py-6 backdrop-blur-sm">
          <div className="theme-surface-elevated w-full max-w-[36rem] max-h-[calc(100dvh-3rem)] overflow-hidden rounded-[34px] border border-line/80 p-3 shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
            <div className="glass-panel max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-[28px] p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-label text-xs font-semibold">Before you sign out</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                    Keep this conversation ready for next time?
                  </h2>
                </div>
                <span className="ui-pill ui-pill-surface border border-line text-xs text-muted">
                  Conversation safety
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-muted sm:text-[15px]">
                Your conversations already stay stored locally, which helps protect work if a machine crashes. Choose whether the current thread should stay in your active list or move into the archive before you log out.
              </p>

              <div className="theme-surface-panel mt-5 rounded-[24px] px-4 py-4">
                <p className="eyebrow text-muted">Current conversation</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {activeConversation?.title || "Current conversation"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  <span className="ui-pill ui-pill-surface border border-line">
                    {activeConversation?.messageCount ?? 0} message{activeConversation?.messageCount === 1 ? "" : "s"}
                  </span>
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {activeConversation?.archivedAt ? "Currently archived" : "Currently active"}
                  </span>
                </div>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-[22px] border border-line/80 px-4 py-4 text-sm text-foreground">
                <input
                  checked={rememberLogoutChoice}
                  className="mt-1 h-4 w-4 rounded border-line"
                  type="checkbox"
                  onChange={(event) => setRememberLogoutChoice(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-foreground">Do not ask again on this device</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    The button you choose below becomes the default logout behavior for this account on this machine until you clear the saved preference.
                  </span>
                </span>
              </label>

              {logoutError ? (
                <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                  {logoutError}
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <button
                  className="ui-button ui-button-secondary min-h-[3.5rem] justify-center px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("none", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? "Signing out..." : "No"}
                </button>
                <button
                  className="ui-button ui-button-primary min-h-[3.5rem] justify-center px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("continue", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? "Saving..." : activeConversation?.archivedAt ? "Yes, Continue" : "Yes, Continue"}
                </button>
                <button
                  className="ui-button ui-button-secondary min-h-[3.5rem] justify-center border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    void completeLogout("archive", rememberLogoutChoice);
                  }}
                >
                  {isLoggingOut ? "Archiving..." : "Archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}