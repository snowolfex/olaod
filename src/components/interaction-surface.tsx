"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";

import { AdminDeck } from "@/components/admin-deck";
import { ContextualHelpLayer } from "@/components/contextual-help-layer";
import { GuidedWalkthrough } from "@/components/guided-walkthrough";
import type { AdminTabId } from "@/components/admin-deck";
import { ChatWorkspace } from "@/components/chat-workspace";
import { HelpPanel } from "@/components/help-panel";
import { getHelpSection, type HelpContext } from "@/lib/help-manual";
import {
  readFirstRunWalkthroughSeen,
  writeFirstRunWalkthroughSeen,
} from "@/lib/help-preferences";
import { translateUi, translateUiText } from "@/lib/ui-language";
import type {
  ActiveConversationSnapshot,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus, VoiceTranscriptionLanguage } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

const DESKTOP_VIEWPORT_MEDIA_QUERY = "(min-width: 1024px)";
const HOVER_HELP_MEDIA_QUERY = "(any-hover: hover) and (any-pointer: fine)";

type InteractionSurfaceProps = {
  activeDesktopPage: DesktopWorkspacePage;
  defaultUiLanguage: VoiceTranscriptionLanguage;
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  initialStatus: OllamaStatus;
  initialUserSession: UserSessionStatus;
  onActiveConversationChange?: (conversation: ActiveConversationSnapshot | null) => void;
  onDesktopPageChange: (page: DesktopWorkspacePage) => Promise<void> | void;
  onRequestLogout: () => Promise<void> | void;
  onStatusChange?: (status: OllamaStatus) => void;
  onUiLanguagePreferenceChange: (language: VoiceTranscriptionLanguage) => void;
  uiLanguagePreference: VoiceTranscriptionLanguage;
};

type MobileDeckTab = "chat" | "admin" | "help";

type WalkthroughStep = {
  id: string;
  title: string;
  description: string;
  targetId: string;
  desktopPage: DesktopWorkspacePage;
  mobileTab: MobileDeckTab;
  adminTab?: AdminTabId;
  helpSectionId?: string;
  preferredPlacement?: "above" | "below";
};

export function InteractionSurface({
  activeDesktopPage,
  defaultUiLanguage,
  initialConversation,
  initialConversations,
  initialStatus,
  initialUserSession,
  onActiveConversationChange,
  onDesktopPageChange,
  onRequestLogout,
  onStatusChange,
  onUiLanguagePreferenceChange,
  uiLanguagePreference,
}: InteractionSurfaceProps) {
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = useCallback(
    (text: string, variables?: Record<string, string | number>) =>
      translateUiText(uiLanguagePreference, text, variables),
    [uiLanguagePreference],
  );
  const mobileDeckTabs: Array<{ id: MobileDeckTab; label: string; hint: string }> = [
    { id: "chat", label: t("chat"), hint: t("comms") },
    { id: "admin", label: t("admin"), hint: t("ops") },
    { id: "help", label: t("help"), hint: t("guide") },
  ];
  const [status, setStatus] = useState(initialStatus);
  const [userSession, setUserSession] = useState(initialUserSession);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [canUseHoverHelp, setCanUseHoverHelp] = useState(true);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileDeckTab>("chat");
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTabId>("access");
  const [requestedHelpSectionId, setRequestedHelpSectionId] = useState<string | null>(null);
  const [requestedHelpSectionNonce, setRequestedHelpSectionNonce] = useState(0);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [walkthroughTargetRect, setWalkthroughTargetRect] = useState<DOMRect | null>(null);
  const canOpenAdmin = Boolean(userSession.user);
  const canAccessAdminSubsections = userSession.user?.role === "admin";
  const adminAvailability = !canOpenAdmin ? "none" : canAccessAdminSubsections ? "full" : "access";
  const runningChatModelNames = Array.from(
    new Set(
      status.running.flatMap((runtime) => [runtime.model, runtime.name].filter((value): value is string => Boolean(value))),
    ),
  );
  const chatModels = status.models.length > 0
    ? status.models
    : runningChatModelNames.map((modelName) => {
      const installedMatch = status.models.find((model) => model.name === modelName);

      return installedMatch ?? {
        name: modelName,
        size: 0,
      };
    });
  const effectiveActiveMobileTab = adminAvailability === "none" && activeMobileTab === "admin"
    ? "chat"
    : activeMobileTab;
  const effectiveTopDeckTab: MobileDeckTab = isDesktopViewport
    ? activeDesktopPage === "admin"
      ? "admin"
      : activeDesktopPage === "help"
        ? "help"
        : "chat"
    : effectiveActiveMobileTab;
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
  const walkthroughSteps = useMemo<WalkthroughStep[]>(() => {
    const steps: WalkthroughStep[] = [
      {
        id: "workspace-nav",
        title: literal("This is your deck switcher."),
        description: literal("Chat is where you work, Admin is where you configure and operate the stack, and Help is the handbook. The walkthrough can be exited at any time."),
        targetId: "workspace-nav",
        desktopPage: "chat",
        mobileTab: "chat",
      },
      {
        id: "chat-composer",
        title: literal("This is the chat workbench."),
        description: literal("Draft the request here, pick the model route, use voice if you want, and stream the reply back into the thread. This is inference time, not model training."),
        targetId: "chat-composer",
        desktopPage: "chat",
        mobileTab: "chat",
      },
      {
        id: "chat-controls",
        title: literal("Profiles and grounding shape each answer."),
        description: literal("Assistant profiles change behavior. Knowledge grounding pulls matching workspace notes into the current request so replies stay anchored to your data without changing the model's weights."),
        targetId: "chat-controls",
        desktopPage: "chat",
        mobileTab: "chat",
        preferredPlacement: "above",
      },
      {
        id: "chat-saved-chats",
        title: literal("Saved chats keep working context."),
        description: literal("Pin active threads, archive finished ones, and reopen older work without losing the conversation state that shaped the result."),
        targetId: "chat-saved-chats",
        desktopPage: "chat",
        mobileTab: "chat",
      },
    ];

    if (canOpenAdmin) {
      steps.push({
        id: "admin-tabs",
        title: literal("Admin is the control room."),
        description: literal("This strip is where you pivot between identity, model operations, queue control, and audit history. The walkthrough will move through each lane."),
        targetId: "admin-tabs",
        desktopPage: "admin",
        mobileTab: "admin",
        adminTab: "access",
        preferredPlacement: "above",
      });
      steps.push({
        id: "admin-access",
        title: literal("Start with Access and provider setup."),
        description: literal("Access owns local accounts, roles, sign-in defaults, provider credentials, and shared knowledge management. First-run setup usually begins here."),
        targetId: "admin-panel-access",
        desktopPage: "admin",
        mobileTab: "admin",
        adminTab: "access",
      });

      if (canAccessAdminSubsections) {
        steps.push(
          {
            id: "admin-models",
            title: literal("Models separates installed from ready."),
            description: literal("This lane shows what is downloaded, what is already loaded into runtime memory, and whether local Ollama is healthy. Local and hosted routes share one gateway, but only local models have runtime controls here."),
            targetId: "admin-panel-models",
            desktopPage: "admin",
            mobileTab: "admin",
            adminTab: "models",
          },
          {
            id: "admin-jobs",
            title: literal("Jobs is the operations queue."),
            description: literal("Use this when downloads, pulls, retries, cancellations, and progress tracking matter. It explains what is waiting, running, failed, and completed."),
            targetId: "admin-panel-jobs",
            desktopPage: "admin",
            mobileTab: "admin",
            adminTab: "jobs",
          },
          {
            id: "admin-activity",
            title: literal("Activity is the audit trail."),
            description: literal("This is the cross-surface event record for admin actions, model operations, access changes, and warnings. Use it to answer what changed and when."),
            targetId: "admin-panel-activity",
            desktopPage: "admin",
            mobileTab: "admin",
            adminTab: "activity",
          },
        );
      }
    }

    steps.push(
      {
        id: "help-knowledge",
        title: literal("RAG here means retrieval, not training."),
        description: literal("Shared knowledge is oload's retrieval layer. When knowledge is on, the app finds relevant indexed notes and attaches them to the current request. That improves this answer, but it does not fine-tune or permanently retrain the underlying model."),
        targetId: "help-section-card-knowledge-operations",
        desktopPage: "help",
        mobileTab: "help",
        helpSectionId: "knowledge-operations",
      },
      {
        id: "help-replay",
        title: literal("The handbook and replay live here."),
        description: literal("Help collects the deeper explanations for prompting, retrieval, provider routing, local runtime, jobs, and audit. Use Replay walkthrough any time you want this guided version again."),
        targetId: "help-actions",
        desktopPage: "help",
        mobileTab: "help",
      },
    );

    return steps;
  }, [canAccessAdminSubsections, canOpenAdmin, literal]);
  const activeWalkthroughStep = isWalkthroughOpen ? walkthroughSteps[walkthroughStepIndex] ?? null : null;

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (readFirstRunWalkthroughSeen()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setWalkthroughStepIndex(0);
      setIsWalkthroughOpen(true);
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!activeWalkthroughStep) {
      return;
    }

    let cancelled = false;
    let deferredStateSyncId: number | null = null;

    const nextAdminTab = activeWalkthroughStep.adminTab
      ? (canAccessAdminSubsections ? activeWalkthroughStep.adminTab : "access")
      : null;
    const nextHelpSectionId = activeWalkthroughStep.helpSectionId ?? null;
    const nextMobileTab = isDesktopViewport ? null : activeWalkthroughStep.mobileTab;

    if (nextAdminTab || nextHelpSectionId || nextMobileTab) {
      deferredStateSyncId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        if (nextAdminTab) {
          setActiveAdminTab(nextAdminTab);
        }

        if (nextHelpSectionId) {
          setRequestedHelpSectionId(nextHelpSectionId);
          setRequestedHelpSectionNonce((current) => current + 1);
        }

        if (nextMobileTab) {
          setActiveMobileTab(nextMobileTab);
        }
      }, 0);
    }

    if (isDesktopViewport) {
      if (activeDesktopPage !== activeWalkthroughStep.desktopPage) {
        void onDesktopPageChange(activeWalkthroughStep.desktopPage);
      }
    }

    let retries = 0;
    let cleanupMeasure: (() => void) | null = null;

    const selector = `[data-tour-id="${activeWalkthroughStep.targetId}"]`;

    const resolveTarget = () => {
      if (cancelled) {
        return;
      }

      const target = document.querySelector<HTMLElement>(selector);

      if (!target) {
        if (retries < 14) {
          retries += 1;
          window.setTimeout(resolveTarget, 90);
          return;
        }

        setWalkthroughTargetRect(null);
        return;
      }

      target.scrollIntoView({ behavior: retries === 0 ? "smooth" : "auto", block: "center", inline: "nearest" });

      const measure = () => {
        if (cancelled) {
          return;
        }

        const rect = target.getBoundingClientRect();
        setWalkthroughTargetRect(rect.width > 0 && rect.height > 0 ? rect : null);
      };

      measure();
      const handleMeasure = () => measure();
      window.addEventListener("resize", handleMeasure);
      document.addEventListener("scroll", handleMeasure, true);
      cleanupMeasure = () => {
        window.removeEventListener("resize", handleMeasure);
        document.removeEventListener("scroll", handleMeasure, true);
      };
    };

    const frameId = window.requestAnimationFrame(resolveTarget);

    return () => {
      cancelled = true;
      if (deferredStateSyncId !== null) {
        window.clearTimeout(deferredStateSyncId);
      }
      window.cancelAnimationFrame(frameId);
      cleanupMeasure?.();
    };
  }, [activeDesktopPage, activeWalkthroughStep, canAccessAdminSubsections, isDesktopViewport, onDesktopPageChange]);

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

  function closeWalkthrough() {
    setIsWalkthroughOpen(false);
    setWalkthroughTargetRect(null);
    writeFirstRunWalkthroughSeen(true);
  }

  function openWalkthrough() {
    setWalkthroughStepIndex(0);
    setIsWalkthroughOpen(true);
  }

  function showNextWalkthroughStep() {
    setWalkthroughStepIndex((current) => {
      if (current >= walkthroughSteps.length - 1) {
        closeWalkthrough();
        return current;
      }

      return current + 1;
    });
  }

  function showPreviousWalkthroughStep() {
    setWalkthroughStepIndex((current) => Math.max(0, current - 1));
  }

  function handleSessionChange(nextSession: UserSessionStatus) {
    setUserSession(nextSession);
    onUiLanguagePreferenceChange(nextSession.user?.preferredVoiceTranscriptionLanguage ?? defaultUiLanguage);

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
      uiLanguagePreference={uiLanguagePreference}
      userSession={userSession}
    />
  );

  const helpPanel = (
    <HelpPanel
      context={helpContext}
      currentUser={userSession.user}
      onReplayWalkthrough={openWalkthrough}
      requestedSectionId={requestedHelpSectionId}
      requestedSectionNonce={requestedHelpSectionNonce}
      surface={isDesktopViewport && activeDesktopPage === "help" ? "page" : "embedded"}
      status={status}
      uiLanguagePreference={uiLanguagePreference}
    />
  );

  async function openAdminModelsFromChat() {
    if (!canAccessAdminSubsections) {
      return;
    }

    setActiveAdminTab("models");

    if (isDesktopViewport) {
      await onDesktopPageChange("admin");
      return;
    }

    setActiveMobileTab("admin");
  }

  async function openAdminAccessFromChat() {
    if (!canOpenAdmin) {
      return;
    }

    setActiveAdminTab("access");

    if (isDesktopViewport) {
      await onDesktopPageChange("admin");
      return;
    }

    setActiveMobileTab("admin");
  }

  async function handleDeckTabChange(nextTab: MobileDeckTab) {
    if (isDesktopViewport) {
      await onDesktopPageChange(nextTab);
      return;
    }

    setActiveMobileTab(nextTab);
  }

  const desktopWorkspacePage = activeDesktopPage === "chat" ? (
    <div className="h-full overflow-y-auto pr-1 lg:h-auto lg:overflow-visible">
      <ChatWorkspace
        canManageModels={canAccessAdminSubsections}
        currentUser={userSession.user}
        initialConversation={initialConversation}
        initialConversations={initialConversations}
        isReachable={status.isReachable}
        models={chatModels}
        onActiveConversationChange={onActiveConversationChange}
        onRequestOpenAccessPanel={openAdminAccessFromChat}
        onRequestOpenModelOperations={openAdminModelsFromChat}
        onUiLanguagePreferenceChange={onUiLanguagePreferenceChange}
        runningModels={runningChatModelNames}
        uiLanguagePreference={uiLanguagePreference}
      />
    </div>
  ) : activeDesktopPage === "admin" ? adminPanel : helpPanel;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:min-h-full lg:flex-none lg:overflow-visible">
      <div data-tour-id="workspace-nav" className={`theme-surface-strong sticky top-3 z-20 grid w-full gap-2 self-stretch rounded-[24px] p-1.5 backdrop-blur ${visibleMobileDeckTabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {visibleMobileDeckTabs.map((tab) => {
          const isActive = effectiveTopDeckTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`ui-button min-h-[4rem] flex-col rounded-[22px] px-2.5 py-2.5 text-sm ${isActive ? "ui-button-primary" : "ui-button-secondary"}`}
              data-help-id={tab.id === "chat" ? "nav.chat" : tab.id === "admin" ? "nav.admin" : "nav.help"}
              type="button"
              onClick={() => {
                void handleDeckTabChange(tab.id);
              }}
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
              canManageModels={canAccessAdminSubsections}
              currentUser={userSession.user}
              initialConversation={initialConversation}
              initialConversations={initialConversations}
              isReachable={status.isReachable}
              models={chatModels}
              onActiveConversationChange={onActiveConversationChange}
              onRequestOpenAccessPanel={openAdminAccessFromChat}
              onRequestOpenModelOperations={openAdminModelsFromChat}
              onUiLanguagePreferenceChange={onUiLanguagePreferenceChange}
              runningModels={runningChatModelNames}
              uiLanguagePreference={uiLanguagePreference}
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
        uiLanguagePreference={uiLanguagePreference}
      />
      <GuidedWalkthrough
        activeStepIndex={walkthroughStepIndex}
        description={activeWalkthroughStep?.description ?? ""}
        isFirstStep={walkthroughStepIndex === 0}
        isLastStep={walkthroughStepIndex === walkthroughSteps.length - 1}
        isOpen={isWalkthroughOpen && Boolean(activeWalkthroughStep)}
        onClose={closeWalkthrough}
        onNext={showNextWalkthroughStep}
        onPrevious={showPreviousWalkthroughStep}
        preferredPlacement={activeWalkthroughStep?.preferredPlacement}
        targetRect={activeWalkthroughStep ? walkthroughTargetRect : null}
        title={activeWalkthroughStep?.title ?? ""}
        totalSteps={walkthroughSteps.length}
      />
    </section>
  );
}