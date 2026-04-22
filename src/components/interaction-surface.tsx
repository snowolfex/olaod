"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { AdminDeck } from "@/components/admin-deck";
import { ContextualHelpLayer } from "@/components/contextual-help-layer";
import type { AdminTabId } from "@/components/admin-deck";
import { ChatWorkspace } from "@/components/chat-workspace";
import { HelpPanel } from "@/components/help-panel";
import { getHelpSection, type HelpContext } from "@/lib/help-manual";
import type {
  ActiveConversationSnapshot,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

const DESKTOP_VIEWPORT_MEDIA_QUERY = "(min-width: 1024px)";
const HOVER_HELP_MEDIA_QUERY = "(any-hover: hover) and (any-pointer: fine)";

type InteractionSurfaceProps = {
  activeDesktopPage: DesktopWorkspacePage;
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  initialStatus: OllamaStatus;
  initialUserSession: UserSessionStatus;
  onActiveConversationChange?: (conversation: ActiveConversationSnapshot | null) => void;
  onDesktopPageChange: (page: DesktopWorkspacePage) => Promise<void> | void;
  onRequestLogout: () => Promise<void> | void;
  onStatusChange?: (status: OllamaStatus) => void;
};

type MobileDeckTab = "chat" | "admin" | "help";

const mobileDeckTabs: Array<{ id: MobileDeckTab; label: string; hint: string }> = [
  { id: "chat", label: "Chat", hint: "Comms" },
  { id: "admin", label: "Admin", hint: "Ops" },
  { id: "help", label: "Help", hint: "Guide" },
];

export function InteractionSurface({
  activeDesktopPage,
  initialConversation,
  initialConversations,
  initialStatus,
  initialUserSession,
  onActiveConversationChange,
  onDesktopPageChange,
  onRequestLogout,
  onStatusChange,
}: InteractionSurfaceProps) {
  const [status, setStatus] = useState(initialStatus);
  const [userSession, setUserSession] = useState(initialUserSession);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [canUseHoverHelp, setCanUseHoverHelp] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileDeckTab>("chat");
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTabId>("access");
  const [requestedHelpSectionId, setRequestedHelpSectionId] = useState<string | null>(null);
  const [requestedHelpSectionNonce, setRequestedHelpSectionNonce] = useState(0);
  const canOpenAdmin = Boolean(userSession.user);
  const canAccessAdminSubsections = userSession.user?.role === "admin";
  const adminAvailability = !canOpenAdmin ? "none" : canAccessAdminSubsections ? "full" : "access";
  const chatModels = Array.from(
    new Set(
      status.running.flatMap((runtime) => [runtime.model, runtime.name].filter((value): value is string => Boolean(value))),
    ),
  ).map((modelName) => {
    const installedMatch = status.models.find((model) => model.name === modelName);

    return installedMatch ?? {
      name: modelName,
      size: 0,
    };
  });
  const effectiveActiveMobileTab = adminAvailability === "none" && activeMobileTab === "admin"
    ? "chat"
    : activeMobileTab;
  const effectiveActiveAdminTab = adminAvailability === "full" ? activeAdminTab : "access";
  const adminHelpContext = canAccessAdminSubsections ? effectiveActiveAdminTab : "access";
  const helpContext: HelpContext = isDesktopViewport
    ? activeDesktopPage === "admin"
      ? adminHelpContext
      : "chat"
    : effectiveActiveMobileTab === "admin" && canOpenAdmin
      ? adminHelpContext
      : "chat";
  const visibleMobileDeckTabs = canOpenAdmin
    ? mobileDeckTabs
    : mobileDeckTabs.filter((tab) => tab.id !== "admin");

  const refreshStatus = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/ollama/status", { cache: "no-store" });

      const nextStatus = (await response.json()) as OllamaStatus;
      setStatus(nextStatus);
    } catch {
      // Keep the last known status in place when the refresh fails.
    }
  });

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_VIEWPORT_MEDIA_QUERY);
    const hoverHelpMediaQuery = window.matchMedia(HOVER_HELP_MEDIA_QUERY);

    const handleLayoutChange = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    const handleHoverHelpChange = () => {
      setCanUseHoverHelp(hoverHelpMediaQuery.matches);
    };

    handleLayoutChange();
    handleHoverHelpChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleLayoutChange);
      hoverHelpMediaQuery.addEventListener("change", handleHoverHelpChange);

      return () => {
        mediaQuery.removeEventListener("change", handleLayoutChange);
        hoverHelpMediaQuery.removeEventListener("change", handleHoverHelpChange);
      };
    }

    mediaQuery.addListener(handleLayoutChange);
    hoverHelpMediaQuery.addListener(handleHoverHelpChange);

    return () => {
      mediaQuery.removeListener(handleLayoutChange);
      hoverHelpMediaQuery.removeListener(handleHoverHelpChange);
    };
  }, []);

  useEffect(() => {
    void refreshStatus();

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, status.isReachable ? 30_000 : 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshStatus();
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status.isReachable]);

  async function openHelpSection(sectionId: string) {
    const section = getHelpSection(sectionId);

    if (isDesktopViewport) {
      await onDesktopPageChange("help");
    } else {
      setActiveMobileTab("help");
    }

    if (section && section.context !== "chat" && canAccessAdminSubsections) {
      setActiveAdminTab(section.context);
    }

    setRequestedHelpSectionId(sectionId);
    setRequestedHelpSectionNonce((current) => current + 1);
  }

  function handleSessionChange(nextSession: UserSessionStatus) {
    setUserSession(nextSession);

    if (!nextSession.user && activeMobileTab === "admin") {
      setActiveMobileTab("chat");
    }

    if (nextSession.user?.role !== "admin") {
      setActiveAdminTab("access");
    }
  }

  const adminPanel = (
    <AdminDeck
      activeTab={effectiveActiveAdminTab}
      onRequestLogout={onRequestLogout}
      onSessionChange={handleSessionChange}
      onTabChange={(nextTab) => setActiveAdminTab(canAccessAdminSubsections ? nextTab : "access")}
      surface={isDesktopViewport && activeDesktopPage === "admin" ? "page" : "embedded"}
      status={status}
      userSession={userSession}
    />
  );

  const helpPanel = (
    <HelpPanel
      context={helpContext}
      currentUser={userSession.user}
      requestedSectionId={requestedHelpSectionId}
      requestedSectionNonce={requestedHelpSectionNonce}
      surface={isDesktopViewport && activeDesktopPage === "help" ? "page" : "embedded"}
      status={status}
    />
  );

  const desktopWorkspacePage = activeDesktopPage === "chat" ? (
    <div className="h-full overflow-y-auto pr-1 lg:h-auto lg:overflow-visible">
      <ChatWorkspace
        currentUser={userSession.user}
        initialConversation={initialConversation}
        initialConversations={initialConversations}
        isReachable={status.isReachable}
        models={chatModels}
        onActiveConversationChange={onActiveConversationChange}
      />
    </div>
  ) : activeDesktopPage === "admin" ? adminPanel : helpPanel;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:min-h-full lg:flex-none lg:overflow-visible">
      <div className={`theme-surface-strong sticky top-3 z-20 grid gap-2 rounded-[24px] p-1.5 backdrop-blur lg:hidden ${visibleMobileDeckTabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {visibleMobileDeckTabs.map((tab) => {
          const isActive = effectiveActiveMobileTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`ui-button min-h-[4rem] flex-col rounded-[22px] px-2.5 py-2.5 text-sm ${isActive ? "ui-button-primary" : "ui-button-secondary"}`}
              data-help-id={tab.id === "chat" ? "nav.chat" : tab.id === "admin" ? "nav.admin" : "nav.help"}
              type="button"
              onClick={() => setActiveMobileTab(tab.id)}
            >
              <span className="text-[13px] font-semibold sm:text-sm">{tab.label}</span>
              <span className={`text-[11px] ${isActive ? "text-white/80" : "text-muted"}`}>{tab.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden min-h-0 flex-1 overflow-hidden lg:block lg:min-h-full lg:flex-none lg:overflow-visible">
        <div key={activeDesktopPage} className="desktop-page-transition h-full min-h-0 lg:h-auto">
          {desktopWorkspacePage}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
        <div className="h-full overflow-y-auto pr-1 pb-2">
          {effectiveActiveMobileTab === "chat" ? (
            <ChatWorkspace
              currentUser={userSession.user}
              initialConversation={initialConversation}
              initialConversations={initialConversations}
              isReachable={status.isReachable}
              models={chatModels}
              onActiveConversationChange={onActiveConversationChange}
            />
          ) : effectiveActiveMobileTab === "admin" && canOpenAdmin ? (
            adminPanel
          ) : (
            helpPanel
          )}
        </div>
      </div>

      <ContextualHelpLayer
        canUseHoverHelp={canUseHoverHelp}
        onOpenHelpSection={openHelpSection}
      />
    </section>
  );
}