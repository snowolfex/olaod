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
              badge="Entry mark"
              title="OL brand lane"
              description="The sign-in entry now uses the OL monogram instead of the older mascot treatment."
              summary="This is the real entry-side brand surface: one shared OL icon language, with the app theme selecting the light, tech, or dark finish automatically."
              detailLeftTitle="Core mark"
              detailLeftBody="A warm ringed O with the inline L anchored into the right side of the form for small-size recognition."
              detailRightTitle="Theme behavior"
              detailRightBody="Light keeps the warm premium gradient, Tech adds cooler signal highlights, and Dark pushes the same mark into a deeper midnight finish."
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