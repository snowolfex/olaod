"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getHelpHint, type HelpContext, type HelpHint } from "@/lib/help-manual";
import { translateUi, translateUiText } from "@/lib/ui-language";
import {
  clearLegacyQuickHelpSessionState,
  muteQuickHelpHint,
  QUICK_HELP_AUTO_DISMISS_MS,
  QUICK_HELP_PREFERENCE_CHANGED_EVENT,
  readQuickHelpEnabled,
  readQuickHelpMutedHintIds,
  writeQuickHelpEnabled,
} from "@/lib/help-preferences";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

type ContextualHelpLayerProps = {
  canUseHoverHelp: boolean;
  onOpenHelpSection: (sectionId: string) => void;
  uiLanguagePreference: VoiceTranscriptionLanguage;
};

type OverlayState = {
  hint: HelpHint;
  placement: "top" | "right" | "bottom" | "left";
  rect: DOMRect;
};

const LONG_PRESS_MS = 2000;
const DESKTOP_MIN_VISIBLE_MS = 2000;
const CARD_WIDTH = 320;
const DESKTOP_CARD_HEIGHT_ESTIMATE = 280;
const VIEWPORT_MARGIN = 16;

function getCardHeightEstimate(viewportHeight: number) {
  return Math.min(DESKTOP_CARD_HEIGHT_ESTIMATE, Math.max(160, Math.floor(viewportHeight * 0.52)));
}

function isVisibleTarget(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveHelpTarget(eventTarget: EventTarget | null) {
  if (!(eventTarget instanceof HTMLElement)) {
    return null;
  }

  return eventTarget.closest<HTMLElement>("[data-help-id], button, [role='button']");
}

const fallbackSectionByContext: Record<HelpContext, string> = {
  chat: "chat-overview",
  access: "access-control",
  models: "model-library",
  jobs: "jobs-and-queue",
  activity: "activity-audit",
};

function buildFallbackHint(target: HTMLElement, language: VoiceTranscriptionLanguage) {
  const contextHost = target.closest<HTMLElement>("[data-help-context]");
  const context = contextHost?.dataset.helpContext as HelpContext | undefined;

  if (!context) {
    return null;
  }

  const label = target.getAttribute("aria-label") ?? target.textContent?.trim() ?? "";

  if (!label) {
    return null;
  }

  const contextLabel = context === "chat"
    ? translateUi(language, "chat")
    : context === "access"
      ? translateUi(language, "access")
      : context === "models"
        ? translateUi(language, "models")
        : context === "jobs"
          ? translateUi(language, "jobs")
          : translateUi(language, "activity");

  return {
    id: `fallback:${context}:${label.toLowerCase()}`,
    title: label,
    summary: translateUiText(language, "Runs the {label} control in the {context} workspace and links to the relevant operating guidance.", {
      label: label.toLowerCase(),
      context: contextLabel.toLowerCase(),
    }),
    sectionId: fallbackSectionByContext[context],
  } satisfies HelpHint;
}

function computePlacement(rect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardHeight = getCardHeightEstimate(viewportHeight);
  const available = {
    top: rect.top - VIEWPORT_MARGIN,
    right: viewportWidth - rect.right - VIEWPORT_MARGIN,
    bottom: viewportHeight - rect.bottom - VIEWPORT_MARGIN,
    left: rect.left - VIEWPORT_MARGIN,
  };

  // In compact hover-capable panes, side placement tends to cover adjacent controls.
  if (viewportWidth < 1100 || viewportHeight < 520) {
    return available.bottom >= available.top ? "bottom" as const : "top" as const;
  }

  if (available.top >= cardHeight) {
    return "top" as const;
  }

  if (available.right >= CARD_WIDTH) {
    return "right" as const;
  }

  if (available.bottom >= cardHeight) {
    return "bottom" as const;
  }

  return "left" as const;
}

function computePosition(state: OverlayState | null) {
  if (!state) {
    return null;
  }

  const { rect, placement } = state;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardHeight = getCardHeightEstimate(viewportHeight);
  const gap = 8;
  let left = rect.left;
  let top = rect.top;

  if (placement === "top") {
    left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    top = rect.top - cardHeight - gap;
  } else if (placement === "right") {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - cardHeight / 2;
  } else if (placement === "bottom") {
    left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    top = rect.bottom + gap;
  } else {
    left = rect.left - CARD_WIDTH - gap;
    top = rect.top + rect.height / 2 - cardHeight / 2;
  }

  return {
    left: Math.min(Math.max(left, VIEWPORT_MARGIN), viewportWidth - CARD_WIDTH - VIEWPORT_MARGIN),
    top: Math.min(Math.max(top, VIEWPORT_MARGIN), viewportHeight - cardHeight - VIEWPORT_MARGIN),
  };
}

export function ContextualHelpLayer({ canUseHoverHelp, onOpenHelpSection, uiLanguagePreference }: ContextualHelpLayerProps) {
  const literal = (sourceText: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, sourceText, variables);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [isQuickHelpEnabled, setIsQuickHelpEnabled] = useState(readQuickHelpEnabled);
  const [mutedHintIds, setMutedHintIds] = useState<string[]>(readQuickHelpMutedHintIds);
  const [showDisableAllConfirmation, setShowDisableAllConfirmation] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const autoDismissTimerRef = useRef<number | null>(null);
  const suppressedTargetRef = useRef<HTMLElement | null>(null);
  const minimumVisibleUntilRef = useRef<number>(0);
  const isPopupInteractionPinnedRef = useRef(false);

  const position = useMemo(() => computePosition(overlay), [overlay]);
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      window.clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const dismissOverlay = useCallback(() => {
    clearHideTimer();
    clearLongPressTimer();
    clearAutoDismissTimer();
    isPopupInteractionPinnedRef.current = false;

    activeTargetRef.current = null;
    minimumVisibleUntilRef.current = 0;
    setOverlay(null);
  }, [clearAutoDismissTimer, clearHideTimer, clearLongPressTimer]);

  const scheduleDesktopDismiss = useCallback((delayMs = DESKTOP_MIN_VISIBLE_MS) => {
    clearHideTimer();
    clearAutoDismissTimer();
    isPopupInteractionPinnedRef.current = false;
    hideTimerRef.current = window.setTimeout(() => {
      dismissOverlay();
    }, delayMs);
  }, [clearAutoDismissTimer, clearHideTimer, dismissOverlay]);

  const showOverlayForTarget = useCallback((target: HTMLElement) => {
    if (!isQuickHelpEnabled || !isVisibleTarget(target)) {
      return;
    }

    if (
      canUseHoverHelp
      && overlay
      && activeTargetRef.current
      && activeTargetRef.current !== target
    ) {
      return;
    }

    const hint = target.dataset.helpId
      ? getHelpHint(target.dataset.helpId)
      : buildFallbackHint(target, uiLanguagePreference);

    if (!hint) {
      dismissOverlay();
      return;
    }

    if (mutedHintIds.includes(hint.id)) {
      dismissOverlay();
      return;
    }

    activeTargetRef.current = target;
    isPopupInteractionPinnedRef.current = false;
    minimumVisibleUntilRef.current = canUseHoverHelp ? Date.now() + DESKTOP_MIN_VISIBLE_MS : 0;
    const rect = target.getBoundingClientRect();
    setOverlay({
      hint,
      placement: computePlacement(rect),
      rect,
    });
  }, [canUseHoverHelp, dismissOverlay, isQuickHelpEnabled, mutedHintIds, overlay, uiLanguagePreference]);

  useEffect(() => {
    clearLegacyQuickHelpSessionState();

    const syncQuickHelpPreference = () => {
      const enabled = readQuickHelpEnabled();
      setIsQuickHelpEnabled(enabled);
      setMutedHintIds(readQuickHelpMutedHintIds());

      if (!enabled) {
        dismissOverlay();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null
        || event.key === "oload:quick-help:enabled"
        || event.key === "oload:quick-help:muted-hints"
      ) {
        syncQuickHelpPreference();
      }
    };

    window.addEventListener(QUICK_HELP_PREFERENCE_CHANGED_EVENT, syncQuickHelpPreference);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(QUICK_HELP_PREFERENCE_CHANGED_EVENT, syncQuickHelpPreference);
      window.removeEventListener("storage", handleStorage);
    };
  }, [dismissOverlay]);

  useEffect(() => {
    const handleResizeOrScroll = () => {
      if (activeTargetRef.current) {
        showOverlayForTarget(activeTargetRef.current);
      }
    };

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [showOverlayForTarget]);

  useEffect(() => {
    if (
      !overlay
      || !isQuickHelpEnabled
      || isPopupInteractionPinnedRef.current
    ) {
      clearAutoDismissTimer();
      return;
    }

    autoDismissTimerRef.current = window.setTimeout(() => {
      dismissOverlay();
    }, QUICK_HELP_AUTO_DISMISS_MS);

    return () => {
      clearAutoDismissTimer();
    };
  }, [clearAutoDismissTimer, dismissOverlay, isQuickHelpEnabled, overlay]);

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      if (!isQuickHelpEnabled || !canUseHoverHelp || event.pointerType === "touch") {
        return;
      }

      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        return;
      }

      const target = resolveHelpTarget(event.target);

      if (!target) {
        return;
      }

      clearHideTimer();
      showOverlayForTarget(target);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!isQuickHelpEnabled || !canUseHoverHelp || event.pointerType === "touch") {
        return;
      }

      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        return;
      }

      const target = resolveHelpTarget(event.target);

      if (!target || activeTargetRef.current !== target) {
        return;
      }

      const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

      if (nextTarget && popupRef.current?.contains(nextTarget)) {
        return;
      }

      scheduleDesktopDismiss();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        return;
      }

      const target = resolveHelpTarget(event.target);

      if (!target) {
        return;
      }

      clearHideTimer();
      showOverlayForTarget(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        return;
      }

      const target = resolveHelpTarget(event.target);

      if (!target || activeTargetRef.current !== target) {
        return;
      }

      const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

      if (nextTarget && popupRef.current?.contains(nextTarget)) {
        return;
      }

      if (canUseHoverHelp) {
        scheduleDesktopDismiss();
        return;
      }

      dismissOverlay();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isQuickHelpEnabled || canUseHoverHelp || (event.pointerType !== "touch" && event.pointerType !== "pen")) {
        return;
      }

      const target = resolveHelpTarget(event.target);

      if (!target) {
        return;
      }

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        suppressedTargetRef.current = target;
        showOverlayForTarget(target);
      }, LONG_PRESS_MS);
    };

    const cancelLongPress = () => {
      clearLongPressTimer();
    };

    const handleClickCapture = (event: MouseEvent) => {
      const target = resolveHelpTarget(event.target);

      if (target && suppressedTargetRef.current === target) {
        event.preventDefault();
        event.stopPropagation();
        suppressedTargetRef.current = null;
      }
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", cancelLongPress, true);
    document.addEventListener("pointercancel", cancelLongPress, true);
    document.addEventListener("pointermove", cancelLongPress, true);
    document.addEventListener("click", handleClickCapture, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", cancelLongPress, true);
      document.removeEventListener("pointercancel", cancelLongPress, true);
      document.removeEventListener("pointermove", cancelLongPress, true);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [canUseHoverHelp, clearHideTimer, clearLongPressTimer, dismissOverlay, isQuickHelpEnabled, scheduleDesktopDismiss, showOverlayForTarget]);

  useEffect(() => {
    if (!overlay) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        dismissOverlay();
        return;
      }

      if (popupRef.current?.contains(event.target)) {
        return;
      }

      if (activeTargetRef.current?.contains(event.target)) {
        return;
      }

      dismissOverlay();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [dismissOverlay, overlay]);

  const shouldRenderOverlay = isQuickHelpEnabled && Boolean(overlay) && Boolean(position);

  return (
    <>
      {shouldRenderOverlay && overlay && position ? (
        <div
          ref={popupRef}
          className={`help-popover glass-panel theme-surface-elevated fixed z-[80] w-[20rem] rounded-[24px] backdrop-blur ${canUseHoverHelp ? "px-3 py-3" : "px-4 py-4"}`}
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
          }}
          onClick={() => {
            if (!canUseHoverHelp) {
              dismissOverlay();
            }
          }}
          onPointerEnter={() => {
            clearHideTimer();
          }}
        >
          <p className="eyebrow text-muted">{literal("Quick orientation")}</p>
          <h3 className={`${canUseHoverHelp ? "mt-1" : "mt-2"} text-sm font-semibold text-foreground`}>{literal(overlay.hint.title)}</h3>
          <p
            className={`${canUseHoverHelp ? "mt-1 text-sm leading-5" : "mt-2 text-sm leading-6"} text-muted`}
            style={canUseHoverHelp ? {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            } : undefined}
          >
            {literal(overlay.hint.summary)}
          </p>
          {canUseHoverHelp ? (
            <label className={`${canUseHoverHelp ? "mt-2 gap-2 px-3 py-2" : "mt-3 gap-3 px-3 py-3"} theme-surface-soft flex items-start rounded-[18px] text-sm text-foreground`}>
              <input
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                type="checkbox"
                onChange={(event) => {
                  if (!event.target.checked) {
                    return;
                  }

                  muteQuickHelpHint(overlay.hint.id);
                  setMutedHintIds((current) => current.includes(overlay.hint.id) ? current : [...current, overlay.hint.id]);
                  dismissOverlay();
                }}
              />
              <span>
                <span className="block font-semibold text-foreground">{literal("Do not show this again")}</span>
              </span>
            </label>
          ) : null}
          <div className={`${canUseHoverHelp ? "mt-3" : "mt-4"} grid grid-cols-2 gap-2`}>
            <button
              className={`ui-button ui-button-secondary ${canUseHoverHelp ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                dismissOverlay();
                onOpenHelpSection(overlay.hint.sectionId);
              }}
            >
              {literal("Open manual section")}
            </button>
            <button
              className={`ui-button ui-button-secondary ${canUseHoverHelp ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                dismissOverlay();
              }}
            >
              {literal("Dismiss")}
            </button>
          </div>
          <div className="mt-3 border-t border-line/70 pt-3">
            <button
              className={`ui-button ui-button-secondary w-full justify-center text-center font-semibold ${canUseHoverHelp ? "px-3 py-2 text-xs leading-5" : "px-4 py-3 text-sm leading-6"}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                writeQuickHelpEnabled(false);
                setIsQuickHelpEnabled(false);
                dismissOverlay();
                setShowDisableAllConfirmation(true);
              }}
            >
              {literal("Send the whole llama herd home. Turn off all popups.")}
            </button>
          </div>
        </div>
      ) : null}

      {showDisableAllConfirmation ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(15,23,42,0.52)] px-4 py-6 backdrop-blur-sm">
          <div className="theme-surface-elevated w-full max-w-[28rem] rounded-[30px] border border-line/80 p-3 shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
            <div className="glass-panel rounded-[24px] p-6 sm:p-7">
              <p className="section-label text-xs font-semibold text-muted">{literal("Llama silence engaged")}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                {literal("All quick popups are off.")}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                {literal("If the herd gets a little too quiet, you can always turn these back on in Admin.")}
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  className="ui-button ui-button-primary px-5 py-3 text-sm"
                  type="button"
                  onClick={() => setShowDisableAllConfirmation(false)}
                >
                  {literal("Understood")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}