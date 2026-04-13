"use client";

import { useState } from "react";

import { ChatWorkspace } from "@/components/chat-workspace";
import { ModelOperationsPanel } from "@/components/model-operations-panel";
import { UserAccessPanel } from "@/components/user-access-panel";
import type {
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaStatus } from "@/lib/ollama";
import type { UserSessionStatus } from "@/lib/user-types";

type InteractionSurfaceProps = {
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  initialStatus: OllamaStatus;
  initialUserSession: UserSessionStatus;
};

export function InteractionSurface({
  initialConversation,
  initialConversations,
  initialStatus,
  initialUserSession,
}: InteractionSurfaceProps) {
  const [status, setStatus] = useState(initialStatus);
  const [userSession, setUserSession] = useState(initialUserSession);

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <ChatWorkspace
        currentUser={userSession.user}
        initialConversation={initialConversation}
        initialConversations={initialConversations}
        isReachable={status.isReachable}
        models={status.models}
      />
      <div className="grid gap-6">
        <UserAccessPanel onSessionChange={setUserSession} session={userSession} />
        <ModelOperationsPanel
          currentUser={userSession.user}
          fetchedAt={status.fetchedAt}
          isReachable={status.isReachable}
          models={status.models}
          onStatusChange={setStatus}
          runningModels={status.running}
          runningCount={status.runningCount}
          userCount={userSession.userCount}
          version={status.version}
        />
      </div>
    </section>
  );
}