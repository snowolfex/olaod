"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { VoiceLanguageFlag } from "@/components/voice-language-flag";
import { getVoiceLanguageLabel, VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS, type VoiceTranscriptionLanguage } from "@/lib/voice-types";

type VoiceLanguageSelectProps = {
  ariaLabel: string;
  disabled?: boolean;
  value: VoiceTranscriptionLanguage;
  onChange: (language: VoiceTranscriptionLanguage) => void;
  buttonClassName: string;
  listClassName: string;
  optionClassName: (isSelected: boolean) => string;
  flagClassName?: string;
  textClassName?: string;
};

export function VoiceLanguageSelect({
  ariaLabel,
  disabled = false,
  value,
  onChange,
  buttonClassName,
  listClassName,
  optionClassName,
  flagClassName,
  textClassName = "text-sm font-semibold text-foreground",
}: VoiceLanguageSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedLanguage = value === "english" ? "united-kingdom" : value;
  const selectedIndex = useMemo(
    () => Math.max(0, VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.indexOf(selectedLanguage)),
    [selectedLanguage],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const target = optionRefs.current[selectedIndex];
    target?.focus();
  }, [isOpen, selectedIndex]);

  const moveFocus = (nextIndex: number) => {
    const normalizedIndex = (nextIndex + VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.length) % VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.length;
    optionRefs.current[normalizedIndex]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={buttonClassName}
        disabled={disabled}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <VoiceLanguageFlag className={flagClassName} language={value} />
        <span className={textClassName}>{getVoiceLanguageLabel(value)}</span>
        <span aria-hidden="true" className="ml-auto text-xs text-muted">{isOpen ? "^" : "v"}</span>
      </button>
      {isOpen ? (
        <div className={listClassName}>
          <div aria-label={ariaLabel} id={listboxId} role="listbox">
            {VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.map((language, index) => {
              const isSelected = language === selectedLanguage;

              return (
                <button
                  key={language}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  aria-selected={isSelected}
                  className={optionClassName(isSelected)}
                  role="option"
                  type="button"
                  onClick={() => {
                    onChange(language);
                    setIsOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveFocus(index + 1);
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveFocus(index - 1);
                      return;
                    }

                    if (event.key === "Home") {
                      event.preventDefault();
                      moveFocus(0);
                      return;
                    }

                    if (event.key === "End") {
                      event.preventDefault();
                      moveFocus(VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.length - 1);
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setIsOpen(false);
                    }
                  }}
                >
                  <VoiceLanguageFlag className={flagClassName} language={language} />
                  <span className="text-sm font-semibold text-foreground">{getVoiceLanguageLabel(language)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
