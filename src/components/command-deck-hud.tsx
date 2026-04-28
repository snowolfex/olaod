"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { VoiceLanguageSelect } from "@/components/voice-language-select";
import { APP_THEME_COOKIE_NAME, APP_THEMES, APP_THEME_STORAGE_KEY, isAppThemeId } from "@/lib/theme";
import { resolveUiLanguage, translateUi, translateUiText } from "@/lib/ui-language";
import type { AppThemeId } from "@/lib/theme";
import type { SessionUser, VoiceTranscriptionLanguage } from "@/lib/user-types";
import type { DesktopWorkspacePage } from "@/lib/workspace-page";

type CommandDeckHudProps = {
  activeWorkspacePage: DesktopWorkspacePage;
  baseUrl: string;
  currentUser: SessionUser;
  isNavigatingWorkspacePage: boolean;
  isReachable: boolean;
  modelCount: number;
  onNavigateWorkspacePage: (page: DesktopWorkspacePage) => Promise<void> | void;
  onRequestLogout: () => Promise<void> | void;
  onUiLanguagePreferenceChange: (language: VoiceTranscriptionLanguage) => void;
  runningCount: number;
  uiLanguagePreference: VoiceTranscriptionLanguage;
  userCount: number;
};

type IconPosition = {
  x: number;
  y: number;
};

type StoredIconPosition = IconPosition & {
  xRatio?: number;
  yRatio?: number;
};

const HIDDEN_STORAGE_KEY = "oload:command-deck:hidden";
const POSITION_STORAGE_KEY = "oload:command-deck:icon-position";
const ICON_SIZE = 64;
const ICON_MARGIN = 12;
const MOBILE_COMMAND_DECK_MEDIA_QUERY = "(max-width: 1023px)";

function formatEndpointLabel(endpoint: string) {
  return endpoint.replace(/^https?:\/\//, "");
}

function getTravelBounds() {
  if (typeof window === "undefined") {
    return { maxX: ICON_MARGIN, maxY: ICON_MARGIN, travelX: 1, travelY: 1 };
  }

  const maxX = Math.max(ICON_MARGIN, window.innerWidth - ICON_SIZE - ICON_MARGIN);
  const maxY = Math.max(ICON_MARGIN, window.innerHeight - ICON_SIZE - ICON_MARGIN);

  return {
    maxX,
    maxY,
    travelX: Math.max(1, maxX - ICON_MARGIN),
    travelY: Math.max(1, maxY - ICON_MARGIN),
  };
}

function clampPosition(position: IconPosition) {
  if (typeof window === "undefined") {
    return position;
  }

  const { maxX, maxY } = getTravelBounds();

  return {
    x: Math.min(Math.max(position.x, ICON_MARGIN), maxX),
    y: Math.min(Math.max(position.y, ICON_MARGIN), maxY),
  };
}

function serializeIconPosition(position: IconPosition): StoredIconPosition {
  const clamped = clampPosition(position);
  const { travelX, travelY } = getTravelBounds();

  return {
    ...clamped,
    xRatio: (clamped.x - ICON_MARGIN) / travelX,
    yRatio: (clamped.y - ICON_MARGIN) / travelY,
  };
}

function parseStoredIconPosition(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredIconPosition>;

    if (typeof parsed.xRatio === "number" && typeof parsed.yRatio === "number") {
      const { travelX, travelY } = getTravelBounds();

      return clampPosition({
        x: ICON_MARGIN + (Math.min(Math.max(parsed.xRatio, 0), 1) * travelX),
        y: ICON_MARGIN + (Math.min(Math.max(parsed.yRatio, 0), 1) * travelY),
      });
    }

    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return clampPosition({ x: parsed.x, y: parsed.y });
    }
  } catch {
    // Ignore invalid stored icon position.
  }

  return null;
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

function getInitialHiddenIconPosition() {
  if (typeof window === "undefined") {
    return { x: ICON_MARGIN, y: ICON_MARGIN };
  }

  return parseStoredIconPosition(window.localStorage.getItem(POSITION_STORAGE_KEY))
    ?? getDefaultHiddenIconPosition();
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
  onRequestLogout,
  onUiLanguagePreferenceChange,
  runningCount,
  uiLanguagePreference,
  userCount,
}: CommandDeckHudProps) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [iconPosition, setIconPosition] = useState<IconPosition>(() => getInitialHiddenIconPosition());
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSavingLanguagePreference, setIsSavingLanguagePreference] = useState(false);
  const [theme, setTheme] = useState<AppThemeId>("light");
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = (text: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, text, variables);
  const roleLabel = (role: SessionUser["role"]) =>
    resolveUiLanguage(uiLanguagePreference) === "english"
      ? role
      : role === "viewer"
        ? literal("Viewer")
        : t(role);
  const desktopWorkspacePages: Array<{
    id: DesktopWorkspacePage;
    label: string;
    hint: string;
    detail: string;
  }> = [
    { id: "chat", label: t("chat"), hint: t("comms"), detail: t("chat") },
    { id: "admin", label: t("admin"), hint: t("ops"), detail: t("admin") },
    { id: "help", label: t("help"), hint: t("guide"), detail: t("help") },
  ];
  const dragOffsetRef = useRef<IconPosition>({ x: 0, y: 0 });
  const movedDuringDragRef = useRef(false);

  const applyTheme = (nextTheme: AppThemeId) => {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, nextTheme);
    document.cookie = `${APP_THEME_COOKIE_NAME}=${encodeURIComponent(nextTheme)}; path=/; max-age=31536000; samesite=lax`;
    setTheme(nextTheme);
  };

  useEffect(() => {
    setPortalRoot(document.body);

    const storedHidden = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    const isMobileViewport = window.matchMedia(MOBILE_COMMAND_DECK_MEDIA_QUERY).matches;

    if (storedHidden === "true") {
      setIsHidden(true);
    } else if (storedHidden === null && isMobileViewport) {
      setIsHidden(true);
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

    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(serializeIconPosition(iconPosition)));
  }, [iconPosition, isReady]);

  useEffect(() => {
    const handleResize = () => {
      setIconPosition((current) => {
        const storedPosition = parseStoredIconPosition(window.localStorage.getItem(POSITION_STORAGE_KEY));
        return storedPosition ?? clampPosition(current);
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      await onRequestLogout();
    } finally {
      setIsSigningOut(false);
    }
  };

  const updatePreferredVoiceLanguage = async (language: VoiceTranscriptionLanguage) => {
    const response = await fetch("/api/users/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: currentUser.displayName,
        email: currentUser.email,
        preferredModel: currentUser.preferredModel,
        preferredTemperature: currentUser.preferredTemperature,
        preferredSystemPrompt: currentUser.preferredSystemPrompt,
        preferredVoiceTranscriptionLanguage: language,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to save the language preference.");
    }
  };

  const handleLanguagePreferenceChange = (language: VoiceTranscriptionLanguage) => {
    onUiLanguagePreferenceChange(language);
    setIsSavingLanguagePreference(true);

    void updatePreferredVoiceLanguage(language)
      .catch(() => {
        onUiLanguagePreferenceChange(uiLanguagePreference);
      })
      .finally(() => {
        setIsSavingLanguagePreference(false);
      });
  };

  const hudContent = (
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
                    {isReachable ? t("gatewayOnline") : t("gatewayOffline")}
                  </span>
                  <span className="ui-pill ui-pill-label">
                    {currentUser.displayName}
                  </span>
                  <span className="ui-pill ui-pill-meta text-xs capitalize">
                    {roleLabel(currentUser.role)}
                  </span>
                  <span className="ui-pill ui-pill-label">
                    {literal("{userCount} user(s)", { userCount })}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground sm:text-3xl">
                  {t("commandDeck")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  {literal("Workspace control summary for the current session. Hide it when you want the shell fully out of the way.")}
                </p>
              </div>

              <button
                aria-label={literal("Hide command deck")}
                className="ui-button ui-button-secondary h-11 min-w-[5.5rem] shrink-0 justify-center whitespace-nowrap rounded-[18px] px-5 py-2 text-sm"
                data-help-id="command.hide"
                type="button"
                onClick={() => setIsHidden(true)}
              >
                {t("hide")}
              </button>
              <button
                aria-label={t("signOut")}
                className="ui-button ui-button-secondary h-11 min-w-[7rem] shrink-0 justify-center whitespace-nowrap rounded-[18px] px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                data-help-id="command.signout"
                disabled={isSigningOut}
                type="button"
                onClick={() => {
                  void signOut();
                }}
              >
                {isSigningOut ? t("signingOut") : t("signOut")}
              </button>
            </div>

            <div className="theme-surface-elevated hidden overflow-hidden rounded-[24px] lg:block">
              <div className="border-b border-line/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="section-label text-xs font-semibold">{t("navigation")}</p>
                    <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">{t("workspacePages")}</h2>
                    <p className="mt-1 text-xs leading-6 text-muted">
                      {t("commandDeckDestinationsIntro")}
                    </p>
                  </div>
                  <span className="ui-pill ui-pill-surface">{t("liveRoute")}</span>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="grid gap-2 xl:grid-cols-3">
                  {desktopWorkspacePages.map((page) => {
                    const isActive = activeWorkspacePage === page.id;

                    return (
                      <button
                        key={page.id}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex min-h-[4.25rem] items-center justify-center gap-3 rounded-[22px] border px-4 py-4 text-left transition ${isActive ? "theme-accent-gradient border-transparent text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--accent)_24%,transparent)]" : "ui-button-surface theme-surface-strong text-foreground hover:border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"}`}
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
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-muted">{t("theme")}</p>
                <p className="mt-1 text-xs leading-6 text-muted">
                  {literal("Theme selection is device-local. Language follows your saved account preference and can also be changed here.")}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:flex-nowrap">
                <label className="min-w-[8rem] flex-1 sm:flex-none" data-help-id="command.theme-select">
                  <span className="sr-only">{t("chooseSiteTheme")}</span>
                  <select
                    aria-label={t("chooseSiteTheme")}
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
                <label className="min-w-[11rem] flex-1 sm:flex-none" data-help-id="command.language-select">
                  <span className="sr-only">{literal("Language")}</span>
                  <VoiceLanguageSelect
                    ariaLabel={literal("Language")}
                    buttonClassName="theme-surface-input flex w-full items-center gap-2 rounded-full px-3 py-2 text-left"
                    disabled={isSavingLanguagePreference}
                    flagClassName="h-4 w-6 shrink-0 rounded-[3px]"
                    listClassName="theme-surface-elevated absolute right-0 z-30 mt-2 min-w-[14rem] overflow-hidden rounded-[24px] p-2 backdrop-blur-xl"
                    optionClassName={(isSelected) => `flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left ${isSelected ? "bg-[rgba(188,95,61,0.12)]" : "hover:bg-black/5"}`}
                    value={uiLanguagePreference}
                    onChange={handleLanguagePreferenceChange}
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">{t("models")}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{modelCount}</p>
              </div>
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">{t("running")}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{runningCount}</p>
              </div>
              <div className="theme-surface-soft rounded-[22px] px-4 py-3">
                <p className="eyebrow text-muted">{t("endpoint")}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{formatEndpointLabel(baseUrl)}</p>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {isHidden ? (
        <button
          aria-label={literal("Show command deck")}
          className="command-deck-beacon ui-button ui-button-primary fixed z-40 h-16 w-16 rounded-full p-0 text-white"
          data-help-id="command.show"
          style={{ left: `${iconPosition.x}px`, top: `${iconPosition.y}px` }}
          type="button"
          onClick={handleHiddenIconClick}
          onPointerDown={handleHiddenIconPointerDown}
        >
          <span className="sr-only">{t("showCommandDeck")}</span>
          <RadarIcon />
        </button>
      ) : null}
    </>
  );

  if (!portalRoot) {
    return null;
  }

  return createPortal(hudContent, portalRoot);
}