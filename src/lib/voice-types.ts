import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS = [
  "auto",
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

export type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export function isVoiceTranscriptionLanguage(value: string): value is VoiceTranscriptionLanguage {
  return VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.includes(value as VoiceTranscriptionLanguage);
}