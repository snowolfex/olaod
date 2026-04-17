export const DEFAULT_USER_SYSTEM_PROMPT = "You are a concise, high-signal local assistant running through Ollama.";
export const DEFAULT_USER_CHAT_TEMPERATURE = 0.7;

export function normalizeSystemPrompt(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeTemperature(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(1.5, Math.max(0, Number(value.toFixed(1))));
}

export function normalizeModelName(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}