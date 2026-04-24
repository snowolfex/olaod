"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PlushLlamaHero } from "@/components/plush-llama-hero";
import { UserAccessPanel } from "@/components/user-access-panel";
import { translateUi } from "@/lib/ui-language";
import type { UserSessionStatus, VoiceTranscriptionLanguage } from "@/lib/user-types";

type AuthGateProps = {
  defaultUiLanguage: VoiceTranscriptionLanguage;
  initialSession: UserSessionStatus;
};

export function AuthGate({ defaultUiLanguage, initialSession }: AuthGateProps) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(session.user?.preferredVoiceTranscriptionLanguage ?? defaultUiLanguage, key, variables);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[980px] items-start justify-center py-4 sm:items-center sm:py-6">
      <div className="theme-surface-elevated w-full rounded-[40px] p-3 backdrop-blur-xl sm:p-4">
        <div className="glass-panel rounded-[34px] p-6 sm:p-8">
          <div className="mb-6">
            <p className="section-label text-xs font-semibold">{t("secureEntry")}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
              {t("signInToEnterOload")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
              {t("workspaceStaysHidden")}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <PlushLlamaHero
              badge="Entry mascot"
              title="Plush llama splash lane"
              description="The sign-in entry now uses the same plush mascot family as Help and the exported operator guide."
              summary="This is the real splash-side mascot surface: one shared plush silhouette, with the app theme selecting the light, tech, or dark variant automatically."
              detailLeftTitle="Shared base"
              detailLeftBody="Same tuft, muzzle, plush limbs, and stuffed-animal proportions across all themes."
              detailRightTitle="Theme behavior"
              detailRightBody="Light uses premium cream, Tech adds cool cyan trim, and Dark shifts to midnight plush with ember accents."
              compact
            />

            <UserAccessPanel
              compact
              onSessionChange={(nextSession) => {
                setSession(nextSession);

                if (nextSession.user) {
                  router.refresh();
                }
              }}
              session={session}
              uiLanguagePreference={session.user?.preferredVoiceTranscriptionLanguage ?? defaultUiLanguage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}