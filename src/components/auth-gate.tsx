"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UserAccessPanel } from "@/components/user-access-panel";
import type { UserSessionStatus } from "@/lib/user-types";

type AuthGateProps = {
  initialSession: UserSessionStatus;
};

export function AuthGate({ initialSession }: AuthGateProps) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[560px] items-start justify-center py-4 sm:items-center sm:py-6">
      <div className="theme-surface-elevated w-full rounded-[40px] p-3 backdrop-blur-xl sm:p-4">
        <div className="glass-panel rounded-[34px] p-6 sm:p-8">
          <div className="mb-6">
            <p className="section-label text-xs font-semibold">Secure entry</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
              Sign in to enter oload
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
              The workspace stays hidden until you sign in. Choose stay logged in if you want this device to keep a persistent session.
            </p>
          </div>

          <UserAccessPanel
            compact
            onSessionChange={(nextSession) => {
              setSession(nextSession);

              if (nextSession.user) {
                router.refresh();
              }
            }}
            session={session}
          />
        </div>
      </div>
    </div>
  );
}