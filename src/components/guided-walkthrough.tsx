"use client";

import { useEffect, useMemo } from "react";

type GuidedWalkthroughProps = {
  activeStepIndex: number;
  description: string;
  isFirstStep: boolean;
  isLastStep: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  preferredPlacement?: "above" | "below";
  targetRect: DOMRect | null;
  title: string;
  totalSteps: number;
};

type CardPosition = {
  left: number;
  top: number;
  width: number;
};

const VIEWPORT_GUTTER = 16;
const CARD_WIDTH = 360;

function resolveCardPosition(targetRect: DOMRect | null, preferredPlacement?: "above" | "below"): CardPosition {
  if (typeof window === "undefined") {
    return {
      left: VIEWPORT_GUTTER,
      top: VIEWPORT_GUTTER,
      width: CARD_WIDTH,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(CARD_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2);

  if (!targetRect) {
    return {
      left: Math.max(VIEWPORT_GUTTER, Math.round((viewportWidth - width) / 2)),
      top: Math.max(VIEWPORT_GUTTER, Math.round((viewportHeight - 320) / 2)),
      width,
    };
  }

  const preferredLeft = targetRect.left;
  const centeredLeft = targetRect.left + targetRect.width / 2 - width / 2;
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(viewportWidth - width - VIEWPORT_GUTTER, Math.round(Math.min(preferredLeft, centeredLeft))),
  );
  const fitsBelow = targetRect.bottom + 20 + 260 <= viewportHeight - VIEWPORT_GUTTER;
  const top = preferredPlacement === "above"
    ? Math.max(VIEWPORT_GUTTER, Math.round(targetRect.top - 278))
    : preferredPlacement === "below"
      ? Math.min(viewportHeight - 260 - VIEWPORT_GUTTER, Math.round(targetRect.bottom + 18))
      : fitsBelow
        ? Math.min(viewportHeight - 260 - VIEWPORT_GUTTER, Math.round(targetRect.bottom + 18))
        : Math.max(VIEWPORT_GUTTER, Math.round(targetRect.top - 278));

  return { left, top, width };
}

export function GuidedWalkthrough({
  activeStepIndex,
  description,
  isFirstStep,
  isLastStep,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  preferredPlacement,
  targetRect,
  title,
  totalSteps,
}: GuidedWalkthroughProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        onNext();
        return;
      }

      if (!isFirstStep && event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFirstStep, isOpen, onClose, onNext, onPrevious]);

  const spotlightRect = useMemo(() => {
    if (!targetRect) {
      return null;
    }

    return {
      left: Math.max(8, Math.round(targetRect.left - 10)),
      top: Math.max(8, Math.round(targetRect.top - 10)),
      width: Math.round(targetRect.width + 20),
      height: Math.round(targetRect.height + 20),
    };
  }, [targetRect]);

  const cardPosition = useMemo(() => resolveCardPosition(targetRect, preferredPlacement), [preferredPlacement, targetRect]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120]" aria-live="polite" role="dialog" aria-modal="true">
      {spotlightRect ? (
        <>
          <div className="fixed inset-x-0 top-0 bg-[rgba(9,14,24,0.72)] backdrop-blur-[2px]" style={{ height: spotlightRect.top }} />
          <div
            className="fixed left-0 bg-[rgba(9,14,24,0.72)] backdrop-blur-[2px]"
            style={{ top: spotlightRect.top, width: spotlightRect.left, height: spotlightRect.height }}
          />
          <div
            className="fixed right-0 bg-[rgba(9,14,24,0.72)] backdrop-blur-[2px]"
            style={{ top: spotlightRect.top, left: spotlightRect.left + spotlightRect.width, height: spotlightRect.height }}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-[rgba(9,14,24,0.72)] backdrop-blur-[2px]"
            style={{ top: spotlightRect.top + spotlightRect.height }}
          />
          <div
            className="pointer-events-none fixed rounded-[28px] border border-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_0_0_9999px_rgba(0,0,0,0)] transition-all duration-300"
            style={{
              left: spotlightRect.left,
              top: spotlightRect.top,
              width: spotlightRect.width,
              height: spotlightRect.height,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.42), 0 0 0 8px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.28)",
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-[rgba(9,14,24,0.76)] backdrop-blur-[3px]" />
      )}

      <div
        className="fixed theme-surface-elevated rounded-[30px] border border-line/70 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.32)]"
        style={{ left: cardPosition.left, top: cardPosition.top, width: cardPosition.width }}
      >
        <div className="glass-panel rounded-[24px] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label text-xs font-semibold text-muted">Guided walkthrough</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-foreground">{title}</h3>
            </div>
            <span className="ui-pill ui-pill-label text-xs">
              {activeStepIndex + 1} / {totalSteps}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
            <button className="ui-button ui-button-secondary px-4 py-2 text-sm" type="button" onClick={onClose}>
              Exit walkthrough
            </button>
            <div className="flex flex-wrap gap-2">
              {!isFirstStep ? (
                <button className="ui-button ui-button-secondary px-4 py-2 text-sm" type="button" onClick={onPrevious}>
                  Back
                </button>
              ) : null}
              <button className="ui-button ui-button-primary px-5 py-2.5 text-sm" type="button" onClick={onNext}>
                {isLastStep ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}