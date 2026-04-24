"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  ActiveConversationSnapshot,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import {
  AI_KNOWLEDGE_SOURCES_HEADER,
  type AiGroundingMode,
  type AiKnowledgeCitation,
  type AiModelSummary,
  type AiProviderId,
  type AiProviderSummary,
  type AiWorkspaceProfile,
} from "@/lib/ai-types";
import type { OllamaChatMessage, OllamaModel } from "@/lib/ollama";
import { DEFAULT_USER_CHAT_TEMPERATURE, DEFAULT_USER_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { translateUi, translateUiText } from "@/lib/ui-language";
import type { SessionUser } from "@/lib/user-types";
import {
  VOICE_LANGUAGE_META,
  type VoiceTranscriptionLanguage,
} from "@/lib/voice-types";
import { VoiceLanguageSelect } from "@/components/voice-language-select";

type ChatWorkspaceProps = {
  canManageModels?: boolean;
  currentUser: SessionUser | null;
  isReachable: boolean;
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  models: OllamaModel[];
  onActiveConversationChange?: (conversation: ActiveConversationSnapshot | null) => void;
  onRequestOpenModelOperations?: () => Promise<void> | void;
  onUiLanguagePreferenceChange?: (language: VoiceTranscriptionLanguage) => void;
  runningModels?: string[];
  uiLanguagePreference: VoiceTranscriptionLanguage;
};

type AudioContextConstructor = {
  new (): AudioContext;
};

type PersistedConversationResponse = {
  conversation: StoredConversation;
  summary: ConversationSummary;
};

type AssistantProfilesResponse = {
  profiles: AiWorkspaceProfile[];
};

type AiProvidersResponse = {
  providers: AiProviderSummary[];
};

type AiModelsResponse = {
  models: AiModelSummary[];
};

type TalkToOption = {
  key: string;
  providerId: AiProviderId;
  providerLabel: string;
  model: string;
  label: string;
  kind: "local-running" | "hosted-configured";
};

const PROMPT_PRESETS = [
  {
    label: "Compare models",
    prompt: "Compare the best installed models for coding, summarization, and low-latency mobile use. Give me a clear recommendation.",
  },
  {
    label: "Debug code",
    prompt: "Help me debug a problem step by step. Start by asking for the exact error and the smallest relevant code snippet.",
  },
  {
    label: "Ops checklist",
    prompt: "Create a concise operator checklist for checking Ollama health, model availability, queue state, and active jobs.",
  },
] as const;

async function updatePreferredVoiceLanguage(
  currentUser: SessionUser,
  language: VoiceTranscriptionLanguage,
) {
  const response = await fetch("/api/users/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: currentUser.displayName,
      email: currentUser.email,
      preferredModel: currentUser.preferredModel,
      preferredTemperature: currentUser.preferredTemperature,
      preferredSystemPrompt: currentUser.preferredSystemPrompt,
      preferredVoiceTranscriptionLanguage: language,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

const CHAT_PROMPT_PRESETS_STORAGE_KEY = "oload:chat:prompt-presets";
const CHAT_PINNED_CONVERSATIONS_STORAGE_KEY = "oload:chat:pinned-conversations";
const CHAT_PINNED_ONLY_FILTER_STORAGE_KEY = "oload:chat:pinned-only-filter";
const CHAT_ARCHIVED_VISIBILITY_STORAGE_KEY = "oload:chat:archived-visibility";
const CHAT_ARCHIVED_RETENTION_STORAGE_KEY = "oload:chat:archived-retention";
const CHAT_ARCHIVED_FILTER_STORAGE_KEY = "oload:chat:archived-filter";
const CHAT_ARCHIVED_SORT_STORAGE_KEY = "oload:chat:archived-sort";
const ARCHIVED_RETENTION_DAYS = 30;
const ARCHIVED_RETENTION_OPTIONS = [7, 14, 30, 90] as const;
type ArchivedConversationFilter = "all" | "empty" | "old";
type ArchivedConversationSort = "archived-newest" | "archived-oldest" | "recent-activity";

function getPromptPresetsStorageKey(userId?: string) {
  return `${CHAT_PROMPT_PRESETS_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getPinnedConversationsStorageKey(userId?: string) {
  return `${CHAT_PINNED_CONVERSATIONS_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getPinnedOnlyFilterStorageKey(userId?: string) {
  return `${CHAT_PINNED_ONLY_FILTER_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getArchivedVisibilityStorageKey(userId?: string) {
  return `${CHAT_ARCHIVED_VISIBILITY_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getArchivedRetentionStorageKey(userId?: string) {
  return `${CHAT_ARCHIVED_RETENTION_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getArchivedFilterStorageKey(userId?: string) {
  return `${CHAT_ARCHIVED_FILTER_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getArchivedSortStorageKey(userId?: string) {
  return `${CHAT_ARCHIVED_SORT_STORAGE_KEY}:${userId ?? "guest"}`;
}

function parsePromptPresetsPreference(value: string | null, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return value === "true";
}

function parsePinnedConversationIds(value: string | null) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [] as string[];
  }
}

function parsePinnedOnlyFilterPreference(value: string | null) {
  if (!value) {
    return false;
  }

  return value === "true";
}

function parseArchivedVisibilityPreference(value: string | null) {
  if (!value) {
    return false;
  }

  return value === "true";
}

function parseArchivedRetentionPreference(value: string | null) {
  if (!value) {
    return ARCHIVED_RETENTION_DAYS;
  }

  const parsed = Number(value);

  if (ARCHIVED_RETENTION_OPTIONS.includes(parsed as (typeof ARCHIVED_RETENTION_OPTIONS)[number])) {
    return parsed;
  }

  return ARCHIVED_RETENTION_DAYS;
}

function parseArchivedFilterPreference(value: string | null): ArchivedConversationFilter {
  if (value === "empty" || value === "old") {
    return value;
  }

  return "all";
}

function parseArchivedSortPreference(value: string | null): ArchivedConversationSort {
  if (
    value === "archived-newest"
    || value === "archived-oldest"
    || value === "recent-activity"
  ) {
    return value;
  }

  return "archived-newest";
}

function getArchivedConversationSortValue(
  conversation: ConversationSummary,
  archivedConversationSort: ArchivedConversationSort,
) {
  if (archivedConversationSort === "recent-activity") {
    return conversation.updatedAt;
  }

  return conversation.archivedAt ?? conversation.updatedAt;
}

function isConversationOlderThanArchivedRetention(
  archivedAt: string | null,
  archivedRetentionDays: number,
) {
  if (!archivedAt) {
    return false;
  }

  const archivedAtMs = new Date(archivedAt).getTime();

  if (Number.isNaN(archivedAtMs)) {
    return false;
  }

  return archivedAtMs <= Date.now() - archivedRetentionDays * 24 * 60 * 60 * 1000;
}

function buildConversationTitle(messages: OllamaChatMessage[], fallbackTitle: string) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return (firstUserMessage?.content.trim() || fallbackTitle).slice(0, 48);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfValueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const elapsedDays = Math.floor(
    (startOfToday.getTime() - startOfValueDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (elapsedDays <= 0) {
    return "today";
  }

  if (elapsedDays === 1) {
    return "yesterday";
  }

  if (elapsedDays <= 14) {
    return `${elapsedDays}d ago`;
  }

  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getArchivedConversationMetaBadges(
  conversation: ConversationSummary,
  literal: (text: string, variables?: Record<string, string | number>) => string,
) {
  const archivedLabel = conversation.archivedAt
    ? formatRelativeDateLabel(conversation.archivedAt)
    : null;
  const lastActivityLabel = formatRelativeDateLabel(conversation.updatedAt);

  return [
    archivedLabel
      ? {
        label: literal("Archived {date}", { date: archivedLabel }),
        classes: "bg-stone-200 text-stone-900",
      }
      : null,
    lastActivityLabel
      ? {
        label: literal("Last active {date}", { date: lastActivityLabel }),
        classes: "bg-sky-100 text-sky-900",
      }
      : null,
  ].filter((badge): badge is { label: string; classes: string } => Boolean(badge));
}

function getArchivedFilterSummaryLabel(
  archivedConversationFilter: ArchivedConversationFilter,
  archivedRetentionDays: number,
  literal: (text: string, variables?: Record<string, string | number>) => string,
) {
  if (archivedConversationFilter === "empty") {
    return literal("empty archived chats");
  }

  if (archivedConversationFilter === "old") {
    return literal("archived chats at least {days} days old", { days: archivedRetentionDays });
  }

  return literal("all archived chats");
}

function getArchivedSortSummaryLabel(
  archivedConversationSort: ArchivedConversationSort,
  literal: (text: string, variables?: Record<string, string | number>) => string,
) {
  if (archivedConversationSort === "archived-oldest") {
    return literal("oldest archived first");
  }

  if (archivedConversationSort === "recent-activity") {
    return literal("recent activity first");
  }

  return literal("newest archived first");
}

function getConversationRecencyBadge(
  updatedAt: string,
  literal: (text: string, variables?: Record<string, string | number>) => string,
) {
  const updatedAtMs = new Date(updatedAt).getTime();

  if (Number.isNaN(updatedAtMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, Date.now() - updatedAtMs);

  if (elapsedMs <= 5 * 60_000) {
    return {
      label: literal("Just updated"),
      classes: "bg-emerald-100 text-emerald-900",
    };
  }

  if (elapsedMs <= 30 * 60_000) {
    return {
      label: literal("Updated recently"),
      classes: "bg-blue-100 text-blue-900",
    };
  }

  return null;
}

function getConversationDayBucketLabel(updatedAt: string) {
  const updatedAtDate = new Date(updatedAt);

  if (Number.isNaN(updatedAtDate.getTime())) {
    return "Older";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfUpdatedDay = new Date(
    updatedAtDate.getFullYear(),
    updatedAtDate.getMonth(),
    updatedAtDate.getDate(),
  );
  const elapsedDays = Math.floor(
    (startOfToday.getTime() - startOfUpdatedDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (elapsedDays <= 0) {
    return "Today";
  }

  if (elapsedDays === 1) {
    return "Yesterday";
  }

  if (elapsedDays <= 6) {
    return "This week";
  }

  return "Older";
}

function getConversationActivityBadge(options: {
  conversationId: string;
  isActive: boolean;
  isStreaming: boolean;
  recentlyUpdatedConversationId: string | null;
}) {
  if (options.isActive && options.isStreaming) {
    return {
      label: "Responding",
      classes: "bg-emerald-500 text-white",
    };
  }

  if (options.conversationId === options.recentlyUpdatedConversationId) {
    return {
      label: "Latest reply",
      classes: "bg-[var(--accent)] text-white",
    };
  }

  return null;
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

function readKnowledgeCitationsHeader(response: Response) {
  const headerValue = response.headers.get(AI_KNOWLEDGE_SOURCES_HEADER);

  if (!headerValue) {
    return [] as AiKnowledgeCitation[];
  }

  try {
    const parsed = JSON.parse(headerValue) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is AiKnowledgeCitation => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        const candidate = entry as Partial<AiKnowledgeCitation>;

        return typeof candidate.id === "string"
          && typeof candidate.title === "string"
          && typeof candidate.source === "string"
          && Array.isArray(candidate.tags)
          && Array.isArray(candidate.providerIds)
          && Array.isArray(candidate.modelIds)
          && typeof candidate.excerpt === "string"
          && typeof candidate.score === "number";
      })
      : [];
  } catch {
    return [] as AiKnowledgeCitation[];
  }
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };

  return window.AudioContext ?? speechWindow.webkitAudioContext ?? null;
}

function mergeVoiceDraft(baseDraft: string, transcript: string) {
  const trimmedBaseDraft = baseDraft.trim();
  const trimmedTranscript = transcript.trim();

  if (!trimmedBaseDraft) {
    return trimmedTranscript;
  }

  if (!trimmedTranscript) {
    return trimmedBaseDraft;
  }

  return `${trimmedBaseDraft} ${trimmedTranscript}`;
}

function getVoiceCaptureErrorMessage(errorName: string) {
  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Microphone access was blocked. Allow microphone access to use push-to-talk.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No microphone was available for push-to-talk.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "The microphone is busy or unavailable right now.";
  }

  return "Push-to-talk could not start the microphone.";
}

function buildTalkToOptionKey(providerId: AiProviderId, model: string) {
  return `${providerId}:${model}`;
}

function getTalkToFallbackOption(options: TalkToOption[], preferredModel?: string | null) {
  if (preferredModel) {
    const preferredLocal = options.find((option) => option.providerId === "ollama" && option.model === preferredModel);

    if (preferredLocal) {
      return preferredLocal;
    }
  }

  return options[0] ?? null;
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function DisclosureChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M3.5 6.25L8 10.75L12.5 6.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChatWorkspace({
  canManageModels = false,
  currentUser,
  isReachable,
  initialConversation,
  initialConversations,
  models,
  onActiveConversationChange,
  onRequestOpenModelOperations,
  onUiLanguagePreferenceChange,
  runningModels = [],
  uiLanguagePreference,
}: ChatWorkspaceProps) {
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(uiLanguagePreference, key, variables);
  const literal = (text: string, variables?: Record<string, string | number>) =>
    translateUiText(uiLanguagePreference, text, variables);
  const localizedPromptPresets = PROMPT_PRESETS.map((preset) => ({
    ...preset,
    label: literal(preset.label),
    prompt: literal(preset.prompt),
  }));
  const promptPresetsStorageKey = getPromptPresetsStorageKey(currentUser?.id);
  const pinnedConversationsStorageKey = getPinnedConversationsStorageKey(currentUser?.id);
  const pinnedOnlyFilterStorageKey = getPinnedOnlyFilterStorageKey(currentUser?.id);
  const archivedVisibilityStorageKey = getArchivedVisibilityStorageKey(currentUser?.id);
  const archivedRetentionStorageKey = getArchivedRetentionStorageKey(currentUser?.id);
  const archivedFilterStorageKey = getArchivedFilterStorageKey(currentUser?.id);
  const archivedSortStorageKey = getArchivedSortStorageKey(currentUser?.id);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversation?.id ?? null,
  );
  const [conversationTitle, setConversationTitle] = useState(
    initialConversation?.title ?? literal("New conversation"),
  );
  const [messages, setMessages] = useState<OllamaChatMessage[]>(
    initialConversation?.messages ?? [],
  );
  const [draft, setDraft] = useState("");
  const [isVoiceCaptureAvailable, setIsVoiceCaptureAvailable] = useState(false);
  const [isVoiceCapturing, setIsVoiceCapturing] = useState(false);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const [voiceTranscriptionLanguage, setVoiceTranscriptionLanguage] = useState<VoiceTranscriptionLanguage>(
    currentUser?.preferredVoiceTranscriptionLanguage ?? uiLanguagePreference,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationTitleDraft, setConversationTitleDraft] = useState(
    initialConversation?.title ?? literal("New conversation"),
  );
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showArchivedConversations, setShowArchivedConversations] = useState(false);
  const [archivedRetentionDays, setArchivedRetentionDays] = useState<number>(ARCHIVED_RETENTION_DAYS);
  const [archivedConversationFilter, setArchivedConversationFilter] = useState<ArchivedConversationFilter>("all");
  const [archivedConversationSort, setArchivedConversationSort] = useState<ArchivedConversationSort>("archived-newest");
  const [selectedArchivedConversationIds, setSelectedArchivedConversationIds] = useState<string[]>([]);
  const [showSavedChatsPanel, setShowSavedChatsPanel] = useState(true);
  const [showPromptPresets, setShowPromptPresets] = useState(
    (initialConversation?.messages?.length ?? 0) === 0,
  );
  const [loadedPromptPresetsKey, setLoadedPromptPresetsKey] = useState<string | null>(null);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [loadedPinnedConversationsKey, setLoadedPinnedConversationsKey] = useState<string | null>(null);
  const [loadedPinnedOnlyFilterKey, setLoadedPinnedOnlyFilterKey] = useState<string | null>(null);
  const [loadedArchivedVisibilityKey, setLoadedArchivedVisibilityKey] = useState<string | null>(null);
  const [loadedArchivedRetentionKey, setLoadedArchivedRetentionKey] = useState<string | null>(null);
  const [loadedArchivedFilterKey, setLoadedArchivedFilterKey] = useState<string | null>(null);
  const [loadedArchivedSortKey, setLoadedArchivedSortKey] = useState<string | null>(null);
  const [assistantProfiles, setAssistantProfiles] = useState<AiWorkspaceProfile[]>([]);
  const [hostedTalkToOptions, setHostedTalkToOptions] = useState<TalkToOption[]>([]);
  const [isLoadingAssistantProfiles, setIsLoadingAssistantProfiles] = useState(false);
  const [isLoadingTalkToOptions, setIsLoadingTalkToOptions] = useState(false);
  const [talkToDialogMessage, setTalkToDialogMessage] = useState<string | null>(null);
  const [selectedAssistantProfileId, setSelectedAssistantProfileId] = useState(
    initialConversation?.settings.assistantProfileId ?? "",
  );
  const [providerId, setProviderId] = useState<AiWorkspaceProfile["providerId"]>(
    initialConversation?.settings.providerId ?? "ollama",
  );
  const [selectedModel, setSelectedModel] = useState(
    initialConversation?.settings.model || currentUser?.preferredModel || models[0]?.name || "",
  );
  const [temperature, setTemperature] = useState(
    initialConversation?.settings.temperature ?? currentUser?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE,
  );
  const [systemPrompt, setSystemPrompt] = useState(
    initialConversation?.settings.systemPrompt ||
      currentUser?.preferredSystemPrompt ||
      DEFAULT_USER_SYSTEM_PROMPT,
  );
  const [useKnowledge, setUseKnowledge] = useState(
    initialConversation?.settings.useKnowledge ?? false,
  );
  const [groundingMode, setGroundingMode] = useState<AiGroundingMode>(
    initialConversation?.settings.groundingMode
      ?? (initialConversation?.settings.useKnowledge ? "balanced" : "off"),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [isRunningArchivedCleanup, setIsRunningArchivedCleanup] = useState(false);
  const [confirmArchivedCleanupAction, setConfirmArchivedCleanupAction] = useState<null | "delete-archived-empty" | "delete-archived-older-than" | "restore-archived-visible">(null);
  const [archivedCleanupSummary, setArchivedCleanupSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const archivedConversationItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioMonitorRef = useRef<GainNode | null>(null);
  const voiceDraftBaseRef = useRef("");
  const voiceSampleRateRef = useRef(16_000);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const activeVoicePointerIdRef = useRef<number | null>(null);
  const activeVoiceKeyboardRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const recentlyUpdatedConversationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setVoiceTranscriptionLanguage(currentUser?.preferredVoiceTranscriptionLanguage ?? uiLanguagePreference);
  }, [currentUser?.id, currentUser?.preferredVoiceTranscriptionLanguage, uiLanguagePreference]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssistantProfiles() {
      setIsLoadingAssistantProfiles(true);

      try {
        const response = await fetch("/api/ai/profiles", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const payload = (await response.json()) as AssistantProfilesResponse;

        if (!cancelled) {
          setAssistantProfiles(payload.profiles);
        }
      } catch {
        if (!cancelled) {
          setAssistantProfiles([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAssistantProfiles(false);
        }
      }
    }

    void loadAssistantProfiles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHostedTalkToOptions() {
      setIsLoadingTalkToOptions(true);

      try {
        const providerResponse = await fetch("/api/ai/providers", { cache: "no-store" });

        if (!providerResponse.ok) {
          throw new Error(await readErrorMessage(providerResponse));
        }

        const providerPayload = (await providerResponse.json()) as AiProvidersResponse;
        const configuredHostedProviders = providerPayload.providers.filter(
          (provider) => provider.kind === "hosted" && provider.configured,
        );

        const modelResponses = await Promise.all(
          configuredHostedProviders.map(async (provider) => {
            const response = await fetch(`/api/ai/models?providerId=${provider.id}`, { cache: "no-store" });

            if (!response.ok) {
              throw new Error(await readErrorMessage(response));
            }

            const payload = (await response.json()) as AiModelsResponse;
            return payload.models.map((model) => ({
              key: buildTalkToOptionKey(model.providerId, model.name),
              providerId: model.providerId,
              providerLabel: model.providerLabel,
              model: model.name,
              label: `${model.providerLabel} - ${model.displayName}`,
              kind: "hosted-configured" as const,
            }));
          }),
        );

        if (!cancelled) {
          setHostedTalkToOptions(modelResponses.flat());
        }
      } catch {
        if (!cancelled) {
          setHostedTalkToOptions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTalkToOptions(false);
        }
      }
    }

    void loadHostedTalkToOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const runningLocalTalkToOptions = Array.from(new Set(runningModels.filter(Boolean))).map((modelName) => ({
    key: buildTalkToOptionKey("ollama", modelName),
    providerId: "ollama" as const,
    providerLabel: literal("Ollama"),
    model: modelName,
    label: modelName,
    kind: "local-running" as const,
  }));
  const talkToOptions = [...runningLocalTalkToOptions, ...hostedTalkToOptions];
  const talkToOptionKeys = new Set(talkToOptions.map((option) => option.key));
  const preferredTalkToOption = getTalkToFallbackOption(talkToOptions, currentUser?.preferredModel);
  const talkToOptionsSignature = talkToOptions.map((option) => option.key).join("|");
  const preferredTalkToProviderId = preferredTalkToOption?.providerId ?? "ollama";
  const preferredTalkToModel = preferredTalkToOption?.model ?? "";

  useEffect(() => {
    setIsVoiceCaptureAvailable(
      typeof navigator !== "undefined"
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && Boolean(getAudioContextConstructor()),
    );
  }, []);

  useEffect(() => {
    return () => {
      const stream = mediaStreamRef.current;
      stream?.getTracks().forEach((track) => track.stop());
      audioSourceRef.current?.disconnect();
      audioProcessorRef.current?.disconnect();
      audioMonitorRef.current?.disconnect();
      void audioContextRef.current?.close().catch(() => undefined);

      mediaStreamRef.current = null;
      audioSourceRef.current = null;
      audioProcessorRef.current = null;
      audioMonitorRef.current = null;
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const currentSelectionKey = selectedModel
      ? buildTalkToOptionKey(providerId, selectedModel)
      : null;

    if (!selectedModel && preferredTalkToOption) {
      setProviderId(preferredTalkToOption.providerId);
      setSelectedModel(preferredTalkToOption.model);
      return;
    }

    if (selectedModel && currentSelectionKey && !talkToOptionKeys.has(currentSelectionKey)) {
      setSelectedAssistantProfileId("");

      if (preferredTalkToOption) {
        setProviderId(preferredTalkToOption.providerId);
        setSelectedModel(preferredTalkToOption.model);
        return;
      }

      setProviderId("ollama");
      setSelectedModel("");
    }
  }, [currentUser?.preferredModel, preferredTalkToModel, preferredTalkToProviderId, providerId, selectedModel, talkToOptionsSignature]);

  useEffect(() => {
    if (activeConversationId || messages.length > 0) {
      return;
    }

    setProviderId(preferredTalkToProviderId);
    setSelectedModel(preferredTalkToModel);
    setTemperature(currentUser?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE);
    setSystemPrompt(currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
    setUseKnowledge(false);
    setGroundingMode("off");
    setSelectedAssistantProfileId("");
  }, [activeConversationId, currentUser?.preferredSystemPrompt, currentUser?.preferredTemperature, messages.length, preferredTalkToModel, preferredTalkToProviderId]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(promptPresetsStorageKey);
      setShowPromptPresets(
        parsePromptPresetsPreference(
          storedValue,
          (initialConversation?.messages?.length ?? 0) === 0,
        ),
      );
    } catch {
      setShowPromptPresets((initialConversation?.messages?.length ?? 0) === 0);
    } finally {
      setLoadedPromptPresetsKey(promptPresetsStorageKey);
    }
  }, [initialConversation?.messages?.length, promptPresetsStorageKey]);

  useEffect(() => {
    if (loadedPromptPresetsKey !== promptPresetsStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(promptPresetsStorageKey, String(showPromptPresets));
    } catch {
      // Ignore storage failures and keep the in-memory preset drawer state.
    }
  }, [loadedPromptPresetsKey, promptPresetsStorageKey, showPromptPresets]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(pinnedConversationsStorageKey);
      setPinnedConversationIds(parsePinnedConversationIds(storedValue));
    } catch {
      setPinnedConversationIds([]);
    } finally {
      setLoadedPinnedConversationsKey(pinnedConversationsStorageKey);
    }
  }, [pinnedConversationsStorageKey]);

  useEffect(() => {
    if (loadedPinnedConversationsKey !== pinnedConversationsStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(
        pinnedConversationsStorageKey,
        JSON.stringify(pinnedConversationIds),
      );
    } catch {
      // Ignore storage failures and keep the in-memory pinned conversation state.
    }
  }, [loadedPinnedConversationsKey, pinnedConversationIds, pinnedConversationsStorageKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(pinnedOnlyFilterStorageKey);
      setShowPinnedOnly(parsePinnedOnlyFilterPreference(storedValue));
    } catch {
      setShowPinnedOnly(false);
    } finally {
      setLoadedPinnedOnlyFilterKey(pinnedOnlyFilterStorageKey);
    }
  }, [pinnedOnlyFilterStorageKey]);

  useEffect(() => {
    if (loadedPinnedOnlyFilterKey !== pinnedOnlyFilterStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(pinnedOnlyFilterStorageKey, String(showPinnedOnly));
    } catch {
      // Ignore storage failures and keep the in-memory pinned-only filter state.
    }
  }, [loadedPinnedOnlyFilterKey, pinnedOnlyFilterStorageKey, showPinnedOnly]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(archivedVisibilityStorageKey);
      setShowArchivedConversations(parseArchivedVisibilityPreference(storedValue));
    } catch {
      setShowArchivedConversations(false);
    } finally {
      setLoadedArchivedVisibilityKey(archivedVisibilityStorageKey);
    }
  }, [archivedVisibilityStorageKey]);

  useEffect(() => {
    if (loadedArchivedVisibilityKey !== archivedVisibilityStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(archivedVisibilityStorageKey, String(showArchivedConversations));
    } catch {
      // Ignore storage failures and keep the in-memory archived visibility state.
    }
  }, [archivedVisibilityStorageKey, loadedArchivedVisibilityKey, showArchivedConversations]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(archivedRetentionStorageKey);
      setArchivedRetentionDays(parseArchivedRetentionPreference(storedValue));
    } catch {
      setArchivedRetentionDays(ARCHIVED_RETENTION_DAYS);
    } finally {
      setLoadedArchivedRetentionKey(archivedRetentionStorageKey);
    }
  }, [archivedRetentionStorageKey]);

  useEffect(() => {
    if (loadedArchivedRetentionKey !== archivedRetentionStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(archivedRetentionStorageKey, String(archivedRetentionDays));
    } catch {
      // Ignore storage failures and keep the in-memory archived retention preference.
    }
  }, [archivedRetentionDays, archivedRetentionStorageKey, loadedArchivedRetentionKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(archivedFilterStorageKey);
      setArchivedConversationFilter(parseArchivedFilterPreference(storedValue));
    } catch {
      setArchivedConversationFilter("all");
    } finally {
      setLoadedArchivedFilterKey(archivedFilterStorageKey);
    }
  }, [archivedFilterStorageKey]);

  useEffect(() => {
    if (loadedArchivedFilterKey !== archivedFilterStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(archivedFilterStorageKey, archivedConversationFilter);
    } catch {
      // Ignore storage failures and keep the in-memory archived filter.
    }
  }, [archivedConversationFilter, archivedFilterStorageKey, loadedArchivedFilterKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(archivedSortStorageKey);
      setArchivedConversationSort(parseArchivedSortPreference(storedValue));
    } catch {
      setArchivedConversationSort("archived-newest");
    } finally {
      setLoadedArchivedSortKey(archivedSortStorageKey);
    }
  }, [archivedSortStorageKey]);

  useEffect(() => {
    if (loadedArchivedSortKey !== archivedSortStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(archivedSortStorageKey, archivedConversationSort);
    } catch {
      // Ignore storage failures and keep the in-memory archived sort preference.
    }
  }, [archivedConversationSort, archivedSortStorageKey, loadedArchivedSortKey]);

  useEffect(() => {
    const textarea = draftInputRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 128), 320);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 320 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      if (recentlyUpdatedConversationTimeoutRef.current) {
        window.clearTimeout(recentlyUpdatedConversationTimeoutRef.current);
      }
    };
  }, []);

  const [recentlyUpdatedConversationId, setRecentlyUpdatedConversationId] = useState<string | null>(null);

  function markConversationAsRecentlyUpdated(conversationId: string) {
    setRecentlyUpdatedConversationId(conversationId);

    if (recentlyUpdatedConversationTimeoutRef.current) {
      window.clearTimeout(recentlyUpdatedConversationTimeoutRef.current);
    }

    recentlyUpdatedConversationTimeoutRef.current = window.setTimeout(() => {
      setRecentlyUpdatedConversationId((current) =>
        current === conversationId ? null : current,
      );
      recentlyUpdatedConversationTimeoutRef.current = null;
    }, 90_000);
  }

  const selectedAssistantProfile = selectedAssistantProfileId
    ? assistantProfiles.find((profile) => profile.id === selectedAssistantProfileId) ?? null
    : null;

  function buildConversationSettings() {
    return {
      model: selectedModel,
      providerId,
      systemPrompt,
      temperature,
      useKnowledge,
      groundingMode: useKnowledge ? groundingMode : "off",
      assistantProfileId: selectedAssistantProfileId || null,
    };
  }

  function applyAssistantProfile(profileId: string) {
    if (!profileId) {
      setSelectedAssistantProfileId("");
      setProviderId("ollama");
      return;
    }

    const profile = assistantProfiles.find((entry) => entry.id === profileId);

    if (!profile) {
      return;
    }

    setSelectedAssistantProfileId(profile.id);
    setProviderId(profile.providerId);
    setSelectedModel(profile.model);
    setSystemPrompt(profile.systemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
    setTemperature(profile.temperature);
    setUseKnowledge(profile.useKnowledge);
    setGroundingMode(profile.useKnowledge ? profile.groundingMode : "off");
  }

  async function handleTalkToEmptyAction() {
    if (canManageModels && onRequestOpenModelOperations) {
      await onRequestOpenModelOperations();
      return;
    }

    setTalkToDialogMessage(
      literal("No models are started right now. Contact an administrator to start one from the Models page."),
    );
  }

  async function createConversationRecord(nextMessages: OllamaChatMessage[]) {
    if (!currentUser) {
      throw new Error("Sign in to save conversations.");
    }

    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: buildConversationTitle(nextMessages, literal("New conversation")),
        messages: nextMessages,
        settings: buildConversationSettings(),
      }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const payload = (await response.json()) as PersistedConversationResponse;

    setActiveConversationId(payload.conversation.id);
    setConversationTitle(payload.conversation.title);
    startTransition(() => {
      setConversations((current) => [
        payload.summary,
        ...current.filter((item) => item.id !== payload.summary.id),
      ]);
    });
    markConversationAsRecentlyUpdated(payload.summary.id);

    return payload.conversation.id;
  }

  async function persistConversation(
    nextMessages: OllamaChatMessage[],
    existingConversationId?: string,
    options?: { archived?: boolean },
  ) {
    if (!currentUser) {
      return;
    }

    const title = buildConversationTitle(nextMessages, literal("New conversation"));
    const conversationId =
      existingConversationId ??
      activeConversationId ??
      (await createConversationRecord(nextMessages));

    setIsSavingConversation(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          messages: nextMessages,
          settings: buildConversationSettings(),
          archived: options?.archived,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as PersistedConversationResponse;

      setConversationTitle(payload.conversation.title);
      startTransition(() => {
        setConversations((current) => [
          payload.summary,
          ...current.filter((item) => item.id !== payload.summary.id),
        ]);
      });
      markConversationAsRecentlyUpdated(payload.summary.id);
    } finally {
      setIsSavingConversation(false);
    }
  }

  const queueSettingsSave = useEffectEvent(() => {
    void persistConversation(messages).catch((saveError) => {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save conversation settings.",
      );
    });
  });

  useEffect(() => {
    if (!activeConversationId || isStreaming) {
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      queueSettingsSave();
    }, 500);
  }, [activeConversationId, groundingMode, isStreaming, providerId, selectedAssistantProfileId, selectedModel, systemPrompt, temperature, useKnowledge]);

  useEffect(() => {
    setConversationTitleDraft(conversationTitle);
  }, [conversationTitle]);

  async function openConversation(id: string) {
    if (!currentUser) {
      return;
    }

    if (id === activeConversationId || isStreaming) {
      return;
    }

    setIsLoadingConversation(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        conversation: StoredConversation;
      };
      const { conversation } = payload;

      setActiveConversationId(conversation.id);
      setConversationTitle(conversation.title);
      setMessages(conversation.messages);
      setSelectedModel(
        conversation.settings.model
          || (currentUser?.preferredModel && models.some((model) => model.name === currentUser.preferredModel)
            ? currentUser.preferredModel
            : models[0]?.name)
          || "",
      );
      setProviderId(conversation.settings.providerId ?? "ollama");
      setSystemPrompt(conversation.settings.systemPrompt || currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
      setTemperature(conversation.settings.temperature ?? currentUser?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE);
      setUseKnowledge(conversation.settings.useKnowledge ?? false);
      setGroundingMode(
        conversation.settings.groundingMode
          ?? (conversation.settings.useKnowledge ? "balanced" : "off"),
      );
      setSelectedAssistantProfileId(conversation.settings.assistantProfileId ?? "");
      setDraft("");
      setLastLatency(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to open the conversation.",
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function renameActiveConversationTitle() {
    if (!currentUser || !activeConversationId) {
      return;
    }

    const nextTitle = conversationTitleDraft.trim();

    if (!nextTitle || nextTitle === conversationTitle) {
      return;
    }

    setIsSavingConversation(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${activeConversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: nextTitle,
          messages,
          settings: buildConversationSettings(),
          archived: conversations.find((conversation) => conversation.id === activeConversationId)?.archivedAt !== null,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as PersistedConversationResponse;
      setConversationTitle(payload.conversation.title);
      setConversationTitleDraft(payload.conversation.title);
      startTransition(() => {
        setConversations((current) => [
          payload.summary,
          ...current.filter((item) => item.id !== payload.summary.id),
        ]);
      });
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : "Unable to rename the conversation.",
      );
    } finally {
      setIsSavingConversation(false);
    }
  }

  function startNewConversation() {
    abortControllerRef.current?.abort();
    setActiveConversationId(null);
    setConversationTitle(literal("New conversation"));
    setConversationTitleDraft(literal("New conversation"));
    setDraft("");
    setError(null);
    setLastLatency(null);
    setIsStreaming(false);
    setMessages([]);
    setProviderId(preferredTalkToProviderId);
    setSelectedModel(preferredTalkToModel);
    setSystemPrompt(currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
    setTemperature(currentUser?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE);
    setUseKnowledge(false);
    setGroundingMode("off");
    setSelectedAssistantProfileId("");
  }

  async function deleteConversationRecord(id: string) {
    if (!currentUser) {
      return;
    }

    setError(null);
    setArchivedCleanupSummary(null);

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setConversations((current) =>
        current.filter((conversation) => conversation.id !== id),
      );
      setPinnedConversationIds((current) => current.filter((conversationId) => conversationId !== id));
      setSelectedArchivedConversationIds((current) => current.filter((conversationId) => conversationId !== id));

      if (showPinnedOnly && pinnedConversationIds.length <= 1) {
        setShowPinnedOnly(false);
      }

      if (id === activeConversationId) {
        startNewConversation();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the conversation.",
      );
    }
  }

  async function setConversationArchived(id: string, archived: boolean) {
    if (!currentUser) {
      return;
    }

    setError(null);
    setArchivedCleanupSummary(null);

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archived }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as PersistedConversationResponse;
      setConversations((current) => [
        payload.summary,
        ...current.filter((conversation) => conversation.id !== payload.summary.id),
      ]);
      setSelectedArchivedConversationIds((current) => current.filter((conversationId) => conversationId !== id));

      if (archived) {
        setPinnedConversationIds((current) => current.filter((conversationId) => conversationId !== id));

        if (id === activeConversationId) {
          startNewConversation();
        }

        if (!showArchivedConversations) {
          setShowArchivedConversations(true);
        }

        return;
      }

      setActiveConversationId(payload.conversation.id);
      setConversationTitle(payload.conversation.title);
      setConversationTitleDraft(payload.conversation.title);
      setMessages(payload.conversation.messages);
      setSelectedModel(
        payload.conversation.settings.model || preferredTalkToModel,
      );
      setProviderId(payload.conversation.settings.providerId ?? preferredTalkToProviderId);
      setSystemPrompt(payload.conversation.settings.systemPrompt || currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
      setTemperature(payload.conversation.settings.temperature ?? currentUser?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE);
      setUseKnowledge(payload.conversation.settings.useKnowledge ?? false);
      setGroundingMode(
        payload.conversation.settings.groundingMode
          ?? (payload.conversation.settings.useKnowledge ? "balanced" : "off"),
      );
      setSelectedAssistantProfileId(payload.conversation.settings.assistantProfileId ?? "");
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : archived
            ? "Unable to archive the conversation."
            : "Unable to restore the conversation.",
      );
    }
  }

  async function runArchivedCleanup(action: "delete-archived-empty" | "delete-archived-older-than") {
    if (!currentUser) {
      return;
    }

    setError(null);
    setArchivedCleanupSummary(null);
    setIsRunningArchivedCleanup(true);
    setConfirmArchivedCleanupAction(null);
    const archivedActionScope = selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible";
    const targetArchivedIds = selectedArchivedVisibleConversationIds.length > 0
      ? selectedArchivedVisibleConversationIds
      : archivedVisibleConversations.map((conversation) => conversation.id);

    try {
      const response = await fetch("/api/conversations/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          olderThanDays: action === "delete-archived-older-than" ? archivedRetentionDays : undefined,
          ids: targetArchivedIds,
          scope: archivedActionScope,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        deletedCount: number;
        deletedIds: string[];
        olderThanDays: number | null;
      };
      const deletedIdSet = new Set(payload.deletedIds);

      setConversations((current) => current.filter((conversation) => !deletedIdSet.has(conversation.id)));
      setPinnedConversationIds((current) => current.filter((conversationId) => !deletedIdSet.has(conversationId)));
      setSelectedArchivedConversationIds((current) => current.filter((conversationId) => !deletedIdSet.has(conversationId)));

      if (activeConversationId && deletedIdSet.has(activeConversationId)) {
        startNewConversation();
      }

      setArchivedCleanupSummary(
        action === "delete-archived-empty"
          ? payload.deletedCount > 0
            ? `Deleted ${payload.deletedCount} archived empty chat${payload.deletedCount === 1 ? "" : "s"} from the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"}.`
            : `No archived empty chats in the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"} needed cleanup.`
          : payload.deletedCount > 0
            ? `Deleted ${payload.deletedCount} archived chat${payload.deletedCount === 1 ? "" : "s"} older than ${payload.olderThanDays} days from the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"}.`
            : `No archived chats older than ${payload.olderThanDays} days in the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"} needed cleanup.`,
      );
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Unable to clean up archived conversations.",
      );
    } finally {
      setIsRunningArchivedCleanup(false);
    }
  }

  async function runArchivedRestore() {
    if (!currentUser) {
      return;
    }

    setError(null);
    setArchivedCleanupSummary(null);
    setIsRunningArchivedCleanup(true);
    setConfirmArchivedCleanupAction(null);
    const archivedActionScope = selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible";
    const targetArchivedIds = selectedArchivedVisibleConversationIds.length > 0
      ? selectedArchivedVisibleConversationIds
      : archivedVisibleConversations.map((conversation) => conversation.id);

    try {
      const response = await fetch("/api/conversations/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "restore-archived-visible",
          ids: targetArchivedIds,
          scope: archivedActionScope,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        restoredCount: number;
        restoredIds: string[];
        restoredAt: string;
      };
      const restoredIdSet = new Set(payload.restoredIds);

      setConversations((current) => current.map((conversation) =>
        restoredIdSet.has(conversation.id)
          ? {
            ...conversation,
            archivedAt: null,
            updatedAt: payload.restoredAt,
          }
          : conversation,
      ));
      setSelectedArchivedConversationIds((current) => current.filter((conversationId) => !restoredIdSet.has(conversationId)));

      setArchivedCleanupSummary(
        payload.restoredCount > 0
          ? `Restored ${payload.restoredCount} archived chat${payload.restoredCount === 1 ? "" : "s"} from the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"}.`
          : `No archived chats were restored from the ${selectedArchivedVisibleConversationIds.length > 0 ? "current selection" : "current view"}.`,
      );
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Unable to restore archived conversations.",
      );
    } finally {
      setIsRunningArchivedCleanup(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();

    if (!content || !selectedModel || isStreaming) {
      return;
    }

    const nextUserMessage: OllamaChatMessage = {
      role: "user",
      content,
    };
    const nextConversation = [...messages, nextUserMessage];
    const placeholderAssistant: OllamaChatMessage = {
      role: "assistant",
      content: "",
    };
    const startedAt = performance.now();
    const controller = new AbortController();
    let ensuredConversationId = activeConversationId ?? undefined;
    let assistantContent = "";
    let knowledgeCitations: AiKnowledgeCitation[] = [];

    abortControllerRef.current = controller;
    setError(null);
    setLastLatency(null);
    setDraft("");
    setIsStreaming(true);
    startTransition(() => {
      setMessages([...nextConversation, placeholderAssistant]);
    });

    try {
      ensuredConversationId =
        activeConversationId ??
        (await createConversationRecord(nextConversation));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          providerId,
          model: selectedModel,
          messages: nextConversation,
          temperature,
          systemPrompt,
          useKnowledge,
          groundingMode: useKnowledge ? groundingMode : "off",
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await readErrorMessage(response));
      }

      knowledgeCitations = readKnowledgeCitationsHeader(response);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        assistantContent += decoder.decode(value, { stream: true });
        const snapshot = assistantContent;

        startTransition(() => {
          setMessages((current) => {
            const updated = [...current];
            const lastMessage = updated.at(-1);

            if (!lastMessage || lastMessage.role !== "assistant") {
              return current;
            }

            updated[updated.length - 1] = {
              ...lastMessage,
              content: snapshot,
              knowledgeCitations,
            };

            return updated;
          });
        });
      }

      setLastLatency(Math.round(performance.now() - startedAt));
      await persistConversation([
        ...nextConversation,
        {
          role: "assistant",
          content: assistantContent,
          knowledgeCitations,
        },
      ], ensuredConversationId, { archived: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (assistantContent) {
          await persistConversation([
            ...nextConversation,
            {
              role: "assistant",
              content: assistantContent,
              knowledgeCitations,
            },
          ], ensuredConversationId, { archived: false }).catch(() => undefined);
        }

        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to complete chat request.";
      const fallbackContent =
        assistantContent ||
        "The Ollama gateway could not complete this response.";

      setError(message);
      startTransition(() => {
        setMessages((current) => {
          const updated = [...current];
          const lastMessage = updated.at(-1);

          if (!lastMessage || lastMessage.role !== "assistant") {
            return current;
          }

          updated[updated.length - 1] = {
            ...lastMessage,
            content: fallbackContent,
            knowledgeCitations,
          };

          return updated;
        });
      });

      await persistConversation([
        ...nextConversation,
        {
          role: "assistant",
          content: fallbackContent,
          knowledgeCitations,
        },
      ], ensuredConversationId, { archived: false }).catch(() => undefined);
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  async function submitVoiceCapture() {
    const recordedAudio = mergeAudioChunks(audioChunksRef.current);
    audioChunksRef.current = [];

    if (recordedAudio.length < 1_024) {
      setError("No speech was detected while push-to-talk was active.");
      return;
    }

    setIsVoiceTranscribing(true);

    try {
      const audioBlob = encodeWav(recordedAudio, voiceSampleRateRef.current);
      const formData = new FormData();
      formData.append("file", new File([audioBlob], "voice-input.wav", { type: "audio/wav" }));
      formData.append("language", voiceTranscriptionLanguage);

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { text: string };
      const transcript = payload.text.trim();

      if (!transcript) {
        setError("No speech was recognized from that recording.");
        return;
      }

      setDraft(mergeVoiceDraft(voiceDraftBaseRef.current, transcript));
      window.requestAnimationFrame(() => {
        composerFormRef.current?.requestSubmit();
      });
    } catch (voiceError) {
      setError(
        voiceError instanceof Error
          ? voiceError.message
          : "Unable to transcribe the recorded audio.",
      );
    } finally {
      setIsVoiceTranscribing(false);
    }
  }

  async function stopVoiceCapture(options?: { submit?: boolean }) {
    const stream = mediaStreamRef.current;
    const audioContext = audioContextRef.current;

    if (!stream && !audioContext) {
      return;
    }

    stream?.getTracks().forEach((track) => track.stop());
    audioSourceRef.current?.disconnect();
    audioProcessorRef.current?.disconnect();
    audioMonitorRef.current?.disconnect();
    await audioContext?.close().catch(() => undefined);

    mediaStreamRef.current = null;
    audioSourceRef.current = null;
    audioProcessorRef.current = null;
    audioMonitorRef.current = null;
    audioContextRef.current = null;
    setIsVoiceCapturing(false);

    if (options?.submit) {
      await submitVoiceCapture();
      return;
    }

    audioChunksRef.current = [];
  }

  async function startVoiceCapture() {
    if (isStreaming || isVoiceCapturing || isVoiceTranscribing) {
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();

    if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) {
      setError("Push-to-talk is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const monitor = audioContext.createGain();

      audioChunksRef.current = [];
      voiceDraftBaseRef.current = draft;
      voiceSampleRateRef.current = audioContext.sampleRate;
      processor.onaudioprocess = (event) => {
        audioChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      monitor.gain.value = 0;
      source.connect(processor);
      processor.connect(monitor);
      monitor.connect(audioContext.destination);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      audioMonitorRef.current = monitor;
      setError(null);
      setIsVoiceCapturing(true);
    } catch (voiceError) {
      setError(
        voiceError instanceof DOMException
          ? getVoiceCaptureErrorMessage(voiceError.name)
          : "Push-to-talk could not start the microphone.",
      );
      setIsVoiceCapturing(false);
    }
  }

  function clearConversation() {
    abortControllerRef.current?.abort();
    void stopVoiceCapture();
    setDraft("");
    setError(null);
    setIsStreaming(false);
    setMessages([]);
    setShowPromptPresets(true);

    if (activeConversationId) {
      void persistConversation([]).catch(() => undefined);
    }
  }

  function applyPromptPreset(prompt: string) {
    setDraft(prompt);
    setShowPromptPresets(false);
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  }

  function togglePinnedConversation(id: string) {
    setPinnedConversationIds((current) =>
      current.includes(id)
        ? current.filter((conversationId) => conversationId !== id)
        : [id, ...current.filter((conversationId) => conversationId !== id)],
    );
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (!draft.trim() || !selectedModel || isStreaming) {
      return;
    }

    composerFormRef.current?.requestSubmit();
  }

  function handleVoiceCapturePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    activeVoicePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    void startVoiceCapture();
  }

  function handleVoiceCapturePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (activeVoicePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activeVoicePointerIdRef.current = null;
    void stopVoiceCapture({ submit: true });
  }

  function handleVoiceCapturePointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    if (activeVoicePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activeVoicePointerIdRef.current = null;
    void stopVoiceCapture();
  }

  function handleVoiceCaptureKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat || activeVoiceKeyboardRef.current) {
      return;
    }

    event.preventDefault();
    activeVoiceKeyboardRef.current = true;
    void startVoiceCapture();
  }

  function handleVoiceCaptureKeyUp(event: React.KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || !activeVoiceKeyboardRef.current) {
      return;
    }

    event.preventDefault();
    activeVoiceKeyboardRef.current = false;
    void stopVoiceCapture({ submit: true });
  }

  const normalizedConversationSearch = conversationSearch.trim().toLowerCase();
  const filteredConversations = normalizedConversationSearch
    ? conversations.filter((conversation) => {
      const haystack = `${conversation.title} ${conversation.lastMessagePreview}`.toLowerCase();
      return haystack.includes(normalizedConversationSearch);
    })
    : conversations;
  const activeConversationSummary = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null;
  const activeConversationIsArchived = Boolean(activeConversationSummary?.archivedAt);
  const allArchivedConversations = conversations.filter((conversation) => conversation.archivedAt);
  const archivedConversationCount = allArchivedConversations.length;
  const archivedEmptyConversationCount = allArchivedConversations.filter((conversation) => conversation.messageCount === 0).length;
  const archivedOlderConversationCount = allArchivedConversations.filter((conversation) => {
    return isConversationOlderThanArchivedRetention(conversation.archivedAt, archivedRetentionDays);
  }).length;
  const archivedConversations = filteredConversations.filter((conversation) => conversation.archivedAt);
  const nonArchivedConversations = filteredConversations.filter((conversation) => !conversation.archivedAt);
  const pinnedConversationIdSet = new Set(pinnedConversationIds);
  const visibleConversations = [...nonArchivedConversations]
    .filter((conversation) => !showPinnedOnly || pinnedConversationIdSet.has(conversation.id))
    .sort((left, right) => {
    const leftPinned = pinnedConversationIdSet.has(left.id);
    const rightPinned = pinnedConversationIdSet.has(right.id);

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
  const pinnedVisibleConversations = visibleConversations.filter((conversation) => pinnedConversationIdSet.has(conversation.id));
  const recentVisibleConversations = visibleConversations.filter((conversation) => !pinnedConversationIdSet.has(conversation.id));
  const archivedVisibleConversations = [...archivedConversations]
    .filter((conversation) => {
      if (archivedConversationFilter === "empty") {
        return conversation.messageCount === 0;
      }

      if (archivedConversationFilter === "old") {
        return isConversationOlderThanArchivedRetention(conversation.archivedAt, archivedRetentionDays);
      }

      return true;
    })
    .sort((left, right) => {
      const leftValue = getArchivedConversationSortValue(left, archivedConversationSort);
      const rightValue = getArchivedConversationSortValue(right, archivedConversationSort);

      if (archivedConversationSort === "archived-oldest") {
        return leftValue.localeCompare(rightValue);
      }

      return rightValue.localeCompare(leftValue);
    });
  useEffect(() => {
    if (!onActiveConversationChange) {
      return;
    }

    if (!activeConversationId) {
      if (messages.length === 0) {
        onActiveConversationChange(null);
        return;
      }

      onActiveConversationChange({
        archivedAt: null,
        id: null,
        messageCount: messages.length,
        modelName: selectedModel,
        title: conversationTitle,
      });
      return;
    }

    onActiveConversationChange({
      archivedAt: activeConversationSummary?.archivedAt ?? null,
      id: activeConversationId,
      messageCount: activeConversationSummary?.messageCount ?? messages.length,
      modelName: selectedModel,
      title: activeConversationSummary?.title ?? conversationTitle,
    });
  }, [
    activeConversationId,
    activeConversationSummary?.archivedAt,
    activeConversationSummary?.messageCount,
    activeConversationSummary?.title,
    conversationTitle,
    messages.length,
    onActiveConversationChange,
    selectedModel,
  ]);

  const archivedVisibleConversationIds = archivedVisibleConversations.map((conversation) => conversation.id);
  const archivedVisibleConversationSignature = archivedVisibleConversationIds.join("|");
  const archivedVisibleConversationIdSet = new Set(archivedVisibleConversationIds);
  const selectedArchivedVisibleConversationIds = selectedArchivedConversationIds.filter((conversationId) =>
    archivedVisibleConversationIdSet.has(conversationId),
  );
  const selectedArchivedVisibleConversationIdSet = new Set(selectedArchivedVisibleConversationIds);
  const archivedVisibleEmptyConversationIds = archivedVisibleConversations
    .filter((conversation) => conversation.messageCount === 0)
    .map((conversation) => conversation.id);
  const archivedVisibleOlderConversationIds = archivedVisibleConversations
    .filter((conversation) => {
      return isConversationOlderThanArchivedRetention(conversation.archivedAt, archivedRetentionDays);
    })
    .map((conversation) => conversation.id);
  const archivedActionConversations = selectedArchivedVisibleConversationIds.length > 0
    ? archivedVisibleConversations.filter((conversation) => selectedArchivedVisibleConversationIdSet.has(conversation.id))
    : archivedVisibleConversations;
  const archivedActionEmptyConversationCount = archivedActionConversations.filter(
    (conversation) => conversation.messageCount === 0,
  ).length;
  const archivedActionOlderConversationCount = archivedActionConversations.filter((conversation) => {
    return isConversationOlderThanArchivedRetention(conversation.archivedAt, archivedRetentionDays);
  }).length;
  const archivedSummaryText = selectedArchivedVisibleConversationIds.length > 0
    ? literal("Showing {count} {filterSummary}, sorted {sortSummary}. {selectedCount} selected for bulk actions.", {
        count: archivedVisibleConversations.length,
        filterSummary: getArchivedFilterSummaryLabel(archivedConversationFilter, archivedRetentionDays, literal),
        sortSummary: getArchivedSortSummaryLabel(archivedConversationSort, literal),
        selectedCount: selectedArchivedVisibleConversationIds.length,
      })
    : literal("Showing {count} {filterSummary}, sorted {sortSummary}.", {
        count: archivedVisibleConversations.length,
        filterSummary: getArchivedFilterSummaryLabel(archivedConversationFilter, archivedRetentionDays, literal),
        sortSummary: getArchivedSortSummaryLabel(archivedConversationSort, literal),
      });
  const recentConversationGroups = ["Today", "Yesterday", "This week", "Older"]
    .map((label) => ({
      label,
      conversations: recentVisibleConversations.filter(
        (conversation) => getConversationDayBucketLabel(conversation.updatedAt) === label,
      ),
    }))
    .filter((group) => group.conversations.length > 0);
  const savedChatsSummary = currentUser
    ? literal("{visibleCount} in view / {pinnedCount} pinned", {
        visibleCount: visibleConversations.length,
        pinnedCount: pinnedConversationIds.length,
      })
    : literal("Sign in to save and reopen chats");
  const hasCallableTalkToOptions = talkToOptions.length > 0;
  const localAiStatusLabel = hasCallableTalkToOptions ? literal("Model ready") : literal("None running");
  const accountSystemPrompt = currentUser?.preferredSystemPrompt?.trim() || DEFAULT_USER_SYSTEM_PROMPT;
  const collapsedSavedChatPreview = visibleConversations.slice(0, 3);
  const transcriptSummary = messages.length > 0
    ? literal("{count} messages in this thread", { count: messages.length })
    : literal("Fresh thread ready for the first prompt");
  const isUsingAccountPrompt = systemPrompt.trim() === accountSystemPrompt;
  const assistantStyleBadgeLabel = isUsingAccountPrompt ? literal("Account style") : literal("Saved thread style");
  const groundingStatusLabel = !useKnowledge || groundingMode === "off"
    ? literal("Grounding off")
    : groundingMode === "strict"
      ? literal("Strict grounding")
      : literal("Balanced grounding");
  const disclosureHeaderBaseClass = "group relative flex w-full items-start justify-between gap-4 overflow-hidden rounded-[24px] border px-4 py-4 text-left shadow-[0_18px_44px_rgba(83,53,31,0.1)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_rgba(83,53,31,0.14)]";
  const disclosureIndicatorClass = "theme-surface-chip inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground";

  useEffect(() => {
    const nextVisibleConversationIdSet = new Set(
      archivedVisibleConversationSignature
        ? archivedVisibleConversationSignature.split("|")
        : [],
    );

    setSelectedArchivedConversationIds((current) => current.filter((conversationId) =>
      nextVisibleConversationIdSet.has(conversationId),
    ));
  }, [archivedVisibleConversationSignature]);

  function toggleArchivedConversationSelection(id: string) {
    setSelectedArchivedConversationIds((current) =>
      current.includes(id)
        ? current.filter((conversationId) => conversationId !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllArchivedVisible() {
    if (selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length) {
      setSelectedArchivedConversationIds([]);
      return;
    }

    setSelectedArchivedConversationIds(archivedVisibleConversationIds);
  }

  function replaceArchivedSelection(ids: string[]) {
    setSelectedArchivedConversationIds(ids);
    setConfirmArchivedCleanupAction(null);
    setArchivedCleanupSummary(null);
  }

  function focusArchivedConversationByOffset(currentId: string, offset: number) {
    const currentIndex = archivedVisibleConversationIds.indexOf(currentId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = currentIndex + offset;

    if (nextIndex < 0 || nextIndex >= archivedVisibleConversationIds.length) {
      return;
    }

    const nextId = archivedVisibleConversationIds[nextIndex];
    archivedConversationItemRefs.current[nextId]?.focus();
  }

  function handleArchivedConversationKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      toggleArchivedConversationSelection(id);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void openConversation(id);
      return;
    }

    if (event.key.toLowerCase() === "a") {
      event.preventDefault();
      toggleSelectAllArchivedVisible();
      return;
    }

    if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      replaceArchivedSelection(archivedVisibleEmptyConversationIds);
      return;
    }

    if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      replaceArchivedSelection(archivedVisibleOlderConversationIds);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSelectedArchivedConversationIds([]);
      setConfirmArchivedCleanupAction(null);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusArchivedConversationByOffset(id, 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusArchivedConversationByOffset(id, -1);
    }
  }

  const savedChatsPanel = (
    <div data-tour-id="chat-saved-chats" className="theme-surface-soft overflow-hidden rounded-[28px] p-3 sm:p-4">
      <button
        aria-controls="saved-chats-panel-body"
        aria-expanded={showSavedChatsPanel}
        className={`${disclosureHeaderBaseClass} theme-surface-feature`}
        type="button"
        onClick={() => setShowSavedChatsPanel((current) => !current)}
      >
        <span className="min-w-0">
          <span className="eyebrow text-muted">{literal("Saved chats")}</span>
          <span className="mt-2 block text-base font-semibold text-foreground sm:text-lg">
            {literal("Recent threads and archived history")}
          </span>
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:color-mix(in_srgb,var(--accent-strong)_72%,white_28%)]">
            {literal("Expand to browse and act")}
          </span>
          <span className="theme-surface-chip mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-xs font-medium text-muted">
            {savedChatsSummary}
          </span>
        </span>
        <span className="mt-1 hidden flex-col items-end gap-2 sm:inline-flex">
          <span className="theme-surface-chip rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {showSavedChatsPanel ? literal("Collapse") : literal("Expand")}
          </span>
          <span className={disclosureIndicatorClass}>
            <DisclosureChevronIcon open={showSavedChatsPanel} />
          </span>
        </span>
        <span className={`${disclosureIndicatorClass} mt-1 sm:hidden`}>
          <DisclosureChevronIcon open={showSavedChatsPanel} />
        </span>
      </button>

      {showSavedChatsPanel ? (
        <div id="saved-chats-panel-body" className="mt-3 space-y-4 overflow-y-auto pr-1 lg:max-h-[32rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted sm:text-sm">
                {currentUser
                  ? literal("Saved for {name}.", { name: currentUser.displayName })
                  : literal("Sign in to enable per-user saved conversations.")}
              </p>
            </div>
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              type="button"
              onClick={startNewConversation}
            >
              {literal("New chat")}
            </button>
          </div>

          {currentUser ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold">{literal("Pins")}</span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                    {literal("{count} pinned", { count: pinnedConversationIds.length })}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                    {literal("{count} archived", { count: archivedConversationCount })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      showPinnedOnly
                        ? "bg-[var(--accent)] text-white"
                        : "border border-line bg-white text-foreground"
                    }`}
                    disabled={pinnedConversationIds.length === 0}
                    type="button"
                    onClick={() => setShowPinnedOnly((current) => !current)}
                  >
                    {showPinnedOnly ? literal("Show all chats") : literal("Pinned only")}
                  </button>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      showArchivedConversations
                        ? "bg-[var(--accent)] text-white"
                        : "border border-line bg-white text-foreground"
                    }`}
                    disabled={archivedConversationCount === 0 && !showArchivedConversations}
                    type="button"
                    onClick={() => setShowArchivedConversations((current) => !current)}
                  >
                    {showArchivedConversations ? literal("Hide archived") : literal("Show archived")}
                  </button>
                </div>
              </div>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Search saved chats")}
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
              />
              {activeConversationId ? (
                <div className="theme-surface-strong rounded-[22px] p-3">
                  <p className="eyebrow text-muted">{literal("Active title")}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                      placeholder={literal("Conversation title")}
                      value={conversationTitleDraft}
                      onChange={(event) => setConversationTitleDraft(event.target.value)}
                    />
                    <button
                      className="ui-button ui-button-secondary px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        isSavingConversation
                        || !conversationTitleDraft.trim()
                        || conversationTitleDraft.trim() === conversationTitle
                      }
                      type="button"
                      onClick={() => {
                        void renameActiveConversationTitle();
                      }}
                    >
                      {isSavingConversation ? t("saving") : literal("Save title")}
                    </button>
                    <button
                      className="ui-button ui-button-secondary px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSavingConversation}
                      type="button"
                      onClick={() => {
                        void setConversationArchived(activeConversationId, !activeConversationIsArchived);
                      }}
                    >
                      {activeConversationIsArchived ? literal("Restore chat") : literal("Archive chat")}
                    </button>
                  </div>
                  {activeConversationIsArchived ? (
                    <p className="mt-2 text-xs leading-6 text-muted">
                      {literal("This conversation is archived and stays out of the main rail until restored.")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3 overflow-y-auto pr-1 max-h-52 sm:max-h-64 lg:max-h-none">
            {currentUser ? (
              visibleConversations.length > 0 ? (
                <div className="space-y-4">
                  {pinnedVisibleConversations.length > 0 ? (
                    <div className="space-y-3">
                      {!showPinnedOnly ? (
                        <div className="flex items-center gap-2 px-1">
                          <p className="section-label text-xs font-semibold">{literal("Pinned")}</p>
                          <span className="text-xs text-muted">{pinnedVisibleConversations.length}</span>
                        </div>
                      ) : null}
                      {pinnedVisibleConversations.map((conversation) => {
                        const isActive = conversation.id === activeConversationId;
                        const recencyBadge = getConversationRecencyBadge(conversation.updatedAt, literal);
                        const activityBadge = getConversationActivityBadge({
                          conversationId: conversation.id,
                          isActive,
                          isStreaming,
                          recentlyUpdatedConversationId,
                        });

                        return (
                          <div
                            key={conversation.id}
                            className={`rounded-[24px] border px-4 py-4 ${
                              isActive
                                ? "border-[var(--accent)] bg-white"
                                : "border-line bg-white/55"
                            }`}
                          >
                            <button
                              className="w-full text-left"
                              disabled={isLoadingConversation}
                              type="button"
                              onClick={() => openConversation(conversation.id)}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                  {literal("Pinned")}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isActive
                                    ? "bg-[var(--accent)] text-white"
                                    : conversation.messageCount === 0
                                      ? "bg-stone-200 text-stone-900"
                                      : "bg-white text-foreground"
                                }`}>
                                  {isActive
                                    ? literal("Active")
                                    : conversation.messageCount === 0
                                      ? literal("Empty")
                                      : literal("Saved")}
                                </span>
                                {recencyBadge ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${recencyBadge.classes}`}>
                                    {recencyBadge.label}
                                  </span>
                                ) : null}
                                {activityBadge ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activityBadge.classes}`}>
                                    {activityBadge.label}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                {conversation.title}
                              </p>
                              <p className="mt-2 text-xs leading-6 text-muted">
                                {conversation.lastMessagePreview || literal("No messages yet.")}
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                {literal("{count} messages", { count: conversation.messageCount })} · {formatTimestamp(conversation.updatedAt)}
                              </p>
                            </button>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => togglePinnedConversation(conversation.id)}
                              >
                                {literal("Unpin")}
                              </button>
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => {
                                  void setConversationArchived(conversation.id, true);
                                }}
                              >
                                {literal("Archive")}
                              </button>
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => deleteConversationRecord(conversation.id)}
                              >
                                {literal("Delete")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {recentVisibleConversations.length > 0 ? (
                    <div className="space-y-3">
                      {!showPinnedOnly ? (
                        <div className="flex items-center gap-2 px-1">
                          <p className="section-label text-xs font-semibold">{literal("Recent")}</p>
                          <span className="text-xs text-muted">{recentVisibleConversations.length}</span>
                        </div>
                      ) : null}
                      {recentConversationGroups.map((group) => (
                        <div key={group.label} className="space-y-3">
                          <div className="flex items-center gap-2 px-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                              {group.label}
                            </p>
                            <span className="text-xs text-muted">{group.conversations.length}</span>
                          </div>
                          {group.conversations.map((conversation) => {
                            const isActive = conversation.id === activeConversationId;
                            const recencyBadge = getConversationRecencyBadge(conversation.updatedAt, literal);
                            const activityBadge = getConversationActivityBadge({
                              conversationId: conversation.id,
                              isActive,
                              isStreaming,
                              recentlyUpdatedConversationId,
                            });

                            return (
                              <div
                                key={conversation.id}
                                className={`rounded-[24px] border px-4 py-4 ${
                                  isActive
                                    ? "border-[var(--accent)] bg-white"
                                    : "border-line bg-white/55"
                                }`}
                              >
                                <button
                                  className="w-full text-left"
                                  disabled={isLoadingConversation}
                                  type="button"
                                  onClick={() => openConversation(conversation.id)}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      isActive
                                        ? "bg-[var(--accent)] text-white"
                                        : conversation.messageCount === 0
                                          ? "bg-stone-200 text-stone-900"
                                          : "bg-white text-foreground"
                                    }`}>
                                      {isActive
                                        ? literal("Active")
                                        : conversation.messageCount === 0
                                          ? literal("Empty")
                                          : literal("Saved")}
                                    </span>
                                    {recencyBadge ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${recencyBadge.classes}`}>
                                        {recencyBadge.label}
                                      </span>
                                    ) : null}
                                    {activityBadge ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activityBadge.classes}`}>
                                        {activityBadge.label}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {conversation.title}
                                  </p>
                                  <p className="mt-2 text-xs leading-6 text-muted">
                                    {conversation.lastMessagePreview || literal("No messages yet.")}
                                  </p>
                                  <p className="mt-2 text-xs text-muted">
                                    {literal("{count} messages", { count: conversation.messageCount })} · {formatTimestamp(conversation.updatedAt)}
                                  </p>
                                </button>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => togglePinnedConversation(conversation.id)}
                                  >
                                    {literal("Pin")}
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => {
                                      void setConversationArchived(conversation.id, true);
                                    }}
                                  >
                                    {literal("Archive")}
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => deleteConversationRecord(conversation.id)}
                                  >
                                    {literal("Delete")}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {showArchivedConversations && archivedConversationCount > 0 ? (
                    <div className="space-y-3">
                      <div className="space-y-2 px-1">
                        <div className="flex items-center gap-2">
                          <p className="section-label text-xs font-semibold">{literal("Archived")}</p>
                          <span className="text-xs text-muted">{archivedConversationCount}</span>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
                            {literal("Empty {count}", { count: archivedEmptyConversationCount })}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
                            {literal("{days}d+ {count}", { days: archivedRetentionDays, count: archivedOlderConversationCount })}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">{literal("Retention")}</span>
                          {ARCHIVED_RETENTION_OPTIONS.map((value) => (
                            <button
                              key={value}
                              aria-label={literal("Set archived retention filter to {days} days", { days: value })}
                              aria-pressed={archivedRetentionDays === value}
                              className={`rounded-full px-3 py-1 font-semibold ${
                                archivedRetentionDays === value
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-line bg-white text-foreground"
                              }`}
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setArchivedRetentionDays(value)}
                            >
                              {literal("{days} days", { days: value })}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">{literal("Filter")}</span>
                          {([
                            ["all", literal("All {count}", { count: archivedConversationCount })],
                            ["empty", literal("Empty {count}", { count: archivedEmptyConversationCount })],
                            ["old", literal("{days}d+ {count}", { days: archivedRetentionDays, count: archivedOlderConversationCount })],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              aria-label={literal("Show {label} archived chats", { label: label.toLowerCase() })}
                              aria-pressed={archivedConversationFilter === value}
                              className={`rounded-full px-3 py-1 font-semibold ${
                                archivedConversationFilter === value
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-line bg-white text-foreground"
                              }`}
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setArchivedConversationFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">{literal("Sort")}</span>
                          {([
                            ["archived-newest", literal("Newest archived")],
                            ["archived-oldest", literal("Oldest archived")],
                            ["recent-activity", literal("Recent activity")],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              aria-label={literal("Sort archived chats by {label}", { label: label.toLowerCase() })}
                              aria-pressed={archivedConversationSort === value}
                              className={`rounded-full px-3 py-1 font-semibold ${
                                archivedConversationSort === value
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-line bg-white text-foreground"
                              }`}
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setArchivedConversationSort(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">{literal("Selection")}</span>
                          <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                            {literal("{count} selected", { count: selectedArchivedVisibleConversationIds.length })}
                          </span>
                          <button
                            aria-label={selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length
                              ? literal("Clear selection for all visible archived chats")
                              : literal("Select all visible archived chats")}
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length}
                            className="ui-button ui-button-secondary px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleConversations.length === 0}
                            type="button"
                            onClick={toggleSelectAllArchivedVisible}
                          >
                            {selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length
                              ? literal("Clear visible selection")
                              : literal("Select visible")}
                          </button>
                          {selectedArchivedVisibleConversationIds.length > 0 ? (
                            <button
                              aria-label={literal("Clear the current archived selection")}
                              className="ui-button ui-button-secondary px-3 py-1 font-semibold"
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setSelectedArchivedConversationIds([])}
                            >
                              {literal("Clear selection")}
                            </button>
                          ) : null}
                          <button
                            aria-label={literal("Select visible archived chats with no messages")}
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleEmptyConversationIds.length && archivedVisibleEmptyConversationIds.every((id) => selectedArchivedVisibleConversationIdSet.has(id))}
                            className="ui-button ui-button-secondary px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleEmptyConversationIds.length === 0}
                            type="button"
                            onClick={() => replaceArchivedSelection(archivedVisibleEmptyConversationIds)}
                          >
                            {literal("Select empty")}
                          </button>
                          <button
                            aria-label={literal("Select visible archived chats at least {days} days old", { days: archivedRetentionDays })}
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleOlderConversationIds.length && archivedVisibleOlderConversationIds.every((id) => selectedArchivedVisibleConversationIdSet.has(id))}
                            className="ui-button ui-button-secondary px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleOlderConversationIds.length === 0}
                            type="button"
                            onClick={() => replaceArchivedSelection(archivedVisibleOlderConversationIds)}
                          >
                            {literal("Select {days}d+", { days: archivedRetentionDays })}
                          </button>
                        </div>
                        <p aria-live="polite" className="text-xs leading-6 text-muted">{archivedSummaryText}</p>
                        <p className="text-xs leading-6 text-muted">
                          Keyboard: use Up and Down to move, Space to select, Enter to open, A to toggle all visible, E to select empty, O to select {archivedRetentionDays}d+, and Escape to clear selection.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            aria-label={`${confirmArchivedCleanupAction === "restore-archived-visible" ? "Confirm" : "Restore"} ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived chats`}
                            aria-pressed={confirmArchivedCleanupAction === "restore-archived-visible"}
                            className={`rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              confirmArchivedCleanupAction === "restore-archived-visible"
                                ? "border border-emerald-700 bg-emerald-600 text-white"
                                : "border border-emerald-300 bg-emerald-50 text-emerald-900"
                            }`}
                            disabled={isRunningArchivedCleanup || archivedActionConversations.length === 0}
                            type="button"
                            onClick={() => {
                              if (confirmArchivedCleanupAction !== "restore-archived-visible") {
                                setConfirmArchivedCleanupAction("restore-archived-visible");
                                return;
                              }

                              void runArchivedRestore();
                            }}
                          >
                            {confirmArchivedCleanupAction === "restore-archived-visible"
                              ? `Confirm restore ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived`
                              : isRunningArchivedCleanup
                                ? "Working..."
                                : `Restore ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived`}
                          </button>
                          <button
                            aria-label={`${confirmArchivedCleanupAction === "delete-archived-empty" ? "Confirm deleting" : "Delete"} ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} empty archived chats`}
                            aria-pressed={confirmArchivedCleanupAction === "delete-archived-empty"}
                            className={`rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              confirmArchivedCleanupAction === "delete-archived-empty"
                                ? "border border-amber-700 bg-amber-600 text-white"
                                : "border border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                            disabled={isRunningArchivedCleanup || archivedActionEmptyConversationCount === 0}
                            type="button"
                            onClick={() => {
                              if (confirmArchivedCleanupAction !== "delete-archived-empty") {
                                setConfirmArchivedCleanupAction("delete-archived-empty");
                                return;
                              }

                              void runArchivedCleanup("delete-archived-empty");
                            }}
                          >
                            {confirmArchivedCleanupAction === "delete-archived-empty"
                              ? `Confirm delete ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} empty archived`
                              : isRunningArchivedCleanup
                                ? "Cleaning..."
                                : `Delete ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} empty archived`}
                          </button>
                          <button
                            aria-label={`${confirmArchivedCleanupAction === "delete-archived-older-than" ? "Confirm deleting" : "Delete"} ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived chats at least ${archivedRetentionDays} days old`}
                            aria-pressed={confirmArchivedCleanupAction === "delete-archived-older-than"}
                            className={`rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              confirmArchivedCleanupAction === "delete-archived-older-than"
                                ? "border border-amber-700 bg-amber-600 text-white"
                                : "border border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                            disabled={isRunningArchivedCleanup || archivedActionOlderConversationCount === 0}
                            type="button"
                            onClick={() => {
                              if (confirmArchivedCleanupAction !== "delete-archived-older-than") {
                                setConfirmArchivedCleanupAction("delete-archived-older-than");
                                return;
                              }

                              void runArchivedCleanup("delete-archived-older-than");
                            }}
                          >
                            {confirmArchivedCleanupAction === "delete-archived-older-than"
                              ? `Confirm delete ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived ${archivedRetentionDays}d+`
                              : isRunningArchivedCleanup
                                ? "Cleaning..."
                                : `Delete ${selectedArchivedVisibleConversationIds.length > 0 ? "selected" : "visible"} archived ${archivedRetentionDays}d+`}
                          </button>
                          {confirmArchivedCleanupAction ? (
                            <button
                              aria-label={literal("Clear the pending archive bulk action confirmation")}
                              className="ui-button ui-button-secondary px-3 py-1 text-xs font-semibold"
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setConfirmArchivedCleanupAction(null)}
                            >
                              Clear confirm
                            </button>
                          ) : null}
                        </div>
                        {archivedCleanupSummary ? (
                          <p aria-live="polite" className="text-xs leading-6 text-muted">{archivedCleanupSummary}</p>
                        ) : null}
                      </div>
                      {archivedVisibleConversations.length > 0 ? (
                        <div
                          aria-label={literal("Archived conversations")}
                          aria-multiselectable="true"
                          role="listbox"
                          className="space-y-3"
                        >
                          {archivedVisibleConversations.map((conversation) => {
                            const isActive = conversation.id === activeConversationId;
                            const recencyBadge = getConversationRecencyBadge(conversation.updatedAt, literal);
                            const archivedMetaBadges = getArchivedConversationMetaBadges(conversation, literal);
                            const isSelected = selectedArchivedVisibleConversationIdSet.has(conversation.id);

                            return (
                              <div
                                key={conversation.id}
                                ref={(node) => {
                                  archivedConversationItemRefs.current[conversation.id] = node;
                                }}
                                aria-label={literal("{title}. {count} messages.", {
                                  title: conversation.title,
                                  count: conversation.messageCount,
                                })}
                                aria-selected={isSelected}
                                className={`rounded-[24px] border px-4 py-4 ${
                                  isSelected
                                    ? "border-sky-400 bg-sky-50/70"
                                    : isActive
                                      ? "border-[var(--accent)] bg-white"
                                      : "border-line bg-white/45"
                                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
                                role="option"
                                tabIndex={0}
                                onKeyDown={(event) => handleArchivedConversationKeyDown(event, conversation.id)}
                              >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <button
                                    aria-pressed={isSelected}
                                    aria-label={literal("{action} archived conversation {title}", {
                                      action: isSelected ? literal("Deselect") : literal("Select"),
                                      title: conversation.title,
                                    })}
                                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                      isSelected
                                        ? "bg-sky-600 text-white"
                                        : "border border-line bg-white text-foreground"
                                    }`}
                                    disabled={isRunningArchivedCleanup}
                                    type="button"
                                    onClick={() => toggleArchivedConversationSelection(conversation.id)}
                                  >
                                    {isSelected ? literal("Selected") : literal("Select")}
                                  </button>
                                  {isActive ? (
                                    <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white">
                                      {literal("Active")}
                                    </span>
                                  ) : null}
                                </div>
                                <button
                                  className="w-full text-left"
                                  disabled={isLoadingConversation}
                                  type="button"
                                  onClick={() => openConversation(conversation.id)}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-900">
                                      {literal("Archived")}
                                    </span>
                                    {archivedMetaBadges.map((badge) => (
                                      <span
                                        key={badge.label}
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}
                                      >
                                        {badge.label}
                                      </span>
                                    ))}
                                    {recencyBadge ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${recencyBadge.classes}`}>
                                        {recencyBadge.label}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {conversation.title}
                                  </p>
                                  <p className="mt-2 text-xs leading-6 text-muted">
                                    {conversation.lastMessagePreview || literal("No messages yet.")}
                                  </p>
                                  <p className="mt-2 text-xs text-muted">
                                    {literal("{count} messages", { count: conversation.messageCount })} · {formatTimestamp(conversation.updatedAt)}
                                  </p>
                                </button>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => {
                                      void setConversationArchived(conversation.id, false);
                                    }}
                                  >
                                    {literal("Restore")}
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => deleteConversationRecord(conversation.id)}
                                  >
                                    {literal("Delete")}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-line bg-white/35 px-4 py-3 text-sm text-muted">
                          No archived conversations match the current search.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  {conversations.length > 0 && (normalizedConversationSearch || showPinnedOnly || showArchivedConversations)
                    ? showPinnedOnly && !normalizedConversationSearch
                      ? "No pinned conversations are available in the current view."
                      : normalizedConversationSearch && archivedVisibleConversations.length > 0 && !showArchivedConversations
                        ? "Matching conversations were found in the archive. Show archived to view them."
                        : "No saved conversations match the current search."
                    : literal("No saved conversations yet.")}
                </div>
              )
            ) : (
              <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                {literal("Sign in with a local user account to load and save your own conversation history.")}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="theme-surface-panel mt-3 rounded-[24px] px-4 py-3">
          {currentUser ? (
            <div className="flex flex-wrap items-center gap-2">
              {collapsedSavedChatPreview.length > 0 ? (
                collapsedSavedChatPreview.map((conversation) => (
                  <button
                    key={conversation.id}
                    className="max-w-full rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-foreground"
                    disabled={isLoadingConversation}
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                  >
                    <span className="block max-w-[15rem] truncate">{conversation.title}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted">{literal("No saved chats yet.")}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">{literal("Sign in to scan recent saved chats here.")}</p>
          )}
        </div>
      )}
    </div>
  );

  const chatStage = (
    <div className="theme-surface-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-line/80 p-4 sm:p-5 lg:px-6 xl:px-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-b-[40px] bg-[radial-gradient(circle_at_top,rgba(213,122,66,0.12),transparent_70%)]" />
      <div className="theme-surface-panel relative mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3">
        <div>
          <p className="eyebrow text-muted">{literal("Transcript stage")}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{transcriptSummary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasCallableTalkToOptions ? (
            <label className="theme-surface-chip flex items-center gap-2 rounded-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${providerId === "ollama" ? "bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.55)]" : "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.45)]"}`} />
              <span className="text-muted">{literal("Talk to")}</span>
              <select
                aria-label={literal("Select the AI for this chat")}
                className="min-w-[10rem] bg-transparent text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground outline-none"
                disabled={isStreaming || isLoadingTalkToOptions}
                value={buildTalkToOptionKey(providerId, selectedModel)}
                onChange={(event) => {
                  const nextOption = talkToOptions.find((option) => option.key === event.target.value);

                  if (!nextOption) {
                    return;
                  }

                  setProviderId(nextOption.providerId);
                  setSelectedModel(nextOption.model);
                  setSelectedAssistantProfileId("");
                }}
              >
                {talkToOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-800 transition hover:border-rose-300 hover:bg-rose-100"
              type="button"
              onClick={() => {
                void handleTalkToEmptyAction();
              }}
            >
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.55)]" />
              {localAiStatusLabel}
            </button>
          )}
          <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
            {lastLatency ? `${lastLatency} ms` : literal("Awaiting first reply")}
          </span>
          <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
            {groundingStatusLabel}
          </span>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="theme-surface-transcript min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-line/50 px-3 py-3 pr-2 sm:px-4 sm:py-4"
      >
        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";

          return (
            <article
              key={`${message.role}-${index}-${message.content.length}`}
              className={`rounded-[28px] border px-4 py-4 shadow-[0_14px_34px_rgba(83,53,31,0.08)] sm:px-5 ${
                isAssistant
                  ? "theme-surface-strong border-line/70 text-foreground"
                  : "border-[color:color-mix(in_srgb,var(--accent-strong)_44%,white_18%)] bg-[linear-gradient(180deg,#d57a42_0%,var(--accent)_55%,var(--accent-strong)_100%)] text-white"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <p
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    isAssistant ? "bg-stone-100 text-muted" : "bg-white/14 text-white/80"
                  }`}
                >
                  {isAssistant ? t("assistant") : t("operator")}
                </p>
                {isStreaming && isAssistant && index === messages.length - 1 ? (
                  <span className={`text-xs font-medium ${isAssistant ? "text-muted" : "text-white/80"}`}>
                    {t("streaming")}
                  </span>
                ) : null}
              </div>
              <p className={`mt-3 whitespace-pre-wrap ${
                isAssistant
                  ? "text-[15px] leading-8 sm:text-[16px]"
                  : "text-[14px] font-medium leading-7 sm:text-[15px]"
              }`}>
                {message.content || t("waitingForModelOutput")}
              </p>
              {isAssistant && message.knowledgeCitations && message.knowledgeCitations.length > 0 ? (
                <details className="mt-4 rounded-[22px] border border-line/70 bg-white/70 px-4 py-3 text-sm text-foreground">
                  <summary className="cursor-pointer list-none font-semibold text-foreground">
                    {literal("Sources ({count})", { count: message.knowledgeCitations.length })}
                  </summary>
                  <div className="mt-3 space-y-3">
                    {message.knowledgeCitations.map((citation) => (
                      <div key={`${citation.id}-${citation.title}`} className="rounded-[18px] border border-line bg-[var(--panel)]/70 px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{citation.title}</p>
                            <p className="mt-1 text-xs text-muted">
                              {literal("{source} · relevance {score}", {
                                source: citation.source,
                                score: citation.score.toFixed(2),
                              })}
                            </p>
                          </div>
                          {citation.tags.length > 0 ? (
                            <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                              {citation.tags[0]}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-6 text-muted">{citation.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      <form ref={composerFormRef} data-tour-id="chat-composer" className="theme-surface-panel mt-4 overflow-hidden rounded-[32px] border border-line/80 px-4 py-4 shadow-[0_20px_54px_rgba(83,53,31,0.1)] sm:px-5 sm:py-5" onSubmit={handleSubmit}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              {selectedModel || t("noModelSelected")}
            </span>
            <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              {formatProfileProviderLabel(providerId, literal)}
            </span>
            <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              {assistantStyleBadgeLabel}
            </span>
          </div>
        </div>
        <textarea
          ref={draftInputRef}
          className="min-h-36 w-full rounded-[30px] border border-line bg-white px-4 py-4 text-sm leading-7 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none sm:px-5 sm:py-5 lg:min-h-40"
          placeholder={t("typeYourMessage")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
        />
        {error ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-line bg-white">
            <label className="flex items-center gap-2 px-4 py-3 text-sm text-foreground">
              <span className="font-medium">{t("voice")}</span>
              <VoiceLanguageSelect
                ariaLabel={t("voiceTranscription")}
                buttonClassName="flex items-center gap-2 bg-transparent text-left"
                disabled={isVoiceCapturing || isVoiceTranscribing || isStreaming}
                flagClassName="h-4 w-6 shrink-0 rounded-[3px]"
                listClassName="theme-surface-elevated absolute left-0 z-20 mt-3 min-w-[14rem] overflow-hidden rounded-[24px] p-2 backdrop-blur-xl"
                optionClassName={(isSelected) => `flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left ${isSelected ? "bg-[rgba(188,95,61,0.12)]" : "hover:bg-black/5"}`}
                value={voiceTranscriptionLanguage}
                onChange={(language) => {
                  setVoiceTranscriptionLanguage(language);
                  onUiLanguagePreferenceChange?.(language);

                  if (!currentUser) {
                    return;
                  }

                  void updatePreferredVoiceLanguage(currentUser, language).catch((voicePreferenceError) => {
                    setError(
                      voicePreferenceError instanceof Error
                        ? voicePreferenceError.message
                        : t("unableSaveVoicePreference"),
                    );
                  });
                }}
              />
            </label>
            </div>
            <button
              aria-label={isVoiceCapturing ? t("recordingRelease") : t("holdToTalk")}
              className={`ui-button px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                isVoiceCapturing
                  ? "bg-[color:color-mix(in_srgb,var(--accent)_78%,#7a1b12_22%)] text-white"
                  : "ui-button-secondary"
              }`}
              disabled={!isVoiceCaptureAvailable || isStreaming || isVoiceTranscribing}
              type="button"
              onKeyDown={handleVoiceCaptureKeyDown}
              onKeyUp={handleVoiceCaptureKeyUp}
              onPointerCancel={handleVoiceCapturePointerCancel}
              onPointerDown={handleVoiceCapturePointerDown}
              onPointerUp={handleVoiceCapturePointerUp}
            >
              {isVoiceCapturing
                ? t("recordingRelease")
                : isVoiceTranscribing
                  ? t("transcribing")
                  : t("holdToTalk")}
            </button>
            <button
              className="ui-button ui-button-primary px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!draft.trim() || !selectedModel || isStreaming}
              type="submit"
            >
              {isStreaming ? t("sending") : t("send")}
            </button>
            <button
              className="ui-button ui-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isStreaming}
              type="button"
              onClick={stopStreaming}
            >
              {t("stop")}
            </button>
            <button
              className="ui-button ui-button-secondary px-5 py-3 text-sm font-semibold"
              type="button"
              onClick={clearConversation}
            >
              {t("clear")}
            </button>
          </div>
          <p className="text-xs leading-6 text-muted">
            {isVoiceCaptureAvailable
              ? isVoiceCapturing
                ? t("audioWhileHeld")
                : isVoiceTranscribing
                  ? t("localWhisperMode", { language: VOICE_LANGUAGE_META[voiceTranscriptionLanguage].label.toLowerCase() })
                  : t("holdToRecord")
              : t("pushToTalkNeedsSupport")}
          </p>
        </div>
        <div data-tour-id="chat-controls" className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow text-muted">{literal("Assistant profile")}</p>
                <p className="mt-1 text-sm text-muted">
                  {selectedAssistantProfile
                    ? literal("{name} targets {provider} using {model}.", {
                      name: selectedAssistantProfile.name,
                      provider: formatProfileProviderLabel(selectedAssistantProfile.providerId, literal),
                      model: selectedAssistantProfile.model,
                    })
                    : literal("Choose a saved specialist behavior or keep the base workspace defaults.")}
                </p>
              </div>
              <span className="theme-surface-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
                {selectedAssistantProfile ? literal("Profile active") : literal("Base workspace")}
              </span>
            </div>
            <select
              aria-label={literal("Select an assistant profile")}
              className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              disabled={isStreaming || isLoadingAssistantProfiles}
              value={selectedAssistantProfileId}
              onChange={(event) => applyAssistantProfile(event.target.value)}
            >
              <option value="">{literal("Base workspace")}</option>
              {assistantProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow text-muted">{literal("Grounding")}</p>
                <p className="mt-1 text-sm text-muted">
                  {literal("Control whether replies pull from shared knowledge and how strongly that context should constrain the answer.")}
                </p>
              </div>
              <button
                className={`ui-button px-3 py-1 text-xs font-semibold ${
                  useKnowledge ? "ui-button-primary" : "ui-button-secondary"
                }`}
                disabled={isStreaming}
                type="button"
                onClick={() => {
                  setUseKnowledge((current) => {
                    const nextValue = !current;
                    setGroundingMode(nextValue ? (groundingMode === "off" ? "balanced" : groundingMode) : "off");
                    setSelectedAssistantProfileId("");
                    return nextValue;
                  });
                }}
              >
                {useKnowledge ? literal("Knowledge on") : literal("Knowledge off")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["balanced", literal("Balanced")],
                ["strict", literal("Strict")],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  aria-pressed={useKnowledge && groundingMode === mode}
                  className={`ui-button px-3 py-2 text-xs font-semibold ${
                    useKnowledge && groundingMode === mode
                      ? "ui-button-primary"
                      : "ui-button-secondary"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  disabled={!useKnowledge || isStreaming}
                  type="button"
                  onClick={() => {
                    setUseKnowledge(true);
                    setGroundingMode(mode);
                    setSelectedAssistantProfileId("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className={`ui-button px-4 py-2 text-xs font-semibold ${
                showPromptPresets
                  ? "ui-button-primary"
                  : "ui-button-secondary"
              }`}
              type="button"
              onClick={() => setShowPromptPresets((current) => !current)}
            >
              {showPromptPresets ? t("hideIdeas") : t("showIdeas")}
            </button>
          </div>
          {showPromptPresets ? (
            <div className="flex flex-wrap gap-2">
              {localizedPromptPresets.map((preset) => (
                <button
                  key={preset.label}
                  className="ui-button ui-button-secondary px-3 py-2 text-xs font-semibold"
                  type="button"
                  onClick={() => applyPromptPreset(preset.prompt)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );

  return (
    <section data-tour-id="chat-shell" className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-[36px] p-3 sm:p-5 lg:h-auto lg:overflow-visible lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t("chat")}
          </h2>
          {activeConversationIsArchived ? (
            <p className="mt-2 max-w-2xl text-xs leading-6 text-muted sm:text-sm">
              This chat is archived until you restore it.
            </p>
          ) : null}
        </div>

        <div className="ui-control-band -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-4 sm:py-4">
          <div className="ui-pill ui-pill-label px-4 py-2 text-sm font-medium">
            {conversationTitle}
          </div>
          <div className="ui-pill ui-pill-label px-4 py-2 text-sm font-medium">
            {selectedModel || t("noModelSelected")}
          </div>
          {activeConversationIsArchived ? (
            <div className="ui-pill ui-pill-neutral px-4 py-2 text-sm font-semibold">
              {t("archive")}
            </div>
          ) : null}
          <div
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              isReachable
                ? "bg-emerald-100 text-emerald-900"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {isReachable ? t("gatewayOnline") : t("gatewayOffline")}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 lg:flex-none lg:items-center">
        <div className="order-1 min-h-0 flex-1 lg:w-full lg:max-w-[98rem] lg:flex-none xl:max-w-[104rem]">
          {chatStage}
        </div>

        <div className="order-2 lg:block lg:w-full lg:max-w-[92rem] xl:max-w-[96rem] lg:flex-none">
          {savedChatsPanel}
        </div>
      </div>
      {talkToDialogMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.52)] px-4 py-6 backdrop-blur-sm">
          <div className="theme-surface-elevated w-full max-w-[30rem] rounded-[34px] border border-line/80 p-3 shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
            <div className="glass-panel rounded-[28px] p-6 sm:p-7">
              <p className="section-label text-xs font-semibold">{literal("Model availability")}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                {literal("No model is ready")}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted">{talkToDialogMessage}</p>
              <div className="mt-6 flex justify-end">
                <button
                  className="ui-button ui-button-primary min-h-[3.25rem] justify-center px-5 py-3 text-sm"
                  type="button"
                  onClick={() => setTalkToDialogMessage(null)}
                >
                  {literal("Dismiss")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatProfileProviderLabel(
  providerId: AiWorkspaceProfile["providerId"],
  literal: (text: string, variables?: Record<string, string | number>) => string,
) {
  if (providerId === "anthropic") {
    return literal("Anthropic");
  }

  if (providerId === "openai") {
    return literal("OpenAI");
  }

  return literal("Ollama");
}