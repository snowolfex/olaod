import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS = [
  "auto",
  "united-states",
  "arabic",
  "bengali",
  "chinese",
  "english",
  "farsi",
  "french",
  "hindi",
  "japanese",
  "korean",
  "portuguese",
  "russian",
  "spanish",
] as const;

export const VOICE_LANGUAGE_META: Record<VoiceTranscriptionLanguage, { flag: string; label: string }> = {
  auto: { flag: "🌐", label: "Auto" },
  "united-states": { flag: "🇺🇸", label: "United States" },
  arabic: { flag: "🇸🇦", label: "Arabic" },
  bengali: { flag: "🇧🇩", label: "Bengali" },
  chinese: { flag: "🇨🇳", label: "Chinese" },
  english: { flag: "🇬🇧", label: "English" },
  farsi: { flag: "🇮🇷", label: "Persian" },
  french: { flag: "🇫🇷", label: "French" },
  hindi: { flag: "🇮🇳", label: "Hindi" },
  japanese: { flag: "🇯🇵", label: "Japanese" },
  korean: { flag: "🇰🇷", label: "Korean" },
  portuguese: { flag: "🇧🇷", label: "Portuguese" },
  russian: { flag: "🇷🇺", label: "Russian" },
  spanish: { flag: "🇪🇸", label: "Spanish" },
};

export type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export function isVoiceTranscriptionLanguage(value: string): value is VoiceTranscriptionLanguage {
  return VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.includes(value as VoiceTranscriptionLanguage);
}

export function getVoiceLanguageLabel(language: VoiceTranscriptionLanguage) {
  return VOICE_LANGUAGE_META[language].label;
}

export function getVoiceLanguageOptionLabel(language: VoiceTranscriptionLanguage) {
  return getVoiceLanguageLabel(language);
}

export function resolveVoiceModelLanguage(language: VoiceTranscriptionLanguage) {
  if (language === "auto") {
    return undefined;
  }

  return language === "united-states" ? "english" : language;
}