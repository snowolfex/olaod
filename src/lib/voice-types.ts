export const VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS = [
  "auto",
  "english",
  "spanish",
  "chinese",
] as const;

export type VoiceTranscriptionLanguage =
  (typeof VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS)[number];

export function isVoiceTranscriptionLanguage(value: string): value is VoiceTranscriptionLanguage {
  return VOICE_TRANSCRIPTION_LANGUAGE_OPTIONS.includes(value as VoiceTranscriptionLanguage);
}