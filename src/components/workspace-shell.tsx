"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CommandDeckHud } from "@/components/command-deck-hud";
import { InteractionSurface } from "@/components/interaction-surface";
import type {
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

export function WorkspaceShell({
  initialConversation,
  initialConversations,
  initialDesktopPage,
  initialStatus,
  initialUserSession,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [activeWorkspacePage, setActiveWorkspacePage] = useState<DesktopWorkspacePage>(initialDesktopPage);
  const [isNavigatingWorkspacePage, setIsNavigatingWorkspacePage] = useState(false);

  useEffect(() => {
    setActiveWorkspacePage(initialDesktopPage);
    setIsNavigatingWorkspacePage(false);
  }, [initialDesktopPage]);

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
          onDesktopPageChange={navigateWorkspacePage}
        />
      </div>
    </>
  );
}