import { isVoiceTranscriptionLanguage } from "@/lib/voice-types";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const DEFAULT_VOICE_TRANSCRIPTION_LANGUAGE: VoiceTranscriptionLanguage = "united-states";

const VOICE_LANGUAGE_ALIASES: Record<string, VoiceTranscriptionLanguage> = {
  ar: "arabic",
  arabic: "arabic",
  auto: "auto",
  bd: "bengali",
  bengali: "bengali",
  bn: "bengali",
  br: "portuguese",
  chinese: "chinese",
  cn: "chinese",
  en: "english",
  english: "english",
  es: "spanish",
  fa: "farsi",
  farsi: "farsi",
  french: "french",
  fr: "french",
  gb: "english",
  hi: "hindi",
  hindi: "hindi",
  in: "hindi",
  ir: "farsi",
  ja: "japanese",
  japanese: "japanese",
  jp: "japanese",
  ko: "korean",
  korean: "korean",
  kr: "korean",
  portuguese: "portuguese",
  pt: "portuguese",
  ru: "russian",
  russian: "russian",
  sa: "arabic",
  spanish: "spanish",
  unitedstates: "united-states",
  "united-states": "united-states",
  us: "united-states",
  zh: "chinese",
};

export function resolveVoiceTranscriptionLanguageAlias(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_VOICE_TRANSCRIPTION_LANGUAGE;
  }

  const normalizedValue = value.trim().toLowerCase();
  const mappedValue = VOICE_LANGUAGE_ALIASES[normalizedValue];

  if (mappedValue) {
    return mappedValue;
  }

  return isVoiceTranscriptionLanguage(normalizedValue)
    ? normalizedValue as VoiceTranscriptionLanguage
    : DEFAULT_VOICE_TRANSCRIPTION_LANGUAGE;
}

export function getConfiguredDefaultVoiceTranscriptionLanguage() {
  return resolveVoiceTranscriptionLanguageAlias(
    process.env.OLOAD_DEFAULT_LANGUAGE
    ?? process.env.OLOAD_DEFAULT_VOICE_TRANSCRIPTION_LANGUAGE
    ?? null,
  );
}