export const DEFAULT_USER_SYSTEM_PROMPT = "You are a concise, high-signal local assistant running through Ollama.";

export function normalizeSystemPrompt(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}