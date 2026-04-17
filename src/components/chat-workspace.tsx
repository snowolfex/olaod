"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";
import type { OllamaChatMessage, OllamaModel } from "@/lib/ollama";
import { DEFAULT_USER_SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { SessionUser } from "@/lib/user-types";

type ChatWorkspaceProps = {
  currentUser: SessionUser | null;
  isReachable: boolean;
  initialConversation: StoredConversation | null;
  initialConversations: ConversationSummary[];
  models: OllamaModel[];
};

type PersistedConversationResponse = {
  conversation: StoredConversation;
  summary: ConversationSummary;
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

const CHAT_WORKSPACE_SIDEBAR_STORAGE_KEY = "oload:chat:workspace-sidebar";
const CHAT_DESKTOP_LAYOUT_STORAGE_KEY = "oload:chat:desktop-layout";
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
type DesktopChatLayoutMode = "chat-first" | "controls-first";

function getWorkspaceSidebarStorageKey(userId?: string) {
  return `${CHAT_WORKSPACE_SIDEBAR_STORAGE_KEY}:${userId ?? "guest"}`;
}

function getDesktopLayoutStorageKey(userId?: string) {
  return `${CHAT_DESKTOP_LAYOUT_STORAGE_KEY}:${userId ?? "guest"}`;
}

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

function parseWorkspaceSidebarPreference(value: string | null) {
  if (!value) {
    return true;
  }

  return value === "true";
}

function parseDesktopLayoutPreference(value: string | null): DesktopChatLayoutMode {
  return value === "controls-first" ? "controls-first" : "chat-first";
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

function formatBytes(value: number) {
  if (!value) {
    return "0 GB";
  }

  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function buildConversationTitle(messages: OllamaChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return (firstUserMessage?.content.trim() || "New conversation").slice(0, 48);
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

function getArchivedConversationMetaBadges(conversation: ConversationSummary) {
  const archivedLabel = conversation.archivedAt
    ? formatRelativeDateLabel(conversation.archivedAt)
    : null;
  const lastActivityLabel = formatRelativeDateLabel(conversation.updatedAt);

  return [
    archivedLabel
      ? {
        label: `Archived ${archivedLabel}`,
        classes: "bg-stone-200 text-stone-900",
      }
      : null,
    lastActivityLabel
      ? {
        label: `Last active ${lastActivityLabel}`,
        classes: "bg-sky-100 text-sky-900",
      }
      : null,
  ].filter((badge): badge is { label: string; classes: string } => Boolean(badge));
}

function getArchivedFilterSummaryLabel(
  archivedConversationFilter: ArchivedConversationFilter,
  archivedRetentionDays: number,
) {
  if (archivedConversationFilter === "empty") {
    return "empty archived chats";
  }

  if (archivedConversationFilter === "old") {
    return `archived chats at least ${archivedRetentionDays} days old`;
  }

  return "all archived chats";
}

function getArchivedSortSummaryLabel(archivedConversationSort: ArchivedConversationSort) {
  if (archivedConversationSort === "archived-oldest") {
    return "oldest archived first";
  }

  if (archivedConversationSort === "recent-activity") {
    return "recent activity first";
  }

  return "newest archived first";
}

function getConversationRecencyBadge(updatedAt: string) {
  const updatedAtMs = new Date(updatedAt).getTime();

  if (Number.isNaN(updatedAtMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, Date.now() - updatedAtMs);

  if (elapsedMs <= 5 * 60_000) {
    return {
      label: "Just updated",
      classes: "bg-emerald-100 text-emerald-900",
    };
  }

  if (elapsedMs <= 30 * 60_000) {
    return {
      label: "Updated recently",
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

function DesktopLayoutSwapIcon({ reversed }: { reversed: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y={reversed ? "11.5" : "2.5"} width="15" height="4" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5" y={reversed ? "4.5" : "13.5"} width="10" height="2.8" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d={reversed ? "M16 8.25H7.75M7.75 8.25L10.25 10.75M7.75 8.25L10.25 5.75" : "M4 11.75H12.25M12.25 11.75L9.75 14.25M12.25 11.75L9.75 9.25"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SparkGridIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="3" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="7" width="5" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ChatWorkspace({
  currentUser,
  isReachable,
  initialConversation,
  initialConversations,
  models,
}: ChatWorkspaceProps) {
  const workspaceSidebarStorageKey = getWorkspaceSidebarStorageKey(currentUser?.id);
  const desktopLayoutStorageKey = getDesktopLayoutStorageKey(currentUser?.id);
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
    initialConversation?.title ?? "New conversation",
  );
  const [messages, setMessages] = useState<OllamaChatMessage[]>(
    initialConversation?.messages ?? [],
  );
  const [draft, setDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationTitleDraft, setConversationTitleDraft] = useState(
    initialConversation?.title ?? "New conversation",
  );
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showArchivedConversations, setShowArchivedConversations] = useState(false);
  const [archivedRetentionDays, setArchivedRetentionDays] = useState<number>(ARCHIVED_RETENTION_DAYS);
  const [archivedConversationFilter, setArchivedConversationFilter] = useState<ArchivedConversationFilter>("all");
  const [archivedConversationSort, setArchivedConversationSort] = useState<ArchivedConversationSort>("archived-newest");
  const [selectedArchivedConversationIds, setSelectedArchivedConversationIds] = useState<string[]>([]);
  const [showWorkspaceSidebar, setShowWorkspaceSidebar] = useState(true);
  const [loadedWorkspaceSidebarKey, setLoadedWorkspaceSidebarKey] = useState<string | null>(null);
  const [desktopLayoutMode, setDesktopLayoutMode] = useState<DesktopChatLayoutMode>("chat-first");
  const [loadedDesktopLayoutKey, setLoadedDesktopLayoutKey] = useState<string | null>(null);
  const [showSavedChatsPanel, setShowSavedChatsPanel] = useState(true);
  const [showModelControlsPanel, setShowModelControlsPanel] = useState(true);
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
  const [selectedModel, setSelectedModel] = useState(
    initialConversation?.settings.model || models[0]?.name || "",
  );
  const [temperature, setTemperature] = useState(
    initialConversation?.settings.temperature ?? 0.7,
  );
  const [systemPrompt, setSystemPrompt] = useState(
    initialConversation?.settings.systemPrompt ||
      currentUser?.preferredSystemPrompt ||
      DEFAULT_USER_SYSTEM_PROMPT,
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
  const saveTimeoutRef = useRef<number | null>(null);
  const recentlyUpdatedConversationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedModel && models[0]?.name) {
      setSelectedModel(models[0].name);
      return;
    }

    if (selectedModel && !models.some((model) => model.name === selectedModel)) {
      setSelectedModel(models[0]?.name ?? "");
    }
  }, [models, selectedModel]);

  useEffect(() => {
    if (activeConversationId || messages.length > 0) {
      return;
    }

    setSystemPrompt(currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
  }, [activeConversationId, currentUser?.preferredSystemPrompt, messages.length]);

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
      const storedValue = window.localStorage.getItem(workspaceSidebarStorageKey);
      setShowWorkspaceSidebar(parseWorkspaceSidebarPreference(storedValue));
    } catch {
      setShowWorkspaceSidebar(true);
    } finally {
      setLoadedWorkspaceSidebarKey(workspaceSidebarStorageKey);
    }
  }, [workspaceSidebarStorageKey]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(desktopLayoutStorageKey);
      setDesktopLayoutMode(parseDesktopLayoutPreference(storedValue));
    } catch {
      setDesktopLayoutMode("chat-first");
    } finally {
      setLoadedDesktopLayoutKey(desktopLayoutStorageKey);
    }
  }, [desktopLayoutStorageKey]);

  useEffect(() => {
    if (loadedWorkspaceSidebarKey !== workspaceSidebarStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(workspaceSidebarStorageKey, String(showWorkspaceSidebar));
    } catch {
      // Ignore storage failures and keep the in-memory rail state.
    }
  }, [loadedWorkspaceSidebarKey, showWorkspaceSidebar, workspaceSidebarStorageKey]);

  useEffect(() => {
    if (loadedDesktopLayoutKey !== desktopLayoutStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(desktopLayoutStorageKey, desktopLayoutMode);
    } catch {
      // Ignore storage failures and keep the in-memory layout state.
    }
  }, [desktopLayoutMode, desktopLayoutStorageKey, loadedDesktopLayoutKey]);

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
        title: buildConversationTitle(nextMessages),
        messages: nextMessages,
        settings: {
          model: selectedModel,
          systemPrompt,
          temperature,
        },
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

    const title = buildConversationTitle(nextMessages);
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
          settings: {
            model: selectedModel,
            systemPrompt,
            temperature,
          },
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
  }, [activeConversationId, isStreaming, selectedModel, systemPrompt, temperature]);

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
      setSelectedModel(conversation.settings.model || models[0]?.name || "");
      setSystemPrompt(conversation.settings.systemPrompt || currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
      setTemperature(conversation.settings.temperature);
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
          settings: {
            model: selectedModel,
            systemPrompt,
            temperature,
          },
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
    setConversationTitle("New conversation");
    setDraft("");
    setError(null);
    setLastLatency(null);
    setIsStreaming(false);
    setMessages([]);
    setSelectedModel(models[0]?.name ?? selectedModel);
    setSystemPrompt(currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
    setTemperature(0.7);
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
      setSelectedModel(payload.conversation.settings.model || models[0]?.name || "");
      setSystemPrompt(payload.conversation.settings.systemPrompt || currentUser?.preferredSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT);
      setTemperature(payload.conversation.settings.temperature);
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

      const response = await fetch("/api/ollama/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: nextConversation,
          temperature,
          systemPrompt,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await readErrorMessage(response));
      }

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
        },
      ], ensuredConversationId, { archived: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
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
          };

          return updated;
        });
      });

      await persistConversation([
        ...nextConversation,
        {
          role: "assistant",
          content: fallbackContent,
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

  function clearConversation() {
    abortControllerRef.current?.abort();
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
    ? `Showing ${archivedVisibleConversations.length} ${getArchivedFilterSummaryLabel(archivedConversationFilter, archivedRetentionDays)}, sorted ${getArchivedSortSummaryLabel(archivedConversationSort)}. ${selectedArchivedVisibleConversationIds.length} selected for bulk actions.`
    : `Showing ${archivedVisibleConversations.length} ${getArchivedFilterSummaryLabel(archivedConversationFilter, archivedRetentionDays)}, sorted ${getArchivedSortSummaryLabel(archivedConversationSort)}.`;
  const recentConversationGroups = ["Today", "Yesterday", "This week", "Older"]
    .map((label) => ({
      label,
      conversations: recentVisibleConversations.filter(
        (conversation) => getConversationDayBucketLabel(conversation.updatedAt) === label,
      ),
    }))
    .filter((group) => group.conversations.length > 0);
  const controlsFirst = desktopLayoutMode === "controls-first";
  const savedChatsSummary = currentUser
    ? `${visibleConversations.length} in view / ${pinnedConversationIds.length} pinned`
    : "Sign in to save and reopen chats";
  const modelControlsSummary = `${selectedModel || "No model"} / temp ${temperature.toFixed(1)}`;
  const hasLocalAiAvailable = isReachable && models.length > 0;
  const localAiStatusLabel = hasLocalAiAvailable ? "Local AI ready" : "No local AI";
  const accountSystemPrompt = currentUser?.preferredSystemPrompt?.trim() || DEFAULT_USER_SYSTEM_PROMPT;
  const collapsedSavedChatPreview = visibleConversations.slice(0, 3);
  const transcriptSummary = messages.length > 0
    ? `${messages.length} message${messages.length === 1 ? "" : "s"} in this thread`
    : "Fresh thread ready for the first prompt";
  const systemPromptPreview = systemPrompt.trim()
    ? `${systemPrompt.trim().slice(0, 120)}${systemPrompt.trim().length > 120 ? "..." : ""}`
    : "Using the current system prompt defaults.";
  const isUsingAccountPrompt = systemPrompt.trim() === accountSystemPrompt;
  const assistantStyleBadgeLabel = isUsingAccountPrompt ? "Account style" : "Saved thread style";
  const desktopControlBodyMaxHeightClass = controlsFirst
    ? "lg:max-h-[min(26dvh,18rem)] xl:max-h-[min(28dvh,20rem)] 2xl:max-h-[min(30dvh,22rem)]"
    : "lg:max-h-[min(36dvh,26rem)] xl:max-h-[min(38dvh,29rem)] 2xl:max-h-[min(40dvh,31rem)]";
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
    <div className="theme-surface-soft overflow-hidden rounded-[28px] p-3 sm:p-4">
      <button
        aria-controls="saved-chats-panel-body"
        aria-expanded={showSavedChatsPanel}
        className={`${disclosureHeaderBaseClass} theme-surface-feature`}
        type="button"
        onClick={() => setShowSavedChatsPanel((current) => !current)}
      >
        <span className="min-w-0">
          <span className="eyebrow text-muted">Saved chats</span>
          <span className="mt-2 block text-base font-semibold text-foreground sm:text-lg">
            Recent threads and archived history
          </span>
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:color-mix(in_srgb,var(--accent-strong)_72%,white_28%)]">
            Expand to browse and act
          </span>
          <span className="theme-surface-chip mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-xs font-medium text-muted">
            {savedChatsSummary}
          </span>
        </span>
        <span className="mt-1 hidden flex-col items-end gap-2 sm:inline-flex">
          <span className="theme-surface-chip rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {showSavedChatsPanel ? "Collapse" : "Expand"}
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
        <div id="saved-chats-panel-body" className={`mt-3 space-y-4 overflow-y-auto pr-1 ${desktopControlBodyMaxHeightClass}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted sm:text-sm">
                {currentUser
                  ? `Saved for ${currentUser.displayName}.`
                  : "Sign in to enable per-user saved conversations."}
              </p>
            </div>
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              type="button"
              onClick={startNewConversation}
            >
              New chat
            </button>
          </div>

          {currentUser ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-semibold">Pins</span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                    {pinnedConversationIds.length} pinned
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                    {archivedConversationCount} archived
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
                    {showPinnedOnly ? "Show all chats" : "Pinned only"}
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
                    {showArchivedConversations ? "Hide archived" : "Show archived"}
                  </button>
                </div>
              </div>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Search saved chats"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
              />
              {activeConversationId ? (
                <div className="theme-surface-strong rounded-[22px] p-3">
                  <p className="eyebrow text-muted">Active title</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                      placeholder="Conversation title"
                      value={conversationTitleDraft}
                      onChange={(event) => setConversationTitleDraft(event.target.value)}
                    />
                    <button
                      className="rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                      {isSavingConversation ? "Saving..." : "Save title"}
                    </button>
                    <button
                      className="rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSavingConversation}
                      type="button"
                      onClick={() => {
                        void setConversationArchived(activeConversationId, !activeConversationIsArchived);
                      }}
                    >
                      {activeConversationIsArchived ? "Restore chat" : "Archive chat"}
                    </button>
                  </div>
                  {activeConversationIsArchived ? (
                    <p className="mt-2 text-xs leading-6 text-muted">
                      This conversation is archived and stays out of the main rail until restored.
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
                          <p className="section-label text-xs font-semibold">Pinned</p>
                          <span className="text-xs text-muted">{pinnedVisibleConversations.length}</span>
                        </div>
                      ) : null}
                      {pinnedVisibleConversations.map((conversation) => {
                        const isActive = conversation.id === activeConversationId;
                        const recencyBadge = getConversationRecencyBadge(conversation.updatedAt);
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
                                  Pinned
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isActive
                                    ? "bg-[var(--accent)] text-white"
                                    : conversation.messageCount === 0
                                      ? "bg-stone-200 text-stone-900"
                                      : "bg-white text-foreground"
                                }`}>
                                  {isActive
                                    ? "Active"
                                    : conversation.messageCount === 0
                                      ? "Empty"
                                      : "Saved"}
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
                                {conversation.lastMessagePreview || "No messages yet."}
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                {conversation.messageCount} messages · {formatTimestamp(conversation.updatedAt)}
                              </p>
                            </button>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => togglePinnedConversation(conversation.id)}
                              >
                                Unpin
                              </button>
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => {
                                  void setConversationArchived(conversation.id, true);
                                }}
                              >
                                Archive
                              </button>
                              <button
                                className="text-xs font-semibold text-[var(--accent-strong)]"
                                type="button"
                                onClick={() => deleteConversationRecord(conversation.id)}
                              >
                                Delete
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
                          <p className="section-label text-xs font-semibold">Recent</p>
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
                            const recencyBadge = getConversationRecencyBadge(conversation.updatedAt);
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
                                        ? "Active"
                                        : conversation.messageCount === 0
                                          ? "Empty"
                                          : "Saved"}
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
                                    {conversation.lastMessagePreview || "No messages yet."}
                                  </p>
                                  <p className="mt-2 text-xs text-muted">
                                    {conversation.messageCount} messages · {formatTimestamp(conversation.updatedAt)}
                                  </p>
                                </button>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => togglePinnedConversation(conversation.id)}
                                  >
                                    Pin
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => {
                                      void setConversationArchived(conversation.id, true);
                                    }}
                                  >
                                    Archive
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => deleteConversationRecord(conversation.id)}
                                  >
                                    Delete
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
                          <p className="section-label text-xs font-semibold">Archived</p>
                          <span className="text-xs text-muted">{archivedConversationCount}</span>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
                            Empty {archivedEmptyConversationCount}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
                            {archivedRetentionDays}d+ {archivedOlderConversationCount}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">Retention</span>
                          {ARCHIVED_RETENTION_OPTIONS.map((value) => (
                            <button
                              key={value}
                              aria-label={`Set archived retention filter to ${value} days`}
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
                              {value} days
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-semibold">Filter</span>
                          {([
                            ["all", `All ${archivedConversationCount}`],
                            ["empty", `Empty ${archivedEmptyConversationCount}`],
                            ["old", `${archivedRetentionDays}d+ ${archivedOlderConversationCount}`],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              aria-label={`Show ${label.toLowerCase()} archived chats`}
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
                          <span className="font-semibold">Sort</span>
                          {([
                            ["archived-newest", "Newest archived"],
                            ["archived-oldest", "Oldest archived"],
                            ["recent-activity", "Recent activity"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              aria-label={`Sort archived chats by ${label.toLowerCase()}`}
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
                          <span className="font-semibold">Selection</span>
                          <span className="rounded-full bg-white px-3 py-1 font-semibold text-foreground">
                            {selectedArchivedVisibleConversationIds.length} selected
                          </span>
                          <button
                            aria-label={selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length
                              ? "Clear selection for all visible archived chats"
                              : "Select all visible archived chats"}
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length}
                            className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleConversations.length === 0}
                            type="button"
                            onClick={toggleSelectAllArchivedVisible}
                          >
                            {selectedArchivedVisibleConversationIds.length === archivedVisibleConversations.length
                              ? "Clear visible selection"
                              : "Select visible"}
                          </button>
                          {selectedArchivedVisibleConversationIds.length > 0 ? (
                            <button
                              aria-label="Clear the current archived selection"
                              className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-foreground"
                              disabled={isRunningArchivedCleanup}
                              type="button"
                              onClick={() => setSelectedArchivedConversationIds([])}
                            >
                              Clear selection
                            </button>
                          ) : null}
                          <button
                            aria-label="Select visible archived chats with no messages"
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleEmptyConversationIds.length && archivedVisibleEmptyConversationIds.every((id) => selectedArchivedVisibleConversationIdSet.has(id))}
                            className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleEmptyConversationIds.length === 0}
                            type="button"
                            onClick={() => replaceArchivedSelection(archivedVisibleEmptyConversationIds)}
                          >
                            Select empty
                          </button>
                          <button
                            aria-label={`Select visible archived chats at least ${archivedRetentionDays} days old`}
                            aria-pressed={selectedArchivedVisibleConversationIds.length > 0 && selectedArchivedVisibleConversationIds.length === archivedVisibleOlderConversationIds.length && archivedVisibleOlderConversationIds.every((id) => selectedArchivedVisibleConversationIdSet.has(id))}
                            className="rounded-full border border-line bg-white px-3 py-1 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isRunningArchivedCleanup || archivedVisibleOlderConversationIds.length === 0}
                            type="button"
                            onClick={() => replaceArchivedSelection(archivedVisibleOlderConversationIds)}
                          >
                            Select {archivedRetentionDays}d+
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
                              aria-label="Clear the pending archive bulk action confirmation"
                              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground"
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
                          aria-label="Archived conversations"
                          aria-multiselectable="true"
                          role="listbox"
                          className="space-y-3"
                        >
                          {archivedVisibleConversations.map((conversation) => {
                            const isActive = conversation.id === activeConversationId;
                            const recencyBadge = getConversationRecencyBadge(conversation.updatedAt);
                            const archivedMetaBadges = getArchivedConversationMetaBadges(conversation);
                            const isSelected = selectedArchivedVisibleConversationIdSet.has(conversation.id);

                            return (
                              <div
                                key={conversation.id}
                                ref={(node) => {
                                  archivedConversationItemRefs.current[conversation.id] = node;
                                }}
                                aria-label={`${conversation.title}. ${conversation.messageCount} messages.`}
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
                                    aria-label={`${isSelected ? "Deselect" : "Select"} archived conversation ${conversation.title}`}
                                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                      isSelected
                                        ? "bg-sky-600 text-white"
                                        : "border border-line bg-white text-foreground"
                                    }`}
                                    disabled={isRunningArchivedCleanup}
                                    type="button"
                                    onClick={() => toggleArchivedConversationSelection(conversation.id)}
                                  >
                                    {isSelected ? "Selected" : "Select"}
                                  </button>
                                  {isActive ? (
                                    <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white">
                                      Active
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
                                      Archived
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
                                    {conversation.lastMessagePreview || "No messages yet."}
                                  </p>
                                  <p className="mt-2 text-xs text-muted">
                                    {conversation.messageCount} messages · {formatTimestamp(conversation.updatedAt)}
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
                                    Restore
                                  </button>
                                  <button
                                    className="text-xs font-semibold text-[var(--accent-strong)]"
                                    type="button"
                                    onClick={() => deleteConversationRecord(conversation.id)}
                                  >
                                    Delete
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
                    : "No saved conversations yet."}
                </div>
              )
            ) : (
              <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                Sign in with a local user account to load and save your own conversation history.
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
                <p className="text-xs text-muted">No saved chats yet.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Sign in to scan recent saved chats here.</p>
          )}
        </div>
      )}
    </div>
  );

  const modelControlsPanel = (
    <div className="theme-surface-soft overflow-hidden rounded-[28px] p-3 sm:p-4">
      <button
        aria-controls="model-controls-panel-body"
        aria-expanded={showModelControlsPanel}
        className={`${disclosureHeaderBaseClass} theme-surface-feature-cool`}
        type="button"
        onClick={() => setShowModelControlsPanel((current) => !current)}
      >
        <span className="min-w-0">
          <span className="eyebrow text-muted">AI controls</span>
          <span className="mt-2 block text-base font-semibold text-foreground sm:text-lg">
            Model, response, and assistant style
          </span>
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:color-mix(in_srgb,var(--accent-strong)_56%,#245d7b_44%)]">
            Expand to tune replies
          </span>
          <span className="theme-surface-chip mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-xs font-medium text-muted">
            {modelControlsSummary}
          </span>
        </span>
        <span className="mt-1 hidden flex-col items-end gap-2 sm:inline-flex">
          <span className="theme-surface-chip rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {showModelControlsPanel ? "Collapse" : "Expand"}
          </span>
          <span className={disclosureIndicatorClass}>
            <DisclosureChevronIcon open={showModelControlsPanel} />
          </span>
        </span>
        <span className={`${disclosureIndicatorClass} mt-1 sm:hidden`}>
          <DisclosureChevronIcon open={showModelControlsPanel} />
        </span>
      </button>

      {showModelControlsPanel ? (
        <div id="model-controls-panel-body" className={`mt-3 space-y-3 overflow-y-auto pr-1 ${desktopControlBodyMaxHeightClass}`}>
          <div className="theme-surface-soft rounded-[28px] p-4 sm:p-5">
            <label className="eyebrow text-muted" htmlFor="model-select">
              Active model
            </label>
            <select
              id="model-select"
              className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              disabled={models.length === 0 || isStreaming}
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {models.length === 0 ? (
                <option value="">No Ollama models detected</option>
              ) : null}
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} · {formatBytes(model.size)}
                </option>
              ))}
            </select>
          </div>

          <div className="theme-surface-soft rounded-[28px] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <label className="eyebrow text-muted" htmlFor="temperature-range">
                Temperature
              </label>
              <span className="text-sm font-semibold text-foreground">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              id="temperature-range"
              className="mt-4 w-full accent-[var(--accent)]"
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
            <p className="mt-3 text-sm leading-6 text-muted">
              Lower values keep replies tighter. Higher values allow more variation.
            </p>
          </div>

          <div className="theme-surface-soft rounded-[28px] p-4 sm:p-5">
            <p className="eyebrow text-muted">Assistant style</p>
            <p className="mt-3 text-sm font-semibold text-foreground">
              {isUsingAccountPrompt ? "Using your account default" : "Using a saved thread style"}
            </p>
            <p className="mt-3 text-sm leading-7 text-muted">{systemPromptPreview}</p>
            <p className="mt-3 text-xs leading-6 text-muted">
              Change the default in Admin / Access. Older saved chats keep any thread-specific assistant style already stored with them.
            </p>
          </div>

          <div className="theme-surface-panel rounded-[28px] border-dashed p-4 text-sm leading-7 text-muted">
            {lastLatency
              ? `Last response streamed in ${lastLatency} ms.`
              : "Run a prompt to measure live response latency through the gateway."}
            <br />
            {isSavingConversation
              ? "Saving conversation..."
              : isLoadingConversation
                ? "Opening saved conversation..."
                : currentUser
                  ? "Conversation state persists per signed-in user."
                  : "Signed-out sessions can chat live, but conversation history is not persisted."}
          </div>
        </div>
      ) : (
        <div className="theme-surface-panel mt-3 grid gap-3 rounded-[24px] px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                isReachable
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-amber-100 text-amber-900"
              }`}>
                {isReachable ? "Gateway online" : "Gateway offline"}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {selectedModel || "No model selected"}
            </p>
            <p className="text-xs leading-5 text-muted">
              Choose a model here. Your assistant style default now lives in Admin / Access.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="theme-surface-strong rounded-[18px] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Temperature</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{temperature.toFixed(1)}</p>
            </div>
            <div className="theme-surface-strong rounded-[18px] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Latency</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{lastLatency ? `${lastLatency} ms` : "Pending"}</p>
            </div>
          </div>
          <div className="theme-surface-strong lg:col-span-2 rounded-[18px] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Assistant style</p>
            <p className="mt-1 text-xs leading-5 text-muted">{systemPromptPreview}</p>
          </div>
        </div>
      )}
    </div>
  );

  const chatStage = (
    <div className="theme-surface-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-line/80 p-4 sm:p-5 lg:px-6 xl:px-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-b-[40px] bg-[radial-gradient(circle_at_top,rgba(213,122,66,0.12),transparent_70%)]" />
      <div className="theme-surface-panel relative mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3">
        <div>
          <p className="eyebrow text-muted">Transcript stage</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{transcriptSummary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasLocalAiAvailable ? (
            <label className="theme-surface-chip flex items-center gap-2 rounded-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.55)]" />
              <span className="text-muted">Talk to</span>
              <select
                aria-label="Select the AI for this chat"
                className="min-w-[10rem] bg-transparent text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground outline-none"
                disabled={isStreaming}
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
              >
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-800">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.55)]" />
              {localAiStatusLabel}
            </span>
          )}
          <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
            {lastLatency ? `${lastLatency} ms` : "Awaiting first reply"}
          </span>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="theme-surface-transcript min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-line/50 px-3 py-3 pr-2 sm:px-4 sm:py-4"
      >
        {messages.length === 0 ? (
          <div className="theme-surface-feature rounded-[28px] border-dashed p-5 sm:p-6">
            <p className="eyebrow text-muted">Chat box ready</p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
              Type a message to start the conversation.
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted">
              This is the chat area. Ask for code help, drafting, troubleshooting, or model comparisons and the reply will stream here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-foreground"
                  type="button"
                  onClick={() => applyPromptPreset(preset.prompt)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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
                  {isAssistant ? "Assistant" : "Operator"}
                </p>
                {isStreaming && isAssistant && index === messages.length - 1 ? (
                  <span className={`text-xs font-medium ${isAssistant ? "text-muted" : "text-white/80"}`}>
                    Streaming...
                  </span>
                ) : null}
              </div>
              <p className={`mt-3 whitespace-pre-wrap ${
                isAssistant
                  ? "text-[15px] leading-8 sm:text-[16px]"
                  : "text-[14px] font-medium leading-7 sm:text-[15px]"
              }`}>
                {message.content || "Waiting for model output..."}
              </p>
            </article>
          );
        })}
      </div>

      <form ref={composerFormRef} className="theme-surface-panel mt-4 overflow-hidden rounded-[32px] border border-line/80 px-4 py-4 shadow-[0_20px_54px_rgba(83,53,31,0.1)] sm:px-5 sm:py-5" onSubmit={handleSubmit}>
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="eyebrow text-muted">Message box</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Talk to the model from here.
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use this box for the actual request. Your default assistant style now lives in Admin / Access, while saved chats keep any older thread-specific style.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              {selectedModel || "No model selected"}
            </span>
            <span className="theme-surface-chip rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
              {assistantStyleBadgeLabel}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                showPromptPresets
                  ? "bg-[var(--accent)] text-white"
                  : "border border-line bg-white text-foreground"
              }`}
              type="button"
              onClick={() => setShowPromptPresets((current) => !current)}
            >
              {showPromptPresets ? "Hide prompt presets" : "Show prompt presets"}
            </button>
            <p className="text-xs text-muted">
              Quick starts for mobile and repeat tasks.
            </p>
          </div>
          {showPromptPresets ? (
            <div className="flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-foreground"
                  type="button"
                  onClick={() => applyPromptPreset(preset.prompt)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <textarea
          ref={draftInputRef}
          className="min-h-36 w-full rounded-[30px] border border-line bg-white px-4 py-4 text-sm leading-7 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none sm:px-5 sm:py-5 lg:min-h-40"
          placeholder="Ask Ollama something useful..."
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
            <button
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(213,122,66,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!draft.trim() || !selectedModel || isStreaming}
              type="submit"
            >
              {isStreaming ? "Streaming..." : "Send prompt"}
            </button>
            <button
              className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isStreaming}
              type="button"
              onClick={stopStreaming}
            >
              Stop
            </button>
            <button
              className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-foreground"
              type="button"
              onClick={clearConversation}
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-muted">
            Requests are sent through `/api/ollama/chat`. Press Ctrl+Enter or Cmd+Enter to send.
          </p>
        </div>
      </form>
    </div>
  );

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-[36px] p-3 sm:p-5 lg:h-auto lg:overflow-visible lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-label text-xs font-semibold">Live chat</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Conversation cockpit
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Chats now persist locally. You can resume recent sessions, keep model
            settings per conversation, and continue through the server gateway.
          </p>
          {activeConversationIsArchived ? (
            <p className="mt-2 max-w-2xl text-xs leading-6 text-muted sm:text-sm">
              This active conversation is archived and stays out of the main saved-chat flow until restored.
            </p>
          ) : null}
        </div>

        <div className="ui-control-band -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-4 sm:py-4">
          <button
            className="theme-surface-chip rounded-full px-4 py-2 text-sm font-medium text-foreground lg:hidden"
            type="button"
            onClick={() => setShowWorkspaceSidebar((current) => !current)}
          >
            {showWorkspaceSidebar ? "Hide controls" : "Show controls"}
          </button>
          <div className="theme-surface-chip rounded-full px-4 py-2 text-sm font-medium text-foreground">
            {conversationTitle}
          </div>
          <div className="theme-surface-chip rounded-full px-4 py-2 text-sm font-medium text-foreground">
            {selectedModel || "No model available"}
          </div>
          {activeConversationIsArchived ? (
            <div className="rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold text-stone-900">
              Archived thread
            </div>
          ) : null}
          <div
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              isReachable
                ? "bg-emerald-100 text-emerald-900"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {isReachable ? "Gateway online" : "Gateway offline"}
          </div>
          <button
            className="theme-surface-feature hidden shrink-0 items-center gap-3 rounded-[20px] px-3 py-2 text-left transition duration-200 hover:-translate-y-0.5 lg:inline-flex"
            type="button"
            onClick={() => setDesktopLayoutMode((current) => current === "chat-first" ? "controls-first" : "chat-first")}
          >
            <span className="theme-surface-chip inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[color:var(--accent-strong)]">
              <SparkGridIcon />
            </span>
            <span className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Layout flow</span>
              <span className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <DesktopLayoutSwapIcon reversed={controlsFirst} />
                {controlsFirst ? "Move controls below" : "Move controls above"}
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 lg:flex-none lg:items-center">
        <div className={`${showWorkspaceSidebar ? "block" : "hidden"} order-1 lg:block lg:w-full lg:max-w-[92rem] xl:max-w-[96rem] lg:flex-none ${controlsFirst ? "lg:order-1" : "lg:order-2"}`}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start">
            {savedChatsPanel}
            {modelControlsPanel}
          </div>
        </div>

        <div className={`order-2 min-h-0 flex-1 lg:w-full lg:max-w-[98rem] lg:flex-none xl:max-w-[104rem] ${controlsFirst ? "lg:order-2" : "lg:order-1"}`}>
          {chatStage}
        </div>
      </div>
    </section>
  );
}