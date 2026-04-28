import { AuthGate } from "@/components/auth-gate";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getCurrentUser, getUserSessionStatus } from "@/lib/auth";
import { getConfiguredDefaultVoiceTranscriptionLanguage } from "@/lib/default-voice-language";
import {
  DESKTOP_WORKSPACE_PAGE_COOKIE_NAME,
  parseDesktopWorkspacePage,
} from "@/lib/workspace-page";
import {
  getMostRecentConversation,
  listConversationSummariesForUser,
} from "@/lib/conversations";
import { getOllamaStatus } from "@/lib/ollama-status";
import { countUsers } from "@/lib/users";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const cookieHeader = headerList.get("cookie");
  const currentUser = await getCurrentUser(cookieHeader);
  const sessionStatus = getUserSessionStatus(cookieHeader);
  const userCount = await countUsers();
  const defaultUiLanguage = getConfiguredDefaultVoiceTranscriptionLanguage();
  const activeDesktopPage = parseDesktopWorkspacePage(
    cookieStore.get(DESKTOP_WORKSPACE_PAGE_COOKIE_NAME)?.value,
  );

  if (!currentUser) {
    return (
      <main className="relative h-[100dvh] overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        <div className="app-page-atmosphere absolute inset-0 -z-10" />

        <AuthGate
          defaultUiLanguage={defaultUiLanguage}
          initialSession={{
            authAvailable: sessionStatus.authAvailable,
            googleAuthEnabled: sessionStatus.googleAuthEnabled,
            googleAuthMode: sessionStatus.googleAuthMode,
            user: null,
            userCount,
          }}
        />
      </main>
    );
  }

  const [status, initialConversations, initialConversation] = await Promise.all([
    getOllamaStatus(),
    listConversationSummariesForUser(currentUser.id),
    getMostRecentConversation(currentUser.id),
  ]);

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <div className="app-page-atmosphere absolute inset-0 -z-10" />

      <WorkspaceShell
        defaultUiLanguage={defaultUiLanguage}
        initialDesktopPage={activeDesktopPage}
        initialUserSession={{
          authAvailable: sessionStatus.authAvailable,
          googleAuthEnabled: sessionStatus.googleAuthEnabled,
          googleAuthMode: sessionStatus.googleAuthMode,
          user: currentUser,
          userCount,
        }}
        initialConversation={initialConversation}
        initialConversations={initialConversations}
        initialStatus={status}
      />
    </main>
  );
}
