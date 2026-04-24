import { getDataStorePath, readJsonStore, updateJsonStore } from "@/lib/data-store";
import type { AiGroundingMode, AiProviderId, AiWorkspaceProfile } from "@/lib/ai-types";

const STORE_PATH = getDataStorePath("ai-profiles.json");
const DEFAULT_PROFILE_TEMPERATURE = 0.4;

type WorkspaceProfileInput = {
  id?: string;
  name: string;
  description?: string;
  providerId?: AiProviderId;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  useKnowledge?: boolean;
  groundingMode?: Exclude<AiGroundingMode, "off">;
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProviderId(providerId?: AiProviderId) {
  if (providerId === "anthropic" || providerId === "openai") {
    return providerId;
  }

  return "ollama" satisfies AiProviderId;
}

function normalizeGroundingMode(mode?: Exclude<AiGroundingMode, "off">) {
  return mode === "strict" ? "strict" : "balanced";
}

function normalizeTemperature(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_PROFILE_TEMPERATURE;
  }

  return Math.max(0, Math.min(1.5, Number(value.toFixed(1))));
}

function normalizeProfile(input: WorkspaceProfileInput, previous?: AiWorkspaceProfile): AiWorkspaceProfile {
  const name = input.name.trim();
  const model = input.model.trim();

  if (!name) {
    throw new Error("Profile name is required.");
  }

  if (!model) {
    throw new Error("Target model is required.");
  }

  const now = new Date().toISOString();

  return {
    id: previous?.id ?? input.id?.trim() ?? createId(),
    name,
    description: input.description?.trim() ?? previous?.description ?? "",
    providerId: normalizeProviderId(input.providerId ?? previous?.providerId),
    model,
    systemPrompt: input.systemPrompt?.trim() ?? previous?.systemPrompt ?? "",
    temperature: normalizeTemperature(input.temperature ?? previous?.temperature),
    useKnowledge: input.useKnowledge ?? previous?.useKnowledge ?? true,
    groundingMode: normalizeGroundingMode(input.groundingMode ?? previous?.groundingMode),
    updatedAt: now,
  };
}

function sortProfiles(profiles: AiWorkspaceProfile[]) {
  return [...profiles].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listAiWorkspaceProfiles() {
  return sortProfiles(await readJsonStore<AiWorkspaceProfile[]>(STORE_PATH, []));
}

export async function saveAiWorkspaceProfile(input: WorkspaceProfileInput) {
  return updateJsonStore<AiWorkspaceProfile[]>(STORE_PATH, [], (profiles) => {
    const nextProfiles = [...profiles];
    const existingIndex = input.id
      ? nextProfiles.findIndex((profile) => profile.id === input.id)
      : -1;
    const existingProfile = existingIndex >= 0 ? nextProfiles[existingIndex] : undefined;
    const profile = normalizeProfile(input, existingProfile);

    const duplicateIndex = nextProfiles.findIndex((entry) => entry.id !== profile.id && entry.name.toLowerCase() === profile.name.toLowerCase());

    if (duplicateIndex >= 0) {
      throw new Error("Profile names must be unique.");
    }

    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = profile;
    } else {
      nextProfiles.push(profile);
    }

    return sortProfiles(nextProfiles);
  });
}

export async function deleteAiWorkspaceProfile(id: string) {
  const trimmedId = id.trim();

  if (!trimmedId) {
    throw new Error("Profile id is required.");
  }

  const profiles = await readJsonStore<AiWorkspaceProfile[]>(STORE_PATH, []);
  const nextProfiles = profiles.filter((profile) => profile.id !== trimmedId);

  if (nextProfiles.length === profiles.length) {
    return false;
  }

  await updateJsonStore<AiWorkspaceProfile[]>(STORE_PATH, [], () => nextProfiles);
  return true;
}
