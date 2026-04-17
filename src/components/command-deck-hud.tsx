"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { APP_THEMES, APP_THEME_STORAGE_KEY, isAppThemeId } from "@/lib/theme";
import type { AppThemeId } from "@/lib/theme";
import type { SessionUser } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

type CommandDeckHudProps = {
  activeWorkspacePage: DesktopWorkspacePage;
  baseUrl: string;
  currentUser: SessionUser;
  isNavigatingWorkspacePage: boolean;
  isReachable: boolean;
  modelCount: number;
  onNavigateWorkspacePage: (page: DesktopWorkspacePage) => Promise<void> | void;
  runningCount: number;
  userCount: number;
};

type IconPosition = {
  x: number;
  y: number;
};

const HIDDEN_STORAGE_KEY = "oload:command-deck:hidden";
const POSITION_STORAGE_KEY = "oload:command-deck:icon-position";
const ICON_SIZE = 64;
const ICON_MARGIN = 12;
const MOBILE_COMMAND_DECK_MEDIA_QUERY = "(max-width: 1023px)";
const desktopWorkspacePages: Array<{
  id: DesktopWorkspacePage;
  label: string;
  hint: string;
  detail: string;
}> = [
  { id: "chat", label: "Chat", hint: "Messages and history", detail: "Open the main conversation surface and saved chats." },
  { id: "admin", label: "Admin", hint: "Accounts and operations", detail: "Open access settings, models, jobs, and activity." },
  { id: "help", label: "Help", hint: "Reference and docs", detail: "Open the technical guide, plain-language explanations, and outside references." },
];

function formatEndpointLabel(endpoint: string) {
  return endpoint.replace(/^https?:\/\//, "");
}

function clampPosition(position: IconPosition) {
  if (typeof window === "undefined") {
    return position;
  }

  const maxX = Math.max(ICON_MARGIN, window.innerWidth - ICON_SIZE - ICON_MARGIN);
  const maxY = Math.max(ICON_MARGIN, window.innerHeight - ICON_SIZE - ICON_MARGIN);

  return {
    x: Math.min(Math.max(position.x, ICON_MARGIN), maxX),
    y: Math.min(Math.max(position.y, ICON_MARGIN), maxY),
  };
}

function getDefaultHiddenIconPosition() {
  if (typeof window === "undefined") {
    return { x: ICON_MARGIN, y: ICON_MARGIN };
  }

  return clampPosition({
    x: window.innerWidth - ICON_SIZE - ICON_MARGIN,
    y: window.innerHeight - ICON_SIZE - ICON_MARGIN,
  });
}

function RadarIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 4v4" strokeLinecap="round" />
      <path d="M20 12h-4" strokeLinecap="round" />
      <path d="M12 20v-4" strokeLinecap="round" />
      <path d="M4 12h4" strokeLinecap="round" />
      <path d="M12 12l5-5" strokeLinecap="round" />
    </svg>
  );
}

function WorkspacePageIcon({ page }: { page: DesktopWorkspacePage }) {
  if (page === "chat") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 7.5c0-1.38 1.12-2.5 2.5-2.5h9A2.5 2.5 0 0 1 19 7.5v5A2.5 2.5 0 0 1 16.5 15h-5.2L7 18v-3H7.5A2.5 2.5 0 0 1 5 12.5z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (page === "admin") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3.5 4.5 7v4.8c0 4.5 3.2 7.8 7.5 8.7 4.3-.9 7.5-4.2 7.5-8.7V7z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 12 11 13.5l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4.5 5 7.5v5.8c0 3.6 2.8 5.7 7 6.2 4.2-.5 7-2.6 7-6.2V7.5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 10h6M9 13h4" strokeLinecap="round" />
    </svg>
  );
}

export function CommandDeckHud({
  activeWorkspacePage,
  baseUrl,
  currentUser,
  isNavigatingWorkspacePage,
  isReachable,
  modelCount,
  onNavigateWorkspacePage,
  runningCount,
  userCount,
}: CommandDeckHudProps) {
  const router = useRouter();
  const [isHidden, setIsHidden] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [iconPosition, setIconPosition] = useState<IconPosition>({ x: ICON_MARGIN, y: ICON_MARGIN });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [theme, setTheme] = useState<AppThemeId>("light");
  const dragOffsetRef = useRef<IconPosition>({ x: 0, y: 0 });
  const movedDuringDragRef = useRef(false);
  const activePageMeta = desktopWorkspacePages.find((page) => page.id === activeWorkspacePage) ?? desktopWorkspacePages[0];

  const applyTheme = (nextTheme: AppThemeId) => {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  };

  useEffect(() => {
    const storedHidden = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    const storedPosition = window.localStorage.getItem(POSITION_STORAGE_KEY);
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    const isMobileViewport = window.matchMedia(MOBILE_COMMAND_DECK_MEDIA_QUERY).matches;

    if (storedHidden === "true") {
      setIsHidden(true);
    } else if (storedHidden === null && isMobileViewport) {
      setIsHidden(true);
    }

    if (storedPosition) {
      try {
        const parsed = JSON.parse(storedPosition) as Partial<IconPosition>;

        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setIconPosition(clampPosition({ x: parsed.x, y: parsed.y }));
        }
      } catch {
        // Ignore invalid stored icon position.
      }
    } else if (isMobileViewport) {
      setIconPosition(getDefaultHiddenIconPosition());
    }

    if (isAppThemeId(storedTheme)) {
      applyTheme(storedTheme);
    } else if (isAppThemeId(document.documentElement.dataset.theme)) {
      applyTheme(document.documentElement.dataset.theme);
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(HIDDEN_STORAGE_KEY, String(isHidden));
  }, [isHidden, isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(iconPosition));
  }, [iconPosition, isReady]);

  useEffect(() => {
    if (!isHidden) {
      return;
    }

    const handleResize = () => {
      setIconPosition((current) => clampPosition(current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isHidden]);

  const handleHiddenIconPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragOffsetRef.current = {
      x: event.clientX - iconPosition.x,
      y: event.clientY - iconPosition.y,
    };
    movedDuringDragRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      movedDuringDragRef.current = true;
      setIconPosition(clampPosition({
        x: moveEvent.clientX - dragOffsetRef.current.x,
        y: moveEvent.clientY - dragOffsetRef.current.y,
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.setTimeout(() => {
        movedDuringDragRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const handleHiddenIconClick = () => {
    if (movedDuringDragRef.current) {
      return;
    }

    setIsHidden(false);
  };

  const signOut = async () => {
    setIsSigningOut(true);

    try {
      await fetch("/api/users/logout", { method: "POST" });
    } finally {
      router.refresh();
    }
  };

  return (
    <>
      {!isHidden ? (
        <aside className="command-deck-hud glass-panel fixed left-3 right-3 top-3 z-40 max-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[28px] px-4 py-4 sm:left-4 sm:right-auto sm:top-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[34rem] sm:px-5">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent-strong)_18%,transparent),transparent_68%)]" />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ui-pill ui-pill-accent">oload</span>
                  <span className={`ui-pill ${isReachable ? "ui-pill-success" : "ui-pill-warning"}`}>
                    {isReachable ? "Gateway online" : "Gateway offline"}
                  </span>
                  <span className="ui-pill ui-pill-surface">
                    {currentUser.displayName}
                  </span>
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {currentUser.role}
                  </span>
                  <span className="ui-pill ui-pill-surface">
                    {userCount} user{userCount === 1 ? "" : "s"}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground sm:text-3xl">
                  Command deck
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Workspace control summary for the current session. Hide it when you want the shell fully out of the way.
                </p>
              </div>

              <button
                aria-label="Hide command deck"
                className="ui-button ui-button-secondary h-11 min-w-11 rounded-full px-3 py-2 text-xs"
                data-help-id="command.hide"
                type="button"
                onClick={() => setIsHidden(true)}
              >
                Hide
              </button>
              <button
                aria-label="Sign out"
                className="ui-button ui-button-secondary h-11 rounded-full px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                data-help-id="command.signout"
                disabled={isSigningOut}
                type="button"
                onClick={() => {
                  void signOut();
                }}
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>

            <div className="theme-surface-elevated hidden overflow-hidden rounded-[24px] lg:block">
              <div className="border-b border-line/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="section-label text-xs font-semibold">Navigation</p>
                    <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">Workspace pages</h2>
                    <p className="mt-1 text-xs leading-6 text-muted">
                      Chat, Admin, and Help each open as their own desktop destination.
                    </p>
                  </div>
                  <span className="ui-pill ui-pill-surface">Live route</span>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="theme-surface-soft rounded-[20px] px-4 py-3">
                  <p className="eyebrow text-muted">Current destination</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--accent)_18%,transparent)]">
                      <WorkspacePageIcon page={activePageMeta.id} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{activePageMeta.label}</p>
                      <p className="text-xs leading-5 text-muted">{activePageMeta.detail}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 xl:grid-cols-3">
                  {desktopWorkspacePages.map((page) => {
                    const isActive = activeWorkspacePage === page.id;

                    return (
                      <button
                        key={page.id}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex min-h-[4.25rem] items-center justify-center gap-3 rounded-[22px] border px-4 py-4 text-left transition ${isActive ? "theme-accent-gradient border-transparent text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "theme-surface-strong text-foreground hover:border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"}`}
                        data-help-id={page.id === "chat" ? "nav.chat" : page.id === "admin" ? "nav.admin" : "nav.help"}
                        disabled={isNavigatingWorkspacePage}
                        type="button"
                        onClick={() => {
                          void onNavigateWorkspacePage(page.id);
                        }}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isActive ? "bg-white/18 text-white" : "theme-accent-soft"}`}>
                          <WorkspacePageIcon page={page.id} />
                        </span>
                        <span className="text-base font-semibold leading-none">{page.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="theme-surface-panel flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-3 py-3">
              <div>
                <p className="eyebrow text-muted">Theme</p>
                <p className="mt-1 text-xs leading-6 text-muted">
                  Theme selection is device-local. Quick-help settings live in Access with the rest of your account defaults.
                </p>
              </div>
              <label className="min-w-[8rem]" data-help-id="command.theme-select">
                <span className="sr-only">Choose site theme</span>
                <select
                  aria-label="Choose site theme"
                  className="theme-surface-input w-full rounded-full px-4 py-2 text-sm font-semibold text-foreground outline-none"
                  value={theme}
                  onChange={(event) => {
                    if (isAppThemeId(event.target.value)) {
                      applyTheme(event.target.value);
                    }
                  }}
                >
                  {APP_THEMES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">Models</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{modelCount}</p>
              </div>
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">Running</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{runningCount}</p>
              </div>
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">Endpoint</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{formatEndpointLabel(baseUrl)}</p>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {isHidden ? (
        <button
          aria-label="Show command deck"
          className="command-deck-beacon ui-button ui-button-primary fixed z-40 h-16 w-16 rounded-full p-0 text-white"
          data-help-id="command.show"
          style={{ left: `${iconPosition.x}px`, top: `${iconPosition.y}px` }}
          type="button"
          onClick={handleHiddenIconClick}
          onPointerDown={handleHiddenIconPointerDown}
        >
          <span className="sr-only">Show command deck</span>
          <RadarIcon />
        </button>
      ) : null}
    </>
  );
}