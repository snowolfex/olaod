"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppUpdateMonitor } from "@/components/app-update-monitor";
import { VoiceLanguageSelect } from "@/components/voice-language-select";
import { getHelpHint } from "@/lib/help-manual";
import { readQuickHelpEnabled, writeQuickHelpEnabled } from "@/lib/help-preferences";
import { DEFAULT_USER_CHAT_TEMPERATURE, DEFAULT_USER_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { resolveUiLanguage, translateUi, translateUiText } from "@/lib/ui-language";
import type { OllamaModel } from "@/lib/ollama";
import type {
  AiGroundingMode,
  AiKnowledgeBase,
  AiKnowledgeDebugResponse,
  AiModelSummary,
  AiKnowledgeDebugResult,
  AiKnowledgeEntry,
  AiKnowledgeOverlapResult,
  AiProviderConfigSummary,
  AiProviderId,
  AiToolDefinition,
  AiToolId,
  AiWorkspaceProfile,
} from "@/lib/ai-types";
import type { ManagedUser, PublicUser, SessionUser, UserSessionStatus, VoiceTranscriptionLanguage } from "@/lib/user-types";

const AI_PROVIDER_CONFIG_CHANGED_EVENT = "oload:ai-provider-config-changed";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_GSI_SCRIPT_ID = "oload-google-gsi-script";
const KNOWLEDGE_PROVIDER_OPTIONS: Array<{ id: AiProviderId; label: string }> = [
  { id: "ollama", label: "Ollama" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

type AiModelsResponse = {
  models: AiModelSummary[];
  providerId: AiProviderId;
};

type AiProfilesResponse = {
  profiles: AiWorkspaceProfile[];
};

type AiKnowledgeBasesResponse = {
  knowledgeBases: AiKnowledgeBase[];
};

type AiToolsResponse = {
  tools: AiToolDefinition[];
};

type VerificationChallenge = {
  email: string;
  expiresAt: string;
  purpose: "login" | "register";
};

type PasswordResetChallenge = {
  email: string;
  expiresAt: string;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
      <path
        d="M21.8 12.23c0-.72-.06-1.25-.19-1.8H12v3.71h5.64c-.11.92-.74 2.3-2.15 3.23l-.02.12 3.02 2.29.21.02c1.93-1.75 3.1-4.31 3.1-7.57Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.07-.89 6.76-2.4l-3.22-2.43c-.86.59-2.01 1-3.54 1-2.7 0-4.98-1.75-5.79-4.17l-.12.01-3.14 2.38-.04.11C4.59 19.77 8.02 22 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.21 14c-.21-.6-.33-1.24-.33-1.9s.12-1.3.31-1.9l-.01-.13-3.18-2.42-.1.04A9.82 9.82 0 0 0 2 12.1c0 1.58.38 3.07 1.05 4.39L6.21 14Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.83c1.93 0 3.23.82 3.97 1.5l2.9-2.78C17.06 2.9 14.76 2 12 2 8.02 2 4.59 4.23 2.9 7.6l3.29 2.51C7.01 7.58 9.29 5.83 12 5.83Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function literalForLanguage(
  language: VoiceTranscriptionLanguage | undefined,
  sourceText: string,
  variables?: Record<string, string | number>,
) {
  return translateUiText(language ?? "united-states", sourceText, variables);
}

type KnowledgeDebugViewMode = "list" | "map";

type KnowledgeDebugMapNode = {
  id: string;
  title: string;
  angle: number;
  x: number;
  y: number;
  radius: number;
  hybridScore: number;
  lexicalScore: number;
  vectorSimilarity: number | null;
  duplicatePenalty: number;
  vectorAvailable: boolean;
};

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildKnowledgeDebugMapNodes(results: AiKnowledgeDebugResult[]) {
  if (results.length === 0) {
    return [];
  }

  const maxScore = Math.max(...results.map((entry) => entry.breakdown.hybridScore), 1);

  return results.map((entry, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / results.length) * index;
    const normalizedScore = entry.breakdown.hybridScore / maxScore;
    const scoreDistance = 114 - (normalizedScore * 42);
    const similarityOffset = entry.breakdown.vectorSimilarity === null
      ? 10
      : (1 - clampValue(entry.breakdown.vectorSimilarity, 0, 1)) * 26;
    const distance = clampValue(scoreDistance + similarityOffset, 58, 132);

    return {
      id: entry.id,
      title: entry.title,
      angle,
      x: 160 + Math.cos(angle) * distance,
      y: 160 + Math.sin(angle) * distance,
      radius: 14 + (normalizedScore * 14),
      hybridScore: entry.breakdown.hybridScore,
      lexicalScore: entry.breakdown.lexicalScoreTotal,
      vectorSimilarity: entry.breakdown.vectorSimilarity,
      duplicatePenalty: entry.breakdown.duplicatePenalty,
      vectorAvailable: entry.breakdown.vectorAvailable,
    } satisfies KnowledgeDebugMapNode;
  });
}

function truncateKnowledgeMapLabel(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function formatProviderLabel(providerId: AiProviderId, language?: VoiceTranscriptionLanguage) {
  if (providerId === "ollama") {
    return literalForLanguage(language, "Ollama");
  }

  if (providerId === "anthropic") {
    return literalForLanguage(language, "Anthropic");
  }

  return literalForLanguage(language, "OpenAI");
}

function formatRoleLabel(role: "admin" | "operator" | "viewer", language?: VoiceTranscriptionLanguage) {
  if (resolveUiLanguage(language ?? "united-states") === "english") {
    return role;
  }

  if (role === "viewer") {
    return literalForLanguage(language, "Viewer");
  }

  return translateUi(language ?? "united-states", role);
}

function formatSavedConversationCountLabel(count: number, language?: VoiceTranscriptionLanguage) {
  return count === 1
    ? literalForLanguage(language, "{count} saved conversation", { count })
    : literalForLanguage(language, "{count} saved conversations", { count });
}

function formatKnowledgeProviderScope(providerIds: AiProviderId[], language?: VoiceTranscriptionLanguage) {
  if (providerIds.length === 0) {
    return literalForLanguage(language, "all providers");
  }

  return providerIds.map((providerId) => formatProviderLabel(providerId, language)).join(", ");
}

function parseScopedModelIds(value: string) {
  return Array.from(new Set(value.split(",").map((modelId) => modelId.trim()).filter(Boolean)));
}

function parseKnowledgeTags(value: string) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)));
}

function formatKnowledgeOverlapScope(scopeOverlap: "exact" | "partial" | "global", language?: VoiceTranscriptionLanguage) {
  if (scopeOverlap === "exact") {
    return literalForLanguage(language, "Exact scope match");
  }

  if (scopeOverlap === "global") {
    return literalForLanguage(language, "Global scope overlap");
  }

  return literalForLanguage(language, "Partial scope overlap");
}

function formatGroundingModeLabel(mode: Exclude<AiGroundingMode, "off">, language?: VoiceTranscriptionLanguage) {
  return mode === "strict"
    ? literalForLanguage(language, "Strict")
    : literalForLanguage(language, "Balanced");
}

let googleScriptLoadPromise: Promise<void> | null = null;
let googleIdentityInitialized = false;

type WorkspaceBackupSnapshot = {
  version: number;
  exportedAt: string;
  users: Array<{ id: string }>;
  conversations: Array<{ id: string }>;
  activityEvents: Array<{ id: string }>;
  jobHistory: Array<{ id: string }>;
};

type UserAccessPanelProps = {
  availableModels?: OllamaModel[];
  compact?: boolean;
  onRequestLogout?: () => Promise<void> | void;
  onSessionChange: (status: UserSessionStatus) => void;
  session: UserSessionStatus;
  surface?: "embedded" | "page";
  uiLanguagePreference?: VoiceTranscriptionLanguage;
};

function describeRestoreOutcome(
  previousUser: SessionUser | null,
  nextSession: UserSessionStatus,
  language?: VoiceTranscriptionLanguage,
) {
  if (!previousUser) {
    return {
      summary: literalForLanguage(language, "Workspace backup restored."),
      tone: "success" as const,
    };
  }

  if (!nextSession.user) {
    if (nextSession.userCount === 0) {
      return {
        summary: literalForLanguage(language, "Workspace backup restored. Your previous session was cleared because the restored workspace no longer includes any local users."),
        tone: "warning" as const,
      };
    }

    return {
      summary: literalForLanguage(language, "Workspace backup restored. Your previous session was cleared because that user is no longer present in the restored workspace."),
      tone: "warning" as const,
    };
  }

  if (nextSession.user.id === previousUser.id && nextSession.user.role !== previousUser.role) {
    return {
      summary: literalForLanguage(language, "Workspace backup restored. Your access changed from {previousRole} to {nextRole}.", {
        previousRole: formatRoleLabel(previousUser.role, language),
        nextRole: formatRoleLabel(nextSession.user.role, language),
      }),
      tone: "warning" as const,
    };
  }

  return {
    summary: literalForLanguage(language, "Workspace backup restored."),
    tone: "success" as const,
  };
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

function getLoginErrorMessage(code: string | null, language?: VoiceTranscriptionLanguage) {
  switch (code) {
    case "google_not_configured":
      return literalForLanguage(language, "Google sign-in is not configured on this deployment yet.");
    case "google_access_denied":
      return literalForLanguage(language, "Google sign-in was cancelled before access was granted.");
    case "google_state_invalid":
      return literalForLanguage(language, "Google sign-in could not verify the login state. Try again.");
    case "google_login_failed":
      return literalForLanguage(language, "Google sign-in failed. Check the Google app configuration and try again.");
    default:
      return null;
  }
}

function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptLoadPromise) {
    return googleScriptLoadPromise;
  }

  googleScriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_GSI_SCRIPT_ID);

    if (existingScript instanceof HTMLScriptElement) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load Google sign-in.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_GSI_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Google sign-in."));
    document.head.appendChild(script);
  }).catch((error) => {
    googleScriptLoadPromise = null;
    throw error;
  });

  return googleScriptLoadPromise;
}

export function UserAccessPanel({ availableModels = [], compact = false, onRequestLogout, onSessionChange, session, surface = "embedded", uiLanguagePreference }: UserAccessPanelProps) {
  const activeUiLanguage = uiLanguagePreference ?? session.user?.preferredVoiceTranscriptionLanguage ?? "united-states";
  const t = (key: Parameters<typeof translateUi>[1], variables?: Record<string, string | number>) =>
    translateUi(activeUiLanguage, key, variables);
  const literal = useCallback(
    (sourceText: string, variables?: Record<string, string | number>) =>
      translateUiText(activeUiLanguage, sourceText, variables),
    [activeUiLanguage],
  );
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleBrokerPollRef = useRef<number | null>(null);
  const knowledgeFormRef = useRef<HTMLDivElement | null>(null);
  const knowledgeFileInputRef = useRef<HTMLInputElement | null>(null);
  const knowledgeTitleInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserId = session.user?.id ?? null;
  const isPageSurface = surface === "page" && !compact;
  const isAdminSession = session.user?.role === "admin";
  const [mode, setMode] = useState<"login" | "register">(() => session.userCount === 0 ? "register" : "login");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [localEmail, setLocalEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationChallenge, setVerificationChallenge] = useState<VerificationChallenge | null>(null);
  const [verificationSecondsRemaining, setVerificationSecondsRemaining] = useState(0);
  const [passwordResetChallenge, setPasswordResetChallenge] = useState<PasswordResetChallenge | null>(null);
  const [passwordResetSecondsRemaining, setPasswordResetSecondsRemaining] = useState(0);
  const [resetCode, setResetCode] = useState("");
  const [resetPasswordDraft, setResetPasswordDraft] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isCompletingPasswordReset, setIsCompletingPasswordReset] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<null | "invalid-login" | "user-missing" | "password-reset">(null);
  const [authDialogMessage, setAuthDialogMessage] = useState<string | null>(null);
  const [authSummary, setAuthSummary] = useState<string | null>(null);
  const [authSummaryTone, setAuthSummaryTone] = useState<"success" | "warning">("success");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPreferredModel, setAccountPreferredModel] = useState("");
  const [accountPreferredTemperature, setAccountPreferredTemperature] = useState(DEFAULT_USER_CHAT_TEMPERATURE);
  const [accountPreferredSystemPrompt, setAccountPreferredSystemPrompt] = useState(DEFAULT_USER_SYSTEM_PROMPT);
  const [accountPreferredVoiceLanguage, setAccountPreferredVoiceLanguage] = useState<VoiceTranscriptionLanguage>(activeUiLanguage);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [nextPasswordDraft, setNextPasswordDraft] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountSummary, setAccountSummary] = useState<string | null>(null);
  const [accountSummaryTone, setAccountSummaryTone] = useState<"success" | "warning">("success");
  const [backupSummary, setBackupSummary] = useState<string | null>(null);
  const [backupSummaryTone, setBackupSummaryTone] = useState<"success" | "warning">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingAccountProfile, setIsSavingAccountProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isQuickHelpEnabled, setIsQuickHelpEnabled] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [pendingBackupFileName, setPendingBackupFileName] = useState<string | null>(null);
  const [pendingBackupSnapshot, setPendingBackupSnapshot] = useState<WorkspaceBackupSnapshot | null>(null);
  const [backupRestoreConfirmed, setBackupRestoreConfirmed] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<AiProviderConfigSummary[]>([]);
  const [anthropicApiKeyDraft, setAnthropicApiKeyDraft] = useState("");
  const [openAiApiKeyDraft, setOpenAiApiKeyDraft] = useState("");
  const [isLoadingProviderConfigs, setIsLoadingProviderConfigs] = useState(false);
  const [isSavingAnthropicApiKey, setIsSavingAnthropicApiKey] = useState(false);
  const [isSavingOpenAiApiKey, setIsSavingOpenAiApiKey] = useState(false);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<AiWorkspaceProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileProviderId, setProfileProviderId] = useState<AiProviderId>("ollama");
  const [profileModel, setProfileModel] = useState("");
  const [profileSystemPrompt, setProfileSystemPrompt] = useState("");
  const [profileTemperature, setProfileTemperature] = useState(0.4);
  const [profileUseKnowledge, setProfileUseKnowledge] = useState(true);
  const [profileGroundingMode, setProfileGroundingMode] = useState<Exclude<AiGroundingMode, "off">>("balanced");
  const [profileEnabledToolIds, setProfileEnabledToolIds] = useState<AiToolId[]>([]);
  const [profileKnowledgeBaseIds, setProfileKnowledgeBaseIds] = useState<string[]>([]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(null);
  const [profileSummaryTone, setProfileSummaryTone] = useState<"success" | "warning">("success");
  const [workspaceTools, setWorkspaceTools] = useState<AiToolDefinition[]>([]);
  const [isLoadingWorkspaceTools, setIsLoadingWorkspaceTools] = useState(true);
  const [knowledgeBases, setKnowledgeBases] = useState<AiKnowledgeBase[]>([]);
  const [knowledgeBaseName, setKnowledgeBaseName] = useState("");
  const [knowledgeBaseDescription, setKnowledgeBaseDescription] = useState("");
  const [knowledgeBaseEntryIds, setKnowledgeBaseEntryIds] = useState<string[]>([]);
  const [editingKnowledgeBaseId, setEditingKnowledgeBaseId] = useState<string | null>(null);
  const [isLoadingKnowledgeBases, setIsLoadingKnowledgeBases] = useState(true);
  const [isSavingKnowledgeBase, setIsSavingKnowledgeBase] = useState(false);
  const [busyKnowledgeBaseId, setBusyKnowledgeBaseId] = useState<string | null>(null);
  const [knowledgeBaseSummary, setKnowledgeBaseSummary] = useState<string | null>(null);
  const [knowledgeEntries, setKnowledgeEntries] = useState<AiKnowledgeEntry[]>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeSource, setKnowledgeSource] = useState("manual");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [knowledgeProviderIds, setKnowledgeProviderIds] = useState<AiProviderId[]>([]);
  const [knowledgeModelIds, setKnowledgeModelIds] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeImportUrl, setKnowledgeImportUrl] = useState("");
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeOverlapResults, setKnowledgeOverlapResults] = useState<AiKnowledgeOverlapResult[]>([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);
  const [isImportingKnowledge, setIsImportingKnowledge] = useState(false);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [isCheckingKnowledgeOverlaps, setIsCheckingKnowledgeOverlaps] = useState(false);
  const [busyKnowledgeId, setBusyKnowledgeId] = useState<string | null>(null);
  const [knownModelsByProvider, setKnownModelsByProvider] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const [isLoadingKnowledgeModelSuggestions, setIsLoadingKnowledgeModelSuggestions] = useState(false);
  const [knowledgeSummary, setKnowledgeSummary] = useState<string | null>(null);
  const [knowledgeSummaryTone, setKnowledgeSummaryTone] = useState<"success" | "warning">("success");
  const [knowledgeDebugQuery, setKnowledgeDebugQuery] = useState("");
  const [knowledgeDebugProviderId, setKnowledgeDebugProviderId] = useState<AiProviderId | "all">("all");
  const [knowledgeDebugModelId, setKnowledgeDebugModelId] = useState("");
  const [knowledgeDebugResults, setKnowledgeDebugResults] = useState<AiKnowledgeDebugResult[]>([]);
  const [knowledgeDebugResponse, setKnowledgeDebugResponse] = useState<AiKnowledgeDebugResponse | null>(null);
  const [knowledgeDebugViewMode, setKnowledgeDebugViewMode] = useState<KnowledgeDebugViewMode>("list");
  const [isRunningKnowledgeDebug, setIsRunningKnowledgeDebug] = useState(false);
  const configuredProviderCount = providerConfigs.filter((provider) => provider.configured).length;

  useEffect(() => {
    if (!verificationChallenge) {
      setVerificationSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = Math.max(0, Date.parse(verificationChallenge.expiresAt) - Date.now());
      setVerificationSecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();

    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [verificationChallenge]);

  useEffect(() => {
    if (!passwordResetChallenge) {
      setPasswordResetSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = Math.max(0, Date.parse(passwordResetChallenge.expiresAt) - Date.now());
      setPasswordResetSecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();

    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [passwordResetChallenge]);

  useEffect(() => {
    if (!session.user) {
      return;
    }

    setVerificationChallenge(null);
    setVerificationCode("");
    setPasswordResetChallenge(null);
    setPasswordResetSecondsRemaining(0);
    setResetCode("");
    setResetPasswordDraft("");
    setAuthDialogMode(null);
    setAuthDialogMessage(null);
    setAuthSummary(null);
  }, [session.user]);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const hasOfficialGoogleSignIn = GOOGLE_CLIENT_ID.trim().length > 0;
  const isBrokerGoogleSignIn = session.googleAuthMode === "broker";
  const hasDirectGoogleSignIn = session.googleAuthMode === "direct" && hasOfficialGoogleSignIn;
  const hasLegacyGoogleRedirect = session.googleAuthMode === "redirect";
  const showGoogleAuthUi = true;
  const quickHelpHint = getHelpHint("command.quick-help-toggle");
  const quickHelpPreferenceSummary = literal("Show short contextual help cards on desktop hover and mobile long-press.");
  const googleActionLabel = session.userCount === 0 ? literal("Continue with Google") : literal("Sign in with Google");

  useEffect(() => {
    setAccountDisplayName(session.user?.displayName ?? "");
    setAccountEmail(session.user?.email ?? "");
    setAccountPreferredModel(session.user?.preferredModel ?? "");
    setAccountPreferredTemperature(session.user?.preferredTemperature ?? DEFAULT_USER_CHAT_TEMPERATURE);
    setAccountPreferredSystemPrompt(session.user?.preferredSystemPrompt ?? DEFAULT_USER_SYSTEM_PROMPT);
    setAccountPreferredVoiceLanguage(session.user?.preferredVoiceTranscriptionLanguage ?? activeUiLanguage);
    setCurrentPasswordDraft("");
    setNextPasswordDraft("");
    setAccountSummary(null);
  }, [activeUiLanguage, session.user?.displayName, session.user?.email, session.user?.id, session.user?.preferredModel, session.user?.preferredSystemPrompt, session.user?.preferredTemperature, session.user?.preferredVoiceTranscriptionLanguage]);

  useEffect(() => {
    if (!session.user) {
      setMode(session.userCount === 0 ? "register" : "login");
    }
  }, [session.user, session.userCount]);

  useEffect(() => {
    setIsQuickHelpEnabled(readQuickHelpEnabled());
  }, []);

  useEffect(() => {
    const message = getLoginErrorMessage(searchParams.get("loginError"), activeUiLanguage);

    if (!message) {
      return;
    }

    setError(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("loginError");
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [activeUiLanguage, pathname, router, searchParams]);

  useEffect(() => () => {
    if (googleBrokerPollRef.current !== null) {
      window.clearInterval(googleBrokerPollRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showGoogleAuthUi || !hasDirectGoogleSignIn) {
      return;
    }

    let isCancelled = false;

    void loadGoogleIdentityScript()
      .then(() => {
        if (!isCancelled) {
          setGoogleScriptReady(true);
        }
      })
      .catch((loadError) => {
        if (!isCancelled) {
          setGoogleScriptReady(false);
          setError(
            loadError instanceof Error
              ? literal(loadError.message)
              : literal("Unable to load Google sign-in."),
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hasDirectGoogleSignIn, literal, showGoogleAuthUi]);

  const completeGoogleSignIn = useEffectEvent(async (credential: string) => {
    setIsGoogleSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/users/google/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credential, rememberSession }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser; userCount: number };
      const nextSession = await fetchCurrentSession();

      if (!nextSession.user || nextSession.user.id !== payload.user.id) {
        throw new Error(literal("Google sign-in finished, but the session was not established. Reload and try again."));
      }

      onSessionChange(nextSession);
      setLocalEmail("");
      setDisplayName("");
      setPassword("");
    } catch (googleError) {
      setError(
        googleError instanceof Error
          ? googleError.message
          : literal("Unable to complete Google sign-in."),
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  });

  async function startBrokerGoogleSignIn() {
    setIsGoogleSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/users/google/broker/start", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        requestId: string;
        authorizeUrl: string;
        pollIntervalMs: number;
      };
      const popup = window.open(
        payload.authorizeUrl,
        "oload-google-broker",
        "popup=yes,width=520,height=720",
      );

      if (!popup) {
        throw new Error(literal("The broker sign-in window was blocked. Allow popups and try again."));
      }

      if (googleBrokerPollRef.current !== null) {
        window.clearInterval(googleBrokerPollRef.current);
      }

      googleBrokerPollRef.current = window.setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/users/google/broker/status/${encodeURIComponent(payload.requestId)}`, {
            cache: "no-store",
          });

          if (!statusResponse.ok) {
            throw new Error(await readErrorMessage(statusResponse));
          }

          const statusPayload = (await statusResponse.json()) as {
            status: "pending" | "approved" | "expired" | "consumed";
          };

          if (statusPayload.status === "pending") {
            if (popup.closed) {
              window.clearInterval(googleBrokerPollRef.current ?? 0);
              googleBrokerPollRef.current = null;
              setIsGoogleSubmitting(false);
              setError(literal("Google sign-in was closed before completion."));
            }

            return;
          }

          window.clearInterval(googleBrokerPollRef.current ?? 0);
          googleBrokerPollRef.current = null;
          popup.close();

          if (statusPayload.status !== "approved") {
            setIsGoogleSubmitting(false);
            setError(
              statusPayload.status === "expired"
                ? literal("Google sign-in expired. Try again.")
                : literal("Google sign-in is no longer available for this request. Try again."),
            );
            return;
          }

          const completeResponse = await fetch("/api/users/google/broker/complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ requestId: payload.requestId, rememberSession }),
          });

          if (!completeResponse.ok) {
            throw new Error(await readErrorMessage(completeResponse));
          }

          const completePayload = (await completeResponse.json()) as { user: PublicUser; userCount: number };
          const nextSession = await fetchCurrentSession();

          if (!nextSession.user || nextSession.user.id !== completePayload.user.id) {
            throw new Error(literal("Google sign-in finished, but the session was not established. Reload and try again."));
          }

          onSessionChange(nextSession);
          setLocalEmail("");
          setDisplayName("");
          setPassword("");
          setIsGoogleSubmitting(false);
        } catch (brokerError) {
          window.clearInterval(googleBrokerPollRef.current ?? 0);
          googleBrokerPollRef.current = null;
          popup.close();
          setIsGoogleSubmitting(false);
          setError(
            brokerError instanceof Error
              ? brokerError.message
              : literal("Unable to complete broker Google sign-in."),
          );
        }
      }, payload.pollIntervalMs);
    } catch (brokerError) {
      setIsGoogleSubmitting(false);
      setError(
        brokerError instanceof Error
          ? brokerError.message
          : literal("Unable to start broker Google sign-in."),
      );
    }
  }

  useEffect(() => {
    if (googleButtonRef.current && session.user) {
      googleButtonRef.current.innerHTML = "";
    }
  }, [session.user]);

  useEffect(() => {
    if (!showGoogleAuthUi || !hasDirectGoogleSignIn || !googleScriptReady || !googleButtonRef.current || session.user) {
      return;
    }

    const googleIdentity = window.google?.accounts?.id;

    if (!googleIdentity) {
      return;
    }

    googleButtonRef.current.innerHTML = "";

    if (!googleIdentityInitialized) {
      googleIdentity.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (!response.credential) {
            setError(literal("Google sign-in did not return a credential."));
            return;
          }

          void completeGoogleSignIn(response.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: "popup",
      });
      googleIdentityInitialized = true;
    }

    googleIdentity.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "medium",
      shape: "pill",
      text: "signin",
      width: 200,
      logo_alignment: "left",
    });
  }, [googleScriptReady, hasDirectGoogleSignIn, literal, session.user, session.userCount, showGoogleAuthUi]);

  function clearPendingBackupSelection() {
    setPendingBackupSnapshot(null);
    setPendingBackupFileName(null);
    setBackupRestoreConfirmed(false);
    setBackupSummary(null);
  }

  async function fetchCurrentSession() {
    const response = await fetch("/api/users/session", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return (await response.json()) as UserSessionStatus;
  }

  useEffect(() => {
    if (session.user?.role !== "admin") {
      setKnowledgeOverlapResults([]);
      setIsCheckingKnowledgeOverlaps(false);
      return;
    }

    const title = knowledgeTitle.trim();
    const content = knowledgeContent.trim();
    const tags = parseKnowledgeTags(knowledgeTags);
    const modelIds = parseScopedModelIds(knowledgeModelIds);
    const hasEnoughDraft = title.length >= 3 || content.length >= 80 || tags.length > 0;

    if (!hasEnoughDraft) {
      setKnowledgeOverlapResults([]);
      setIsCheckingKnowledgeOverlaps(false);
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsCheckingKnowledgeOverlaps(true);

        try {
          const response = await fetch("/api/admin/ai/context/overlaps", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: editingKnowledgeId,
              title,
              content,
              tags,
              providerIds: knowledgeProviderIds,
              modelIds,
              limit: 3,
            }),
          });

          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }

          const payload = (await response.json()) as { results: AiKnowledgeOverlapResult[] };

          if (!isCancelled) {
            setKnowledgeOverlapResults(payload.results);
          }
        } catch {
          if (!isCancelled) {
            setKnowledgeOverlapResults([]);
          }
        } finally {
          if (!isCancelled) {
            setIsCheckingKnowledgeOverlaps(false);
          }
        }
      })();
    }, 350);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [editingKnowledgeId, knowledgeContent, knowledgeEntries, knowledgeModelIds, knowledgeProviderIds, knowledgeTags, knowledgeTitle, session.user?.role]);

  const refreshUsers = useCallback(async () => {
    setIsLoadingUsers(true);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { users: ManagedUser[] };
      setManagedUsers(payload.users);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : literal("Unable to load users."),
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, [literal]);

  const refreshProviderConfigs = useCallback(async () => {
    setIsLoadingProviderConfigs(true);

    try {
      const response = await fetch("/api/admin/ai/providers", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { providers: AiProviderConfigSummary[] };
      setProviderConfigs(payload.providers);
    } catch (providerError) {
      setError(
        providerError instanceof Error
          ? providerError.message
          : literal("Unable to load AI provider settings."),
      );
    } finally {
      setIsLoadingProviderConfigs(false);
    }
  }, [literal]);

  const refreshProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);

    try {
      const response = await fetch("/api/admin/ai/profiles", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiProfilesResponse;
      setWorkspaceProfiles(payload.profiles);
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : literal("Unable to load assistant profiles."),
      );
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [literal]);

  const refreshWorkspaceTools = useCallback(async () => {
    setIsLoadingWorkspaceTools(true);

    try {
      const response = await fetch("/api/ai/tools", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiToolsResponse;
      setWorkspaceTools(payload.tools);
    } catch (toolError) {
      setError(
        toolError instanceof Error
          ? toolError.message
          : literal("Unable to load workspace tools."),
      );
    } finally {
      setIsLoadingWorkspaceTools(false);
    }
  }, [literal]);

  const refreshKnowledgeBases = useCallback(async () => {
    setIsLoadingKnowledgeBases(true);

    try {
      const response = await fetch("/api/admin/ai/knowledge-bases", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiKnowledgeBasesResponse;
      setKnowledgeBases(payload.knowledgeBases);
    } catch (knowledgeBaseError) {
      setError(
        knowledgeBaseError instanceof Error
          ? knowledgeBaseError.message
          : literal("Unable to load knowledge bases."),
      );
    } finally {
      setIsLoadingKnowledgeBases(false);
    }
  }, [literal]);

  function resetProfileForm() {
    setEditingProfileId(null);
    setProfileName("");
    setProfileDescription("");
    setProfileProviderId("ollama");
    setProfileModel("");
    setProfileSystemPrompt("");
    setProfileTemperature(0.4);
    setProfileUseKnowledge(true);
    setProfileGroundingMode("balanced");
    setProfileEnabledToolIds([]);
    setProfileKnowledgeBaseIds([]);
  }

  function resetKnowledgeBaseForm() {
    setEditingKnowledgeBaseId(null);
    setKnowledgeBaseName("");
    setKnowledgeBaseDescription("");
    setKnowledgeBaseEntryIds([]);
  }

  function toggleProfileTool(toolId: AiToolId) {
    setProfileEnabledToolIds((current) =>
      current.includes(toolId)
        ? current.filter((currentToolId) => currentToolId !== toolId)
        : [...current, toolId],
    );
  }

  function toggleProfileKnowledgeBase(knowledgeBaseId: string) {
    setProfileKnowledgeBaseIds((current) =>
      current.includes(knowledgeBaseId)
        ? current.filter((currentKnowledgeBaseId) => currentKnowledgeBaseId !== knowledgeBaseId)
        : [...current, knowledgeBaseId],
    );
  }

  function toggleKnowledgeBaseEntry(entryId: string) {
    setKnowledgeBaseEntryIds((current) =>
      current.includes(entryId)
        ? current.filter((currentEntryId) => currentEntryId !== entryId)
        : [...current, entryId],
    );
  }

  function startEditingProfile(profile: AiWorkspaceProfile) {
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setProfileDescription(profile.description);
    setProfileProviderId(profile.providerId);
    setProfileModel(profile.model);
    setProfileSystemPrompt(profile.systemPrompt);
    setProfileTemperature(profile.temperature);
    setProfileUseKnowledge(profile.useKnowledge);
    setProfileGroundingMode(profile.groundingMode);
    setProfileEnabledToolIds(profile.enabledToolIds);
    setProfileKnowledgeBaseIds(profile.knowledgeBaseIds);
  }

  function startEditingKnowledgeBase(knowledgeBase: AiKnowledgeBase) {
    setEditingKnowledgeBaseId(knowledgeBase.id);
    setKnowledgeBaseName(knowledgeBase.name);
    setKnowledgeBaseDescription(knowledgeBase.description);
    setKnowledgeBaseEntryIds(knowledgeBase.entryIds);
  }

  async function saveProfile() {
    setIsSavingProfile(true);
    setError(null);
    setProfileSummary(null);

    try {
      const response = await fetch("/api/admin/ai/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingProfileId,
          name: profileName,
          description: profileDescription,
          providerId: profileProviderId,
          model: profileModel,
          systemPrompt: profileSystemPrompt,
          temperature: profileTemperature,
          useKnowledge: profileUseKnowledge,
          groundingMode: profileGroundingMode,
          enabledToolIds: profileEnabledToolIds,
          knowledgeBaseIds: profileKnowledgeBaseIds,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiProfilesResponse;
      setWorkspaceProfiles(payload.profiles);
      setProfileSummary(editingProfileId
        ? literal("Updated profile \"{name}\".", { name: profileName.trim() })
        : literal("Saved profile \"{name}\".", { name: profileName.trim() }));
      setProfileSummaryTone("success");
      resetProfileForm();
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : literal("Unable to save the assistant profile."),
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function saveKnowledgeBase() {
    setIsSavingKnowledgeBase(true);
    setError(null);
    setKnowledgeBaseSummary(null);

    try {
      const response = await fetch("/api/admin/ai/knowledge-bases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingKnowledgeBaseId,
          name: knowledgeBaseName,
          description: knowledgeBaseDescription,
          entryIds: knowledgeBaseEntryIds,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiKnowledgeBasesResponse;
      setKnowledgeBases(payload.knowledgeBases);
      setKnowledgeBaseSummary(editingKnowledgeBaseId
        ? literal("Updated knowledge base \"{name}\".", { name: knowledgeBaseName.trim() })
        : literal("Saved knowledge base \"{name}\".", { name: knowledgeBaseName.trim() }));
      resetKnowledgeBaseForm();
    } catch (knowledgeBaseError) {
      setError(
        knowledgeBaseError instanceof Error
          ? knowledgeBaseError.message
          : literal("Unable to save the knowledge base."),
      );
    } finally {
      setIsSavingKnowledgeBase(false);
    }
  }

  async function deleteProfile(id: string) {
    setBusyProfileId(id);
    setError(null);
    setProfileSummary(null);

    try {
      const response = await fetch("/api/admin/ai/profiles", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiProfilesResponse;
      setWorkspaceProfiles(payload.profiles);

      if (editingProfileId === id) {
        resetProfileForm();
      }
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : literal("Unable to delete the assistant profile."),
      );
    } finally {
      setBusyProfileId(null);
    }
  }

  async function deleteKnowledgeBase(id: string) {
    setBusyKnowledgeBaseId(id);
    setError(null);
    setKnowledgeBaseSummary(null);

    try {
      const response = await fetch("/api/admin/ai/knowledge-bases", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiKnowledgeBasesResponse;
      setKnowledgeBases(payload.knowledgeBases);

      if (editingKnowledgeBaseId === id) {
        resetKnowledgeBaseForm();
      }
    } catch (knowledgeBaseError) {
      setError(
        knowledgeBaseError instanceof Error
          ? knowledgeBaseError.message
          : literal("Unable to delete the knowledge base."),
      );
    } finally {
      setBusyKnowledgeBaseId(null);
    }
  }

  async function saveAnthropicApiKey(clearStoredKey = false) {
    setIsSavingAnthropicApiKey(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/ai/providers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "anthropic",
          apiKey: clearStoredKey ? "" : anthropicApiKeyDraft,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { providers: AiProviderConfigSummary[] };
      setProviderConfigs(payload.providers);
      setAnthropicApiKeyDraft("");
      window.dispatchEvent(new Event(AI_PROVIDER_CONFIG_CHANGED_EVENT));
    } catch (providerError) {
      setError(
        providerError instanceof Error
          ? providerError.message
          : literal("Unable to save the Anthropic API key."),
      );
    } finally {
      setIsSavingAnthropicApiKey(false);
    }
  }

  async function saveOpenAiApiKey(clearStoredKey = false) {
    setIsSavingOpenAiApiKey(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/ai/providers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId: "openai",
          apiKey: clearStoredKey ? "" : openAiApiKeyDraft,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { providers: AiProviderConfigSummary[] };
      setProviderConfigs(payload.providers);
      setOpenAiApiKeyDraft("");
      window.dispatchEvent(new Event(AI_PROVIDER_CONFIG_CHANGED_EVENT));
    } catch (providerError) {
      setError(
        providerError instanceof Error
          ? providerError.message
          : literal("Unable to save the OpenAI API key."),
      );
    } finally {
      setIsSavingOpenAiApiKey(false);
    }
  }

  const refreshKnowledgeEntries = useCallback(async () => {
    setIsLoadingKnowledge(true);

    try {
      const response = await fetch("/api/admin/ai/context", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { entries: AiKnowledgeEntry[] };
      setKnowledgeEntries(payload.entries);
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to load shared knowledge entries."),
      );
    } finally {
      setIsLoadingKnowledge(false);
    }
  }, [literal]);

  const refreshKnowledgeModelSuggestions = useCallback(async () => {
    setIsLoadingKnowledgeModelSuggestions(true);

    try {
      const results = await Promise.all(
        KNOWLEDGE_PROVIDER_OPTIONS.map(async (provider) => {
          const response = await fetch(`/api/ai/models?providerId=${encodeURIComponent(provider.id)}`, {
            cache: "no-store",
          });

          if (!response.ok) {
            return [provider.id, []] as const;
          }

          const payload = (await response.json()) as AiModelsResponse;
          return [provider.id, Array.from(new Set(payload.models.map((model) => model.name)))] as const;
        }),
      );

      setKnownModelsByProvider(Object.fromEntries(results));
    } finally {
      setIsLoadingKnowledgeModelSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (session.user?.role === "admin") {
      void refreshUsers();
      void refreshProviderConfigs();
      void refreshProfiles();
      void refreshWorkspaceTools();
      void refreshKnowledgeBases();
      void refreshKnowledgeEntries();
      void refreshKnowledgeModelSuggestions();
      return;
    }

    setManagedUsers([]);
    setProviderConfigs([]);
    setWorkspaceProfiles([]);
    setWorkspaceTools([]);
    setKnowledgeBases([]);
    setKnowledgeEntries([]);
    setKnowledgeOverlapResults([]);
    setKnownModelsByProvider({});
  }, [refreshKnowledgeBases, refreshKnowledgeEntries, refreshKnowledgeModelSuggestions, refreshProfiles, refreshProviderConfigs, refreshUsers, refreshWorkspaceTools, session.user?.id, session.user?.role]);

  function buildKnowledgeImportMetadata() {
    return {
      title: knowledgeTitle.trim() || undefined,
      source: knowledgeSource.trim() && knowledgeSource.trim() !== "manual" ? knowledgeSource.trim() : undefined,
      tags: parseKnowledgeTags(knowledgeTags),
      providerIds: knowledgeProviderIds,
      modelIds: parseScopedModelIds(knowledgeModelIds),
    };
  }

  async function importKnowledgeFromUrl() {
    const url = knowledgeImportUrl.trim();

    if (!url) {
      setError(literal("Knowledge import URL is required."));
      return;
    }

    setIsImportingKnowledge(true);
    setError(null);
    setKnowledgeSummary(null);

    try {
      const response = await fetch("/api/admin/ai/context/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          ...buildKnowledgeImportMetadata(),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { entry: AiKnowledgeEntry };
      setKnowledgeImportUrl("");
      setKnowledgeSummary(`Imported \"${payload.entry.title}\" from ${payload.entry.source}.`);
      setKnowledgeSummaryTone("success");
      await refreshKnowledgeEntries();
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to import shared knowledge from the URL."),
      );
    } finally {
      setIsImportingKnowledge(false);
    }
  }

  async function importKnowledgeFile(file: File) {
    setIsImportingKnowledge(true);
    setError(null);
    setKnowledgeSummary(null);

    try {
      const formData = new FormData();
      const metadata = buildKnowledgeImportMetadata();
      formData.append("file", file);

      if (metadata.title) {
        formData.append("title", metadata.title);
      }

      if (metadata.source) {
        formData.append("source", metadata.source);
      }

      if (metadata.tags.length > 0) {
        formData.append("tags", metadata.tags.join(","));
      }

      if (metadata.providerIds.length > 0) {
        formData.append("providerIds", metadata.providerIds.join(","));
      }

      if (metadata.modelIds.length > 0) {
        formData.append("modelIds", metadata.modelIds.join(","));
      }

      const response = await fetch("/api/admin/ai/context/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { entry: AiKnowledgeEntry };
      setKnowledgeSummary(`Imported \"${payload.entry.title}\" from ${file.name}.`);
      setKnowledgeSummaryTone("success");
      await refreshKnowledgeEntries();
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to import the selected knowledge file."),
      );
    } finally {
      setIsImportingKnowledge(false);

      if (knowledgeFileInputRef.current) {
        knowledgeFileInputRef.current.value = "";
      }
    }
  }

  async function saveKnowledgeEntry() {
    setIsSavingKnowledge(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/ai/context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingKnowledgeId,
          title: knowledgeTitle,
          content: knowledgeContent,
          source: knowledgeSource,
          tags: parseKnowledgeTags(knowledgeTags),
          providerIds: knowledgeProviderIds,
          modelIds: parseScopedModelIds(knowledgeModelIds),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setKnowledgeTitle("");
      setKnowledgeSource("manual");
      setKnowledgeTags("");
      setKnowledgeProviderIds([]);
      setKnowledgeModelIds("");
      setKnowledgeContent("");
        setEditingKnowledgeId(null);
        setKnowledgeOverlapResults([]);
      await refreshKnowledgeEntries();
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to save the shared knowledge entry."),
      );
    } finally {
      setIsSavingKnowledge(false);
    }
  }

  async function deleteKnowledgeEntry(id: string) {
    setBusyKnowledgeId(id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/ai/context?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await refreshKnowledgeEntries();
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to delete the shared knowledge entry."),
      );
    } finally {
      setBusyKnowledgeId(null);
    }
  }

  function startEditingKnowledgeEntry(entry: AiKnowledgeEntry) {
    setEditingKnowledgeId(entry.id);
    setKnowledgeTitle(entry.title);
    setKnowledgeSource(entry.source);
    setKnowledgeTags(entry.tags.join(", "));
    setKnowledgeProviderIds(entry.providerIds);
    setKnowledgeModelIds(entry.modelIds.join(", "));
    setKnowledgeContent(entry.content);

    window.requestAnimationFrame(() => {
      knowledgeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      knowledgeTitleInputRef.current?.focus();
      knowledgeTitleInputRef.current?.select();
    });
  }

  function resetKnowledgeForm() {
    setEditingKnowledgeId(null);
    setKnowledgeTitle("");
    setKnowledgeSource("manual");
    setKnowledgeTags("");
    setKnowledgeProviderIds([]);
    setKnowledgeModelIds("");
    setKnowledgeContent("");
    setKnowledgeImportUrl("");
    setKnowledgeOverlapResults([]);
    setKnowledgeSummary(null);
  }

  async function runKnowledgeDebugSearch() {
    const query = knowledgeDebugQuery.trim();

    if (!query) {
      setKnowledgeDebugResults([]);
      setKnowledgeDebugResponse(null);
      return;
    }

    setIsRunningKnowledgeDebug(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams({
        q: query,
        limit: "5",
      });

      if (knowledgeDebugProviderId !== "all") {
        searchParams.set("providerId", knowledgeDebugProviderId);
      }

      if (knowledgeDebugModelId.trim()) {
        searchParams.set("modelId", knowledgeDebugModelId.trim());
      }

      const response = await fetch(`/api/admin/ai/context/debug?${searchParams.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as AiKnowledgeDebugResponse;
      setKnowledgeDebugResponse(payload);
      setKnowledgeDebugResults(payload.results);
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : literal("Unable to run the shared knowledge debug search."),
      );
    } finally {
      setIsRunningKnowledgeDebug(false);
    }
  }

  function toggleKnowledgeDebugModelId(modelId: string) {
    setKnowledgeDebugModelId((current) => current === modelId ? "" : modelId);
  }

  const knowledgeDebugMapNodes = buildKnowledgeDebugMapNodes(knowledgeDebugResults);

  function toggleKnowledgeProviderScope(providerId: AiProviderId) {
    setKnowledgeProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((entry) => entry !== providerId)
        : [...current, providerId],
    );
  }

  function getSuggestedModels(providerIds: AiProviderId[]) {
    const scopedProviderIds = providerIds.length > 0
      ? providerIds
      : KNOWLEDGE_PROVIDER_OPTIONS.map((provider) => provider.id);

    return Array.from(new Set(scopedProviderIds.flatMap((providerId) => knownModelsByProvider[providerId] ?? [])));
  }

  function toggleKnowledgeModelScope(modelId: string) {
    const currentModelIds = parseScopedModelIds(knowledgeModelIds);
    const nextModelIds = currentModelIds.includes(modelId)
      ? currentModelIds.filter((entry) => entry !== modelId)
      : [...currentModelIds, modelId];

    setKnowledgeModelIds(nextModelIds.join(", "));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim();
    const submittedDisplayName = String(formData.get("displayName") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");

    if (!submittedEmail || !submittedPassword) {
      setError(literal("Email address and password are required."));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setAuthSummary(null);
    setAuthDialogMode(null);
    setAuthDialogMessage(null);

    try {
      const response = await fetch(
        mode === "login" ? "/api/users/login" : "/api/users/register",
        {
          credentials: "same-origin",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: submittedEmail,
            displayName: submittedDisplayName,
            password: submittedPassword,
            rememberSession,
          }),
        },
      );

      if (!response.ok) {
        const message = await readErrorMessage(response);

        if (mode === "login" && message === "Invalid email address or password.") {
          setAuthDialogMode("invalid-login");
          setAuthDialogMessage(literal("That sign-in attempt did not match our local credential record. If this was your account, you can start a password reset sequence."));
          return;
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as {
        expiresAt?: string;
        user?: PublicUser;
        verificationRequired?: boolean;
        verificationTarget?: string;
      };

      if (payload.verificationRequired && payload.expiresAt && payload.verificationTarget) {
        setVerificationChallenge({
          email: payload.verificationTarget,
          expiresAt: payload.expiresAt,
          purpose: mode,
        });
        setVerificationCode("");
        setError(null);
        return;
      }

      const nextSession = await fetchCurrentSession();

      if (!payload.user || !nextSession.user || nextSession.user.id !== payload.user.id) {
        throw new Error(literal("Sign-in finished, but the session was not established. Reload and try again."));
      }

      onSessionChange(nextSession);
      setLocalEmail("");
      setDisplayName("");
      setPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : literal("Unable to complete user authentication."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function dismissAuthDialog() {
    setAuthDialogMode(null);
    setAuthDialogMessage(null);
  }

  async function requestPasswordReset() {
    if (!localEmail.trim()) {
      setError(literal("Enter your email address first so the reset code goes to the right account."));
      dismissAuthDialog();
      return;
    }

    setIsResettingPassword(true);
    setError(null);
    setAuthSummary(null);

    try {
      const response = await fetch("/api/users/password/reset/request", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: localEmail,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        expiresAt?: string;
        resetTarget?: string;
      };

      if (!response.ok) {
        if (response.status === 404) {
          setPasswordResetChallenge(null);
          setAuthDialogMode("user-missing");
          setAuthDialogMessage(payload.error ?? literal("No local account matched that email address."));
          return;
        }

        throw new Error(payload.error ?? literal("Unable to start password reset."));
      }

      if (!payload.expiresAt || !payload.resetTarget) {
        throw new Error(literal("Password reset started, but no verification target was returned."));
      }

      setPasswordResetChallenge({
        email: payload.resetTarget,
        expiresAt: payload.expiresAt,
      });
      setResetCode("");
      setResetPasswordDraft("");
      setPassword("");
      setAuthDialogMode("password-reset");
      setAuthDialogMessage(literal("A password reset authorization code has been sent. Enter the code and your new password below."));
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : literal("Unable to start password reset."),
      );
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function completePasswordReset() {
    if (!passwordResetChallenge) {
      return;
    }

    if (!resetCode.trim()) {
      setError(literal("Enter the 6-digit password reset code from your email."));
      return;
    }

    if (passwordResetSecondsRemaining <= 0) {
      setError(literal("That password reset code has expired. Request another code and try again."));
      return;
    }

    if (resetPasswordDraft.trim().length < 8) {
      setError(literal("New password must be at least 8 characters long."));
      return;
    }

    setIsCompletingPasswordReset(true);
    setError(null);
    setAuthSummary(null);

    try {
      const response = await fetch("/api/users/password/reset/complete", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: resetCode,
          email: passwordResetChallenge.email,
          nextPassword: resetPasswordDraft,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setMode("login");
      setPassword(resetPasswordDraft);
      setPasswordResetChallenge(null);
      setResetCode("");
      setResetPasswordDraft("");
      setAuthDialogMode(null);
      setAuthDialogMessage(null);
      setAuthSummary(literal("Password reset complete. Sign in with your new password."));
      setAuthSummaryTone("success");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : literal("Unable to reset the password."),
      );
    } finally {
      setIsCompletingPasswordReset(false);
    }
  }

  async function submitVerificationCode() {
    if (!verificationChallenge) {
      return;
    }

    if (!verificationCode.trim()) {
      setError(literal("Enter the 6-digit verification code from your email."));
      return;
    }

    if (verificationSecondsRemaining <= 0) {
      setError(literal("That verification code has expired. Request a new one by signing in again."));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/users/verify", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: verificationCode,
          email: verificationChallenge.email,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextSession = await fetchCurrentSession();

      if (!nextSession.user) {
        throw new Error(literal("Verification finished, but the session was not established. Reload and try again."));
      }

      onSessionChange(nextSession);
      setVerificationChallenge(null);
      setVerificationCode("");
      setLocalEmail("");
      setDisplayName("");
      setPassword("");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : literal("Unable to verify that email code."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    if (onRequestLogout) {
      await onRequestLogout();
      return;
    }

    setError(null);

    try {
      const response = await fetch("/api/users/logout", {
        credentials: "same-origin",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextSession = await fetchCurrentSession();

      if (nextSession.user) {
        throw new Error(literal("Sign-out did not clear the active session. Reload and try again."));
      }

      onSessionChange(nextSession);
      setManagedUsers([]);
      setVerificationChallenge(null);
      setVerificationCode("");
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : literal("Unable to sign out."),
      );
    }
  }

  async function saveAccountProfile() {
    if (!session.user) {
      return;
    }

    setIsSavingAccountProfile(true);
    setError(null);
    setAccountSummary(null);

    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: accountDisplayName,
          email: accountEmail,
          preferredModel: accountPreferredModel,
          preferredTemperature: accountPreferredTemperature,
          preferredSystemPrompt: accountPreferredSystemPrompt,
          preferredVoiceTranscriptionLanguage: accountPreferredVoiceLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextSession = await fetchCurrentSession();
      onSessionChange(nextSession);
      setAccountSummary(literal("Account details and assistant style saved."));
      setAccountSummaryTone("success");
    } catch (accountError) {
      setError(
        accountError instanceof Error
          ? accountError.message
          : literal("Unable to save your account details."),
      );
    } finally {
      setIsSavingAccountProfile(false);
    }
  }

  async function resetPassword() {
    if (!session.user) {
      return;
    }

    setIsSavingPassword(true);
    setError(null);
    setAccountSummary(null);

    try {
      const response = await fetch("/api/users/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: currentPasswordDraft,
          nextPassword: nextPasswordDraft,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setCurrentPasswordDraft("");
      setNextPasswordDraft("");
      setAccountSummary(literal("Password updated for this local account."));
      setAccountSummaryTone("success");
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : literal("Unable to reset your password."),
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function changeRole(userId: string, role: PublicUser["role"]) {
    setBusyUserId(userId);
    setPendingDeleteUserId((current) => (current === userId ? null : current));
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser };
      setManagedUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, ...payload.user } : user)),
      );
    } catch (roleError) {
      setError(
        roleError instanceof Error
          ? roleError.message
          : literal("Unable to update the user role."),
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function changeLoginVerificationPolicy(userId: string, requireEmailVerificationOnLogin: boolean) {
    setBusyUserId(userId);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requireEmailVerificationOnLogin }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser };
      setManagedUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, ...payload.user } : user)),
      );

      if (session.user?.id === userId) {
        const nextSession = await fetchCurrentSession();
        onSessionChange(nextSession);
      }
    } catch (verificationPolicyError) {
      setError(
        verificationPolicyError instanceof Error
          ? verificationPolicyError.message
          : literal("Unable to update the login verification setting."),
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeUser(user: ManagedUser) {
    setBusyUserId(user.id);
    setError(null);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        user: PublicUser;
        deletedConversationCount: number;
      };

      setManagedUsers((current) => current.filter((managedUser) => managedUser.id !== user.id));
      setPendingDeleteUserId(null);
      setBackupSummary(
        literal("{name} was deleted. Removed {countLabel}.", {
          name: payload.user.displayName,
          countLabel: formatSavedConversationCountLabel(payload.deletedConversationCount, activeUiLanguage),
        }),
      );
      setBackupSummaryTone("warning");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : literal("Unable to delete the user."),
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function exportWorkspaceBackup() {
    setIsExportingBackup(true);
    setError(null);
    setBackupSummary(null);
    setBackupSummaryTone("success");
    setBackupRestoreConfirmed(false);

    try {
      const response = await fetch("/api/admin/system/backup", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const exportedAt = response.headers.get("content-disposition")?.match(/oload-backup-([^\"]+)\.json/)?.[1];
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = exportedAt ? `oload-backup-${exportedAt}.json` : `oload-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(downloadUrl);
      setBackupSummary(literal("Workspace backup exported."));
      setBackupSummaryTone("success");
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : literal("Unable to export the workspace backup."),
      );
    } finally {
      setIsExportingBackup(false);
    }
  }

  async function handleBackupFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setBackupSummary(null);
    setBackupSummaryTone("success");

    try {
      const parsed = JSON.parse(await file.text()) as WorkspaceBackupSnapshot;

      if (
        typeof parsed.version !== "number"
        || !Array.isArray(parsed.users)
        || !Array.isArray(parsed.conversations)
        || !Array.isArray(parsed.activityEvents)
        || !Array.isArray(parsed.jobHistory)
      ) {
        throw new Error(literal("That backup file is not in the expected workspace snapshot format."));
      }

      setPendingBackupSnapshot(parsed);
      setPendingBackupFileName(file.name);
      setBackupSummary(
        literal("Loaded backup {fileName} with {userCount} users, {conversationCount} conversations, {activityCount} activity events, and {jobCount} jobs.", {
          fileName: file.name,
          userCount: parsed.users.length,
          conversationCount: parsed.conversations.length,
          activityCount: parsed.activityEvents.length,
          jobCount: parsed.jobHistory.length,
        }),
      );
      setBackupSummaryTone("success");
    } catch (backupError) {
      clearPendingBackupSelection();
      setError(
        backupError instanceof Error
          ? backupError.message
          : literal("Unable to read the selected backup file."),
      );
    } finally {
      event.target.value = "";
    }
  }

  async function importWorkspaceBackup() {
    if (!pendingBackupSnapshot) {
      return;
    }

    setIsImportingBackup(true);
    setError(null);

    try {
      const previousUser = session.user;
      const response = await fetch("/api/admin/system/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pendingBackupSnapshot),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const sessionResponse = await fetch("/api/users/session", { cache: "no-store" });

      if (!sessionResponse.ok) {
        throw new Error(await readErrorMessage(sessionResponse));
      }

      const nextSession = (await sessionResponse.json()) as UserSessionStatus;
      const restoreOutcome = describeRestoreOutcome(previousUser, nextSession, activeUiLanguage);
      onSessionChange(nextSession);
      clearPendingBackupSelection();
      setManagedUsers([]);
      setLocalEmail("");
      setDisplayName("");
      setPassword("");
      setMode(nextSession.userCount === 0 ? "register" : "login");

      if (nextSession.user?.role === "admin") {
        await refreshUsers();
      }

      setBackupSummary(restoreOutcome.summary);
      setBackupSummaryTone(restoreOutcome.tone);
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : literal("Unable to restore the workspace backup."),
      );
    } finally {
      setIsImportingBackup(false);
    }
  }

  return (
    <section
      className={`glass-panel rounded-[36px] ${compact ? "px-4 pb-4 pt-5 shadow-none sm:px-5 sm:pb-5 sm:pt-6" : isPageSurface ? "p-5 sm:p-6" : "p-6 sm:p-8"}`}
      data-help-context="access"
    >
      {!compact ? (
        <div className={`flex flex-col items-start gap-4 ${isPageSurface ? "theme-surface-elevated rounded-[28px] px-5 py-5" : "sm:flex-row sm:justify-between"}`}>
          <div>
            <p className="section-label text-xs font-semibold">{literal("Accounts")}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {isPageSurface
                ? isAdminSession
                  ? literal("Identity, providers, knowledge, and backup")
                  : literal("Account, preferences, and sign-in")
                : isAdminSession
                  ? literal("Users and backup")
                  : literal("Account and sign-in")}
            </h2>
            {isPageSurface ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
                {isAdminSession
                  ? literal("Access is the administrative control surface for local identity, hosted-provider credentials, shared knowledge grounding, and workspace recovery operations.")
                  : literal("Use this page to manage your profile details, quick-help preference, password, and current sign-in session without exposing admin-only operations.")}
              </p>
            ) : null}
          </div>
          <div className="ui-pill ui-pill-surface text-sm">
            {literal("{count} users", { count: session.userCount })}
          </div>
        </div>
      ) : null}

      {isPageSurface ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">{literal("Signed-in user")}</p>
            <p className="mt-2 text-base font-semibold text-foreground">{session.user?.displayName ?? literal("No active user")}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{session.user ? literal("{role} via {provider} auth.", { role: formatRoleLabel(session.user.role, activeUiLanguage), provider: session.user.authProvider === "google" ? literal("Google") : literal("local") }) : literal("Local access gate only.")}</p>
          </div>
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">{isAdminSession ? literal("Providers ready") : literal("Quick help")}</p>
            <p className="mt-2 text-base font-semibold text-foreground">{isAdminSession ? configuredProviderCount : isQuickHelpEnabled ? literal("Enabled") : literal("Muted")}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{isAdminSession ? literal("Hosted gateway providers currently configured for use.") : literal("Contextual help cards follow this device-local preference.")}</p>
          </div>
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">{literal("Access posture")}</p>
            <p className="mt-2 text-base font-semibold text-foreground">{session.user?.role === "admin" ? literal("Administrative") : session.user ? literal("Self-service") : literal("Entry required")}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{isAdminSession ? literal("Backup restore and role changes stay gated to admin sessions.") : literal("Only your own account settings appear here outside admin sessions.")}</p>
          </div>
        </div>
      ) : null}

      {isAdminSession ? (
        <div className="mt-4">
          <AppUpdateMonitor
            canManageUpdates
            displayMode="inline"
            uiLanguagePreference={activeUiLanguage}
          />
        </div>
      ) : null}

      {session.user ? (
        <div className={`mt-6 grid gap-6 ${isPageSurface ? "lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]" : ""}`}>
          <div className={`rounded-[28px] ${isPageSurface ? "theme-surface-elevated px-5 py-5" : "theme-surface-soft p-5"}`}>
            <p className="text-lg font-semibold text-foreground">{session.user.displayName}</p>
            <p className="mt-1 text-sm text-muted">{session.user.authProvider === "local" ? session.user.email ?? session.user.username : `@${session.user.username}`}</p>
            {session.user.email ? (
              <p className="mt-1 text-sm text-muted">{session.user.email}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <p className="ui-pill ui-pill-success inline-flex text-xs">
                {formatRoleLabel(session.user.role, activeUiLanguage)}
              </p>
              <p className="ui-pill ui-pill-soft inline-flex border border-line text-xs text-muted">
                {session.user.authProvider === "google" ? literal("Google account") : literal("Local account")}
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {isAdminSession
                ? literal("Conversations remain scoped to the signed-in user while this session also unlocks role management, provider configuration, workspace recovery, and model operations. Your assistant style stays personal to this account.")
                : literal("Conversations remain scoped to your signed-in account. This view keeps only your own profile, assistant style, preference, and password controls visible.")}
            </p>
            <button
              className="ui-button ui-button-secondary mt-5 w-full px-4 py-2 text-sm sm:w-auto"
              data-help-id="access.logout"
              type="button"
              onClick={logout}
            >
              {t("signOut")}
            </button>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("Account settings")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Manage your profile details, assistant style, quick-help preference, and local password from one place.")}
                </p>
              </div>
              <span className="ui-pill ui-pill-surface text-xs">
                {session.user.authProvider === "google" ? literal("Google sign-in") : literal("Local sign-in")}
              </span>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-foreground">{literal("Profile")}</p>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    {literal("Display name")}
                    <input
                      className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal text-foreground outline-none"
                      autoComplete="name"
                      value={accountDisplayName}
                      onChange={(event) => setAccountDisplayName(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    {literal("Email")}
                    <input
                      className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal text-foreground outline-none disabled:cursor-not-allowed disabled:bg-neutral-100"
                      autoComplete="email"
                      disabled
                      placeholder={session.user.authProvider === "google" ? literal("Managed by Google sign-in") : literal("Used for local sign-in and verification")}
                      type="email"
                      value={accountEmail}
                      onChange={(event) => setAccountEmail(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    {t("defaultModel")}
                    <select
                      className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal text-foreground outline-none"
                      value={accountPreferredModel}
                      onChange={(event) => setAccountPreferredModel(event.target.value)}
                    >
                      <option value="">{t("useFirstAvailableLocalModel")}</option>
                      {availableModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    {t("voiceTranscription")}
                    <div className="mt-2">
                      <VoiceLanguageSelect
                        ariaLabel={t("voiceTranscription")}
                        buttonClassName="flex w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left text-sm font-normal text-foreground"
                        flagClassName="h-5 w-7 shrink-0 rounded-[4px]"
                        listClassName="theme-surface-elevated absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-[24px] p-2 backdrop-blur-xl"
                        optionClassName={(isSelected) => `flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left ${isSelected ? "bg-[rgba(188,95,61,0.12)]" : "hover:bg-black/5"}`}
                        textClassName="text-sm font-normal text-foreground"
                        value={accountPreferredVoiceLanguage}
                        onChange={setAccountPreferredVoiceLanguage}
                      />
                    </div>
                  </label>
                  <div>
                    <div className="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                      <span>{t("replyStyle")}</span>
                      <span>{accountPreferredTemperature.toFixed(1)}</span>
                    </div>
                    <input
                      className="mt-3 w-full accent-[var(--accent)]"
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.1"
                      value={accountPreferredTemperature}
                      onChange={(event) => setAccountPreferredTemperature(Number(event.target.value))}
                    />
                    <p className="mt-2 text-xs leading-6 text-muted">
                      {literal("Lower stays more focused. Higher feels more flexible and creative.")}
                    </p>
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    {literal("Assistant style")}
                    <textarea
                      className="mt-2 min-h-36 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal leading-7 text-foreground outline-none"
                      value={accountPreferredSystemPrompt}
                      onChange={(event) => setAccountPreferredSystemPrompt(event.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">
                  {session.user.authProvider === "google"
                    ? literal("Google-managed accounts keep their provider email. You can still change the display name plus the defaults used when you start a new chat.")
                    : literal("Local accounts now sign in with email and use 6-digit verification codes when required. The login email is shown here and model, voice mode, reply style, and assistant style stay personal to this account.")}
                </p>
                <button
                  className="ui-button ui-button-primary mt-4 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled={isSavingAccountProfile}
                  type="button"
                  onClick={() => {
                    void saveAccountProfile();
                  }}
                >
                  {isSavingAccountProfile ? t("savingProfile") : t("saveProfile")}
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] bg-white px-4 py-4">
                  <label
                    className="theme-surface-soft flex items-start gap-3 rounded-[18px] px-3 py-3 text-sm text-foreground"
                    data-help-id="command.quick-help-toggle"
                  >
                    <input
                      checked={isQuickHelpEnabled}
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      type="checkbox"
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setIsQuickHelpEnabled(enabled);
                        writeQuickHelpEnabled(enabled);
                      }}
                    />
                    <span>
                      <span className="block font-semibold text-foreground">{literal("Quick help popovers")}</span>
                      <span className="mt-1 block text-xs leading-6 text-muted">
                        {quickHelpPreferenceSummary}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted/85">
                        {quickHelpHint?.summary ?? literal("Hover or long-press for quick help cards that auto-dismiss after a short pause.")}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="rounded-[24px] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{literal("Password")}</p>
                  {session.user.authProvider === "local" ? (
                    <>
                      <div className="mt-4 space-y-3">
                        <input
                          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                          autoComplete="current-password"
                          placeholder={literal("Current password")}
                          type="password"
                          value={currentPasswordDraft}
                          onChange={(event) => setCurrentPasswordDraft(event.target.value)}
                        />
                        <input
                          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                          autoComplete="new-password"
                          placeholder={literal("New password")}
                          type="password"
                          value={nextPasswordDraft}
                          onChange={(event) => setNextPasswordDraft(event.target.value)}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-6 text-muted">
                        {literal("Local password resets require your current password and a new password with at least 8 characters.")}
                      </p>
                      <button
                        className="ui-button ui-button-secondary mt-4 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        disabled={isSavingPassword}
                        type="button"
                        onClick={() => {
                          void resetPassword();
                        }}
                      >
                        {isSavingPassword ? literal("Updating...") : literal("Update password")}
                      </button>
                    </>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-muted">
                      {literal("Google-managed accounts do not use a local password here. Use your Google account security settings if you need to rotate credentials.")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {accountSummary ? (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                  accountSummaryTone === "warning"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-emerald-50 text-emerald-900"
                }`}
              >
                {accountSummary}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <form className={`${compact ? "space-y-4" : "mt-5 space-y-4 sm:mt-6"}`} onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <button
              className={`ui-button min-h-[3.5rem] justify-center px-4 py-3 text-sm whitespace-nowrap ${
                mode === "login"
                  ? "ui-button-primary"
                  : "ui-button-secondary"
              }`}
              data-help-id="access.mode.login"
              type="button"
              onClick={() => setMode("login")}
            >
              {literal("Sign In")}
            </button>
            <button
              className={`ui-button min-h-[3.5rem] justify-center px-4 py-3 text-sm ${
                mode === "register"
                  ? "ui-button-primary"
                  : "ui-button-secondary"
              }`}
              data-help-id="access.mode.register"
              type="button"
              onClick={() => setMode("register")}
            >
              {literal("Create account")}
            </button>
          </div>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            autoComplete="email"
            name="email"
            placeholder={literal("Email address")}
            type="email"
            value={localEmail}
            onChange={(event) => setLocalEmail(event.target.value)}
          />
          {mode === "register" ? (
            <input
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              autoComplete="name"
              name="displayName"
              placeholder={literal("Display name")}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          ) : null}
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            name="password"
            placeholder={literal("Password")}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label className="theme-surface-soft flex items-start gap-3 rounded-[22px] px-4 py-3 text-sm text-foreground">
            <input
              checked={rememberSession}
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              type="checkbox"
              onChange={(event) => setRememberSession(event.target.checked)}
            />
            <span>
              <span className="block font-semibold text-foreground">{literal("Stay logged in on this device")}</span>
              <span className="mt-1 block text-xs leading-6 text-muted">
                {literal("Checked keeps this device signed in for up to 7 days. Unchecked ends the session when the browser closes.")}
              </span>
            </span>
          </label>
          {authSummary ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                authSummaryTone === "warning"
                  ? "bg-amber-50 text-amber-900"
                  : "bg-emerald-50 text-emerald-900"
              }`}
            >
              {authSummary}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
          {verificationChallenge ? (
            <div className="rounded-[24px] border border-line bg-white px-4 py-4">
              <p className="text-sm font-semibold text-foreground">{literal("Email verification required")}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {verificationSecondsRemaining > 0
                  ? literal("Enter the 6-digit code sent to {email}. This code expires in {seconds} second(s).", {
                    email: verificationChallenge.email,
                    seconds: verificationSecondsRemaining,
                  })
                  : literal("Enter the 6-digit code sent to {email}. This code has expired. Submit the form again to request a new one.", {
                    email: verificationChallenge.email,
                  })}
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={literal("6-digit code")}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  className="ui-button ui-button-primary w-full px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled={isSubmitting || verificationSecondsRemaining <= 0}
                  type="button"
                  onClick={() => {
                    void submitVerificationCode();
                  }}
                >
                  {isSubmitting ? literal("Verifying...") : literal("Verify email")}
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-sm leading-6 text-muted">
            {session.userCount === 0
              ? literal("The first account becomes admin. Later accounts start as operators. Local accounts sign in with email addresses.")
              : literal("Sign in with your email address to access saved conversations and role-based controls.")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="ui-button ui-button-primary min-h-[44px] w-full whitespace-nowrap px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              data-help-id="access.submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? mode === "login"
                  ? literal("Signing In...")
                  : literal("Creating account...")
                : mode === "login"
                  ? literal("Sign In")
                  : literal("Create account")}
            </button>
            {mode === "login" && showGoogleAuthUi ? (
              isBrokerGoogleSignIn ? (
                <button
                  className="ui-button ui-button-secondary min-h-[44px] w-full justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled={isGoogleSubmitting}
                  type="button"
                  onClick={() => {
                    void startBrokerGoogleSignIn();
                  }}
                >
                  <GoogleMark />
                  <span>{isGoogleSubmitting ? literal("Waiting for Google...") : googleActionLabel}</span>
                </button>
              ) : hasDirectGoogleSignIn ? (
                <div className="w-full sm:w-auto">
                  <div ref={googleButtonRef} className="flex min-h-[44px] items-center overflow-hidden rounded-full sm:min-w-[200px]" />
                </div>
              ) : hasLegacyGoogleRedirect ? (
                <button
                  className="ui-button ui-button-secondary min-h-[44px] w-full justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm sm:w-auto"
                  type="button"
                  onClick={() => {
                    const rememberFlag = rememberSession ? "1" : "0";
                    window.location.href = `/api/users/google/start?rememberSession=${rememberFlag}`;
                  }}
                >
                  <GoogleMark />
                  <span>{googleActionLabel}</span>
                </button>
              ) : (
                <button
                  className="ui-button ui-button-secondary min-h-[44px] w-full justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled
                  type="button"
                >
                  <GoogleMark />
                  <span>{googleActionLabel}</span>
                </button>
              )
            ) : null}
          </div>
        </form>
      )}

      {!session.user && authDialogMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4">
          <div className="theme-surface-panel w-full max-w-md rounded-[28px] border border-line/80 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
            {authDialogMode === "invalid-login" ? (
              <>
                <p className="eyebrow text-muted">{literal("Credential check")}</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{literal("Are you sure that was the right password?")}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {authDialogMessage ?? literal("That password did not match the local account record.")}
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button className="ui-button ui-button-secondary px-4 py-2 text-sm" type="button" onClick={dismissAuthDialog}>
                    {literal("Dismiss")}
                  </button>
                  <button
                    className="ui-button ui-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isResettingPassword}
                    type="button"
                    onClick={() => {
                      void requestPasswordReset();
                    }}
                  >
                    {isResettingPassword ? literal("Starting reset...") : literal("Reset password")}
                  </button>
                </div>
              </>
            ) : null}

            {authDialogMode === "user-missing" ? (
              <>
                <p className="eyebrow text-muted">{literal("Account lookup")}</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{literal("That user does not exist")}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {authDialogMessage ?? literal("No local account matched that email address.")} {literal("Continue to account creation if this was a new user, or dismiss if it was just a typo.")}
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button className="ui-button ui-button-secondary px-4 py-2 text-sm" type="button" onClick={dismissAuthDialog}>
                    {literal("Dismiss")}
                  </button>
                  <button
                    className="ui-button ui-button-primary px-4 py-2 text-sm"
                    type="button"
                    onClick={() => {
                      setMode("register");
                      dismissAuthDialog();
                    }}
                  >
                    {literal("Continue")}
                  </button>
                </div>
              </>
            ) : null}

            {authDialogMode === "password-reset" ? (
              <>
                <p className="eyebrow text-muted">{literal("Password reset")}</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{literal("Authorize a new password")}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {authDialogMessage ?? literal("Enter the reset code from your email and choose a new password.")}
                </p>
                {passwordResetChallenge ? (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {passwordResetSecondsRemaining > 0
                      ? literal("Code target: {email}. This code expires in {seconds} second(s).", {
                        email: passwordResetChallenge.email,
                        seconds: passwordResetSecondsRemaining,
                      })
                      : literal("Code target: {email}. This code has expired. Send another one to continue.", {
                        email: passwordResetChallenge.email,
                      })}
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={literal("6-digit reset code")}
                    value={resetCode}
                    onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                    autoComplete="new-password"
                    placeholder={literal("New password")}
                    type="password"
                    value={resetPasswordDraft}
                    onChange={(event) => setResetPasswordDraft(event.target.value)}
                  />
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button className="ui-button ui-button-secondary px-4 py-2 text-sm" type="button" onClick={dismissAuthDialog}>
                    {literal("Dismiss")}
                  </button>
                  <button
                    className="ui-button ui-button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isResettingPassword}
                    type="button"
                    onClick={() => {
                      void requestPasswordReset();
                    }}
                  >
                    {isResettingPassword ? literal("Sending...") : literal("Send another code")}
                  </button>
                  <button
                    className="ui-button ui-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isCompletingPasswordReset}
                    type="button"
                    onClick={() => {
                      void completePasswordReset();
                    }}
                  >
                    {isCompletingPasswordReset ? literal("Changing password...") : literal("Change password")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {backupSummary ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            backupSummaryTone === "warning"
              ? "bg-amber-50 text-amber-900"
              : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {backupSummary}
        </div>
      ) : null}

      {session.user?.role === "admin" ? (
        <div className={`mt-6 ${isPageSurface ? "grid gap-6" : "space-y-6"}`}>
          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("Role management")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Promote or restrict other local users.")}
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="access.users.refresh"
                disabled={isLoadingUsers}
                type="button"
                onClick={refreshUsers}
              >
                {isLoadingUsers ? literal("Refreshing...") : literal("Refresh users")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {managedUsers.length > 0 ? (
                managedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-[24px] bg-white px-4 py-4"
                  >
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {user.displayName}
                        </p>
                        <p className="mt-1 text-xs text-muted">{user.authProvider === "local" ? user.email ?? user.username : `@${user.username}`}</p>
                      </div>
                      <span className="ui-pill ui-pill-soft border border-line text-xs text-muted capitalize">
                        {formatRoleLabel(user.role, activeUiLanguage)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                        {user.authProvider === "google" ? literal("Google") : literal("Local")}
                      </span>
                      {user.authProvider === "local" ? (
                        <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {user.emailVerifiedAt ? literal("Email verified") : literal("Verification pending")}
                        </span>
                      ) : null}
                      {user.authProvider === "local" ? (
                        <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {user.requireEmailVerificationOnLogin ? literal("Verify each login") : literal("Password only after verified email")}
                        </span>
                      ) : null}
                      {user.email ? (
                        <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {user.email}
                        </span>
                      ) : null}
                    </div>
                    {user.id === currentUserId ? (
                      <p className="mt-3 text-xs text-muted">
                        {literal("Your own role is locked in this panel.")}
                      </p>
                    ) : (
                      <>
                        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                          {(["viewer", "operator", "admin"] as const).map((role) => (
                            <button
                              key={role}
                              className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                                user.role === role
                                  ? "ui-button-primary"
                                  : "ui-button-secondary"
                              } capitalize disabled:cursor-not-allowed disabled:opacity-50`}
                              data-help-id="access.role.change"
                              disabled={busyUserId === user.id || user.role === role}
                              type="button"
                              onClick={() => changeRole(user.id, role)}
                            >
                              {busyUserId === user.id && user.role !== role
                                ? literal("Updating...")
                                : formatRoleLabel(role, activeUiLanguage)}
                            </button>
                          ))}
                        </div>

                        {user.authProvider === "local" ? (
                          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                            <button
                              className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                                !user.requireEmailVerificationOnLogin
                                  ? "ui-button-primary"
                                  : "ui-button-secondary"
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              disabled={busyUserId === user.id || !user.requireEmailVerificationOnLogin}
                              type="button"
                              onClick={() => {
                                void changeLoginVerificationPolicy(user.id, false);
                              }}
                            >
                              {busyUserId === user.id && user.requireEmailVerificationOnLogin ? literal("Updating...") : literal("Password only")}
                            </button>
                            <button
                              className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                                user.requireEmailVerificationOnLogin
                                  ? "ui-button-primary"
                                  : "ui-button-secondary"
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              disabled={busyUserId === user.id || user.requireEmailVerificationOnLogin}
                              type="button"
                              onClick={() => {
                                void changeLoginVerificationPolicy(user.id, true);
                              }}
                            >
                              {busyUserId === user.id && !user.requireEmailVerificationOnLogin ? literal("Updating...") : literal("Verify each login")}
                            </button>
                          </div>
                        ) : null}

                        {pendingDeleteUserId === user.id ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                            <p className="font-semibold">{literal("Delete {name}?", { name: user.displayName })}</p>
                            <p className="mt-2 leading-6">
                              {literal("This removes the local account and permanently deletes {countLabel} for this user on this machine.", {
                                countLabel: formatSavedConversationCountLabel(user.savedConversationCount, activeUiLanguage),
                              })}
                            </p>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                              <button
                                className="ui-button ui-button-primary w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                data-help-id="access.user.delete.confirm"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => removeUser(user)}
                              >
                                {busyUserId === user.id ? literal("Deleting...") : literal("Confirm delete")}
                              </button>
                              <button
                                className="ui-button ui-button-secondary w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                data-help-id="access.user.delete.cancel"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => setPendingDeleteUserId(null)}
                              >
                                {literal("Cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3">
                            <button
                              className="ui-button ui-button-chip ui-button-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              data-help-id="access.user.delete"
                              disabled={busyUserId === user.id}
                              type="button"
                              onClick={() => setPendingDeleteUserId(user.id)}
                            >
                              {literal("Delete user")}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  {literal("No users to manage yet.")}
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("AI providers")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Configure hosted-provider credentials for the shared AI gateway.")}
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="providers.refresh"
                disabled={isLoadingProviderConfigs}
                type="button"
                onClick={refreshProviderConfigs}
              >
                {isLoadingProviderConfigs ? literal("Refreshing...") : literal("Refresh providers")}
              </button>
            </div>

            <div ref={knowledgeFormRef} className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{literal("Anthropic")}</p>
                  <p className="mt-1 text-xs text-muted">
                    {literal("Enable Claude chat through the shared provider layer.")}
                  </p>
                </div>
                <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                  {providerConfigs.find((provider) => provider.providerId === "anthropic")?.configured ? literal("Configured") : literal("Not configured")}
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Enter or replace the Anthropic API key")}
                type="password"
                value={anthropicApiKeyDraft}
                onChange={(event) => setAnthropicApiKeyDraft(event.target.value)}
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                {literal("Stored keys are encrypted at rest. Environment variables still take priority when present.")}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  className="ui-button ui-button-primary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  data-help-id="providers.anthropic.save"
                  disabled={isSavingAnthropicApiKey}
                  type="button"
                  onClick={() => {
                    void saveAnthropicApiKey();
                  }}
                >
                  {isSavingAnthropicApiKey ? literal("Saving...") : literal("Save Anthropic key")}
                </button>
                <button
                  className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  data-help-id="providers.anthropic.clear"
                  disabled={isSavingAnthropicApiKey}
                  type="button"
                  onClick={() => {
                    void saveAnthropicApiKey(true);
                  }}
                >
                  {literal("Clear stored key")}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{literal("OpenAI")}</p>
                  <p className="mt-1 text-xs text-muted">
                    {literal("Enable GPT chat through the shared provider layer.")}
                  </p>
                </div>
                <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                  {providerConfigs.find((provider) => provider.providerId === "openai")?.configured ? literal("Configured") : literal("Not configured")}
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Enter or replace the OpenAI API key")}
                type="password"
                value={openAiApiKeyDraft}
                onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                {literal("Stored keys are encrypted at rest. Environment variables still take priority when present.")}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  className="ui-button ui-button-primary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  data-help-id="providers.openai.save"
                  disabled={isSavingOpenAiApiKey}
                  type="button"
                  onClick={() => {
                    void saveOpenAiApiKey();
                  }}
                >
                  {isSavingOpenAiApiKey ? literal("Saving...") : literal("Save OpenAI key")}
                </button>
                <button
                  className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  data-help-id="providers.openai.clear"
                  disabled={isSavingOpenAiApiKey}
                  type="button"
                  onClick={() => {
                    void saveOpenAiApiKey(true);
                  }}
                >
                  {literal("Clear stored key")}
                </button>
              </div>
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("Assistant profiles")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Create specialist assistant presets that bundle a target model, system prompt, and grounding behavior into one reusable option.")}
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isLoadingProfiles}
                type="button"
                onClick={refreshProfiles}
              >
                {isLoadingProfiles ? literal("Refreshing...") : literal("Refresh profiles")}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {editingKnowledgeBaseId ? literal("Edit knowledge base") : literal("New knowledge base")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {literal("Group saved knowledge entries into reusable corpora that can be attached to assistant agents or individual chats.")}
                  </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
                  <button
                    className="ui-button ui-button-secondary flex-1 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    disabled={isLoadingKnowledgeBases}
                    type="button"
                    onClick={refreshKnowledgeBases}
                  >
                    {isLoadingKnowledgeBases ? literal("Refreshing...") : literal("Refresh bases")}
                  </button>
                  {editingKnowledgeBaseId ? (
                    <button
                      className="ui-button ui-button-secondary flex-1 px-4 py-2 text-sm sm:flex-none"
                      type="button"
                      onClick={resetKnowledgeBaseForm}
                    >
                      {literal("Cancel edit")}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Knowledge base name")}
                  value={knowledgeBaseName}
                  onChange={(event) => setKnowledgeBaseName(event.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Short description")}
                  value={knowledgeBaseDescription}
                  onChange={(event) => setKnowledgeBaseDescription(event.target.value)}
                />
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{literal("Included entries")}</p>
                    <p className="mt-1 text-xs text-muted">{literal("Select any saved knowledge entries that should travel together as one reusable base.")}</p>
                  </div>
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {literal("{count} selected", { count: knowledgeBaseEntryIds.length })}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {isLoadingKnowledge ? (
                    <span className="text-xs text-muted">{literal("Loading saved knowledge entries...")}</span>
                  ) : knowledgeEntries.length > 0 ? knowledgeEntries.map((entry) => (
                    <button
                      key={`knowledge-base-entry-${entry.id}`}
                      className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                        knowledgeBaseEntryIds.includes(entry.id) ? "ui-button-primary" : "ui-button-secondary"
                      }`}
                      type="button"
                      onClick={() => toggleKnowledgeBaseEntry(entry.id)}
                    >
                      {entry.title}
                    </button>
                  )) : (
                    <span className="text-xs text-muted">{literal("Save one or more shared knowledge entries below first, then group them here into a reusable base.")}</span>
                  )}
                </div>
              </div>
              {knowledgeBaseSummary ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
                  {knowledgeBaseSummary}
                </div>
              ) : null}
              <button
                className="ui-button ui-button-primary mt-3 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isSavingKnowledgeBase}
                type="button"
                onClick={() => {
                  void saveKnowledgeBase();
                }}
              >
                {isSavingKnowledgeBase ? literal("Saving...") : editingKnowledgeBaseId ? literal("Update knowledge base") : literal("Save knowledge base")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {knowledgeBases.length > 0 ? knowledgeBases.map((knowledgeBase) => (
                <div key={knowledgeBase.id} className="rounded-[24px] bg-white px-4 py-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{knowledgeBase.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {literal("{count} entries · updated {date}", {
                          count: knowledgeBase.entryIds.length,
                          date: new Date(knowledgeBase.updatedAt).toLocaleString(),
                        })}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
                      <button
                        className="ui-button ui-button-chip ui-button-secondary flex-1 px-3 py-2 text-xs sm:flex-none"
                        type="button"
                        onClick={() => startEditingKnowledgeBase(knowledgeBase)}
                      >
                        {literal("Edit")}
                      </button>
                      <button
                        className="ui-button ui-button-chip ui-button-danger flex-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                        disabled={busyKnowledgeBaseId === knowledgeBase.id}
                        type="button"
                        onClick={() => {
                          void deleteKnowledgeBase(knowledgeBase.id);
                        }}
                      >
                        {busyKnowledgeBaseId === knowledgeBase.id ? literal("Deleting...") : literal("Delete")}
                      </button>
                    </div>
                  </div>
                  {knowledgeBase.description ? (
                    <p className="mt-3 text-sm leading-6 text-muted">{knowledgeBase.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {knowledgeBase.entryIds.length > 0 ? knowledgeBase.entryIds.map((entryId) => {
                      const entry = knowledgeEntries.find((item) => item.id === entryId);

                      return (
                        <span key={entryId} className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {entry?.title ?? entryId}
                        </span>
                      );
                    }) : (
                      <span className="text-xs text-muted">{literal("No entries are attached yet.")}</span>
                    )}
                  </div>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  {literal("No reusable knowledge bases yet.")}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {editingProfileId ? literal("Edit assistant profile") : literal("New assistant profile")}
                </p>
                {editingProfileId ? (
                  <button
                    className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                    type="button"
                    onClick={resetProfileForm}
                  >
                    {literal("Cancel edit")}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Profile name")}
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Target model")}
                  value={profileModel}
                  onChange={(event) => setProfileModel(event.target.value)}
                />
              </div>
              <textarea
                className="mt-3 min-h-24 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Short description")}
                value={profileDescription}
                onChange={(event) => setProfileDescription(event.target.value)}
              />
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{literal("Provider target")}</p>
                  <p className="text-xs text-muted">{literal("Use this when a specialist should prefer a local or hosted provider by default.")}</p>
                </div>
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {KNOWLEDGE_PROVIDER_OPTIONS.map((provider) => (
                    <button
                      key={`profile-${provider.id}`}
                      className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                        profileProviderId === provider.id ? "ui-button-primary" : "ui-button-secondary"
                      }`}
                      type="button"
                      onClick={() => setProfileProviderId(provider.id)}
                    >
                      {formatProviderLabel(provider.id, activeUiLanguage)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="mt-3 min-h-32 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("System prompt for this specialist")}
                value={profileSystemPrompt}
                onChange={(event) => setProfileSystemPrompt(event.target.value)}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <label className="rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3 text-sm text-foreground">
                  <span className="block font-semibold text-foreground">{literal("Profile temperature")}</span>
                  <span className="mt-1 block text-xs text-muted">{literal("Lower stays steadier. Higher allows more variation.")}</span>
                  <input
                    className="mt-3 w-full accent-[var(--accent)]"
                    max="1.5"
                    min="0"
                    step="0.1"
                    type="range"
                    value={profileTemperature}
                    onChange={(event) => setProfileTemperature(Number(event.target.value))}
                  />
                </label>
                <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                  {profileTemperature.toFixed(1)}
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{literal("Grounding preset")}</p>
                    <p className="mt-1 text-xs text-muted">{literal("Decide whether this specialist should use shared knowledge and how strict that grounding should be.")}</p>
                  </div>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      profileUseKnowledge ? "bg-[var(--accent)] text-white" : "border border-line bg-white text-foreground"
                    }`}
                    type="button"
                    onClick={() => setProfileUseKnowledge((current) => !current)}
                  >
                    {profileUseKnowledge ? literal("Knowledge on") : literal("Knowledge off")}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["balanced", "strict"] as const).map((mode) => (
                    <button
                      key={`profile-grounding-${mode}`}
                      className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                        profileUseKnowledge && profileGroundingMode === mode ? "ui-button-primary" : "ui-button-secondary"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      disabled={!profileUseKnowledge}
                      type="button"
                      onClick={() => setProfileGroundingMode(mode)}
                    >
                      {formatGroundingModeLabel(mode, activeUiLanguage)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{literal("Workspace tools")}</p>
                    <p className="mt-1 text-xs text-muted">{literal("Choose which built-in tools this specialist may call before composing a final answer.")}</p>
                  </div>
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {literal("{count} selected", { count: profileEnabledToolIds.length })}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {isLoadingWorkspaceTools ? (
                    <span className="text-xs text-muted">{literal("Loading built-in workspace tools...")}</span>
                  ) : workspaceTools.length > 0 ? workspaceTools.map((tool) => (
                    <button
                      key={`profile-tool-${tool.id}`}
                      className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                        profileEnabledToolIds.includes(tool.id) ? "ui-button-primary" : "ui-button-secondary"
                      }`}
                      type="button"
                      onClick={() => toggleProfileTool(tool.id)}
                    >
                      {tool.label}
                    </button>
                  )) : (
                    <span className="text-xs text-muted">{literal("Built-in workspace tools are provided by the shared gateway. If this stays empty, refresh the Access page and verify the local app state.")}</span>
                  )}
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{literal("Bound knowledge bases")}</p>
                    <p className="mt-1 text-xs text-muted">{literal("Attach reusable corpora that should follow this specialist into each chat.")}</p>
                  </div>
                  <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                    {literal("{count} selected", { count: profileKnowledgeBaseIds.length })}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {isLoadingKnowledgeBases ? (
                    <span className="text-xs text-muted">{literal("Loading reusable knowledge bases...")}</span>
                  ) : knowledgeBases.length > 0 ? knowledgeBases.map((knowledgeBase) => (
                    <button
                      key={`profile-knowledge-base-${knowledgeBase.id}`}
                      className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                        profileKnowledgeBaseIds.includes(knowledgeBase.id) ? "ui-button-primary" : "ui-button-secondary"
                      }`}
                      type="button"
                      onClick={() => toggleProfileKnowledgeBase(knowledgeBase.id)}
                    >
                      {knowledgeBase.name}
                    </button>
                  )) : (
                    <span className="text-xs text-muted">{literal("No reusable knowledge bases exist yet. Create them in the knowledge-base section below after you save shared knowledge entries.")}</span>
                  )}
                </div>
              </div>
              {profileSummary ? (
                <div className={`mt-3 rounded-2xl px-4 py-3 text-sm ${profileSummaryTone === "success" ? "border border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border border-amber-200 bg-amber-50/90 text-amber-950"}`}>
                  {profileSummary}
                </div>
              ) : null}
              <button
                className="ui-button ui-button-primary mt-3 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isSavingProfile}
                type="button"
                onClick={() => {
                  void saveProfile();
                }}
              >
                {isSavingProfile ? literal("Saving...") : editingProfileId ? literal("Update profile") : literal("Save profile")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {workspaceProfiles.length > 0 ? workspaceProfiles.map((profile) => (
                <div key={profile.id} className="rounded-[24px] bg-white px-4 py-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{profile.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {literal("{provider} · {model} · updated {date}", {
                          provider: formatProviderLabel(profile.providerId, activeUiLanguage),
                          model: profile.model,
                          date: new Date(profile.updatedAt).toLocaleString(),
                        })}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
                      <button
                        className="ui-button ui-button-chip ui-button-secondary flex-1 px-3 py-2 text-xs sm:flex-none"
                        type="button"
                        onClick={() => startEditingProfile(profile)}
                      >
                        {literal("Edit")}
                      </button>
                      <button
                        className="ui-button ui-button-chip ui-button-danger flex-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                        disabled={busyProfileId === profile.id}
                        type="button"
                        onClick={() => {
                          void deleteProfile(profile.id);
                        }}
                      >
                        {busyProfileId === profile.id ? literal("Deleting...") : literal("Delete")}
                      </button>
                    </div>
                  </div>
                  {profile.description ? (
                    <p className="mt-3 text-sm leading-6 text-muted">{profile.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {profile.useKnowledge
                        ? literal("Knowledge {mode}", { mode: formatGroundingModeLabel(profile.groundingMode, activeUiLanguage).toLowerCase() })
                        : literal("Knowledge off")}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {literal("Temp {value}", { value: profile.temperature.toFixed(1) })}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {literal("Tools {count}", { count: profile.enabledToolIds.length })}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {literal("Bases {count}", { count: profile.knowledgeBaseIds.length })}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  {literal("No assistant profiles yet.")}
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("Shared knowledge")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Save reusable context snippets here so the AI can pull them into a reply when they match the request.")}
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="knowledge.refresh"
                disabled={isLoadingKnowledge}
                type="button"
                onClick={refreshKnowledgeEntries}
              >
                {isLoadingKnowledge ? literal("Refreshing...") : literal("Refresh knowledge")}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {editingKnowledgeId ? literal("Edit knowledge entry") : literal("New knowledge entry")}
                </p>
                {editingKnowledgeId ? (
                  <button
                    className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                    data-help-id="knowledge.edit.cancel"
                    type="button"
                    onClick={resetKnowledgeForm}
                  >
                    {literal("Cancel edit")}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{literal("Import knowledge")}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {literal("Pull content from a URL or upload a file and save it directly into shared knowledge. Supported uploads: txt, csv, xls, xlsx, doc, docx, pdf, and pptx.")}
                    </p>
                  </div>
                  <button
                    className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    disabled={Boolean(editingKnowledgeId) || isImportingKnowledge || isSavingKnowledge}
                    type="button"
                    onClick={() => knowledgeFileInputRef.current?.click()}
                  >
                    {isImportingKnowledge ? literal("Importing...") : literal("Upload file")}
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                    disabled={Boolean(editingKnowledgeId) || isImportingKnowledge || isSavingKnowledge}
                    placeholder={literal("Import from URL")}
                    value={knowledgeImportUrl}
                    onChange={(event) => setKnowledgeImportUrl(event.target.value)}
                  />
                  <button
                    className="ui-button ui-button-primary w-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    disabled={Boolean(editingKnowledgeId) || isImportingKnowledge || isSavingKnowledge}
                    type="button"
                    onClick={() => {
                      void importKnowledgeFromUrl();
                    }}
                  >
                    {isImportingKnowledge ? literal("Importing...") : literal("Import URL")}
                  </button>
                </div>
                <input
                  ref={knowledgeFileInputRef}
                  accept=".txt,.csv,.md,.json,.xml,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.pptx"
                  className="hidden"
                  disabled={Boolean(editingKnowledgeId) || isImportingKnowledge || isSavingKnowledge}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (!file) {
                      return;
                    }

                    void importKnowledgeFile(file);
                  }}
                />
                <p className="mt-3 text-xs leading-5 text-muted">
                  {literal("Use the title, source, tags, provider scope, and model scope fields below if you want to override imported defaults. Legacy .ppt files should be re-saved as .pptx first.")}
                </p>
                {knowledgeSummary ? (
                  <div className={`mt-3 rounded-2xl px-4 py-3 text-sm ${knowledgeSummaryTone === "success" ? "border border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border border-amber-200 bg-amber-50/90 text-amber-950"}`}>
                    {knowledgeSummary}
                  </div>
                ) : null}
              </div>
              <input
                ref={knowledgeTitleInputRef}
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Entry title")}
                value={knowledgeTitle}
                onChange={(event) => setKnowledgeTitle(event.target.value)}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Source label")}
                  value={knowledgeSource}
                  onChange={(event) => setKnowledgeSource(event.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Tags, comma-separated")}
                  value={knowledgeTags}
                  onChange={(event) => setKnowledgeTags(event.target.value)}
                />
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{literal("Provider scope")}</p>
                  <p className="text-xs text-muted">
                    {knowledgeProviderIds.length > 0
                      ? literal("{count} provider(s) selected", { count: knowledgeProviderIds.length })
                      : literal("Empty means all providers")}
                  </p>
                </div>
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {KNOWLEDGE_PROVIDER_OPTIONS.map((provider) => {
                    const isSelected = knowledgeProviderIds.includes(provider.id);

                    return (
                      <button
                        key={provider.id}
                        className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                          isSelected ? "ui-button-primary" : "ui-button-secondary"
                        }`}
                        type="button"
                        onClick={() => toggleKnowledgeProviderScope(provider.id)}
                      >
                        {formatProviderLabel(provider.id, activeUiLanguage)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Model scope, comma-separated exact model names")}
                value={knowledgeModelIds}
                onChange={(event) => setKnowledgeModelIds(event.target.value)}
              />
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{literal("Known models")}</p>
                  <p className="text-xs text-muted">
                    {isLoadingKnowledgeModelSuggestions
                      ? literal("Loading suggestions...")
                      : literal("Tap to add or remove exact model names")}
                  </p>
                </div>
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {getSuggestedModels(knowledgeProviderIds).length > 0 ? getSuggestedModels(knowledgeProviderIds).map((modelId) => {
                    const isSelected = parseScopedModelIds(knowledgeModelIds).includes(modelId);

                    return (
                      <button
                        key={modelId}
                        className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                          isSelected ? "ui-button-primary" : "ui-button-secondary"
                        }`}
                        type="button"
                        onClick={() => toggleKnowledgeModelScope(modelId)}
                      >
                        {modelId}
                      </button>
                    );
                  }) : (
                    <span className="text-xs text-muted">{literal("No model suggestions are available for the current provider scope yet.")}</span>
                  )}
                </div>
              </div>
              <textarea
                className="mt-3 min-h-32 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Shared context content")}
                value={knowledgeContent}
                onChange={(event) => setKnowledgeContent(event.target.value)}
              />
              {isCheckingKnowledgeOverlaps || knowledgeOverlapResults.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{literal("Potential overlap")}</p>
                    <p className="text-xs text-muted">
                      {isCheckingKnowledgeOverlaps
                        ? literal("Checking existing entries...")
                        : knowledgeOverlapResults.length > 0
                          ? literal("Warnings only. Saving still works.")
                          : literal("No close overlap found.")}
                    </p>
                  </div>
                  {knowledgeOverlapResults.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {knowledgeOverlapResults.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                              <p className="mt-1 text-xs text-muted">{literal("{source} · overlap score {score}", { source: entry.source, score: entry.overlapScore })}</p>
                            </div>
                            <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                              {formatKnowledgeOverlapScope(entry.breakdown.scopeOverlap, activeUiLanguage)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.breakdown.exactTitleMatch ? (
                              <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">{literal("Exact title match")}</span>
                            ) : null}
                            {entry.breakdown.exactContentMatch ? (
                              <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">{literal("Exact content match")}</span>
                            ) : null}
                            {entry.breakdown.sharedTags.map((tag) => (
                              <span key={tag} className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                                {literal("Shared tag: {tag}", { tag })}
                              </span>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-6 text-muted">
                            {literal("Title similarity {title}% · Content similarity {content}%", {
                              title: Math.round(entry.breakdown.titleSimilarity * 100),
                              content: Math.round(entry.breakdown.contentSimilarity * 100),
                            })}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="ui-button ui-button-chip ui-button-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={editingKnowledgeId === entry.id}
                              type="button"
                              onClick={() => startEditingKnowledgeEntry(entry)}
                            >
                              {editingKnowledgeId === entry.id ? literal("Editing this note") : literal("Edit existing note")}
                            </button>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">{entry.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                className="ui-button ui-button-primary mt-3 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isSavingKnowledge}
                type="button"
                onClick={() => {
                  void saveKnowledgeEntry();
                }}
              >
                {isSavingKnowledge ? literal("Saving...") : editingKnowledgeId ? literal("Update knowledge entry") : literal("Save knowledge entry")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {knowledgeEntries.length > 0 ? knowledgeEntries.map((entry) => (
                <div key={entry.id} className="rounded-[24px] bg-white px-4 py-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                      <p className="mt-1 text-xs text-muted">{entry.source} · {new Date(entry.updatedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
                      <button
                        className="ui-button ui-button-chip ui-button-secondary flex-1 px-3 py-2 text-xs sm:flex-none"
                        type="button"
                        onClick={() => startEditingKnowledgeEntry(entry)}
                      >
                        {literal("Edit")}
                      </button>
                      <button
                        className="ui-button ui-button-chip ui-button-danger flex-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                        disabled={busyKnowledgeId === entry.id}
                        type="button"
                        onClick={() => {
                          void deleteKnowledgeEntry(entry.id);
                        }}
                      >
                        {busyKnowledgeId === entry.id ? literal("Deleting...") : literal("Delete")}
                      </button>
                    </div>
                  </div>
                  {entry.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {entry.providerIds.length > 0
                        ? literal("Providers: {scope}", { scope: formatKnowledgeProviderScope(entry.providerIds, activeUiLanguage) })
                        : literal("Providers: all")}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {entry.modelIds.length > 0
                        ? literal("Models: {models}", { models: entry.modelIds.join(", ") })
                        : literal("Models: all")}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {literal("Bases: {count}", {
                        count: knowledgeBases.filter((knowledgeBase) => knowledgeBase.entryIds.includes(entry.id)).length,
                      })}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{entry.content}</p>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  {literal("No shared knowledge entries yet.")}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{literal("Retrieval debugger")}</p>
                  <p className="mt-1 text-xs text-muted">
                    {literal("Test a prompt against the shared knowledge index and inspect why each result ranked.")}
                  </p>
                </div>
                <button
                  className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled={isRunningKnowledgeDebug}
                  type="button"
                  onClick={() => {
                    void runKnowledgeDebugSearch();
                  }}
                >
                  {isRunningKnowledgeDebug ? literal("Checking...") : literal("Run debug search")}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder={literal("Ask what should match, for example: anthropic scope checklist")}
                  value={knowledgeDebugQuery}
                  onChange={(event) => setKnowledgeDebugQuery(event.target.value)}
                />
                <select
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  value={knowledgeDebugProviderId}
                  onChange={(event) => setKnowledgeDebugProviderId(event.target.value as AiProviderId | "all")}
                >
                  <option value="all">{literal("All providers")}</option>
                  {KNOWLEDGE_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>{formatProviderLabel(provider.id, activeUiLanguage)}</option>
                  ))}
                </select>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder={literal("Optional exact model name, for example: claude-haiku-4-5")}
                value={knowledgeDebugModelId}
                onChange={(event) => setKnowledgeDebugModelId(event.target.value)}
              />
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                {getSuggestedModels(knowledgeDebugProviderId === "all" ? [] : [knowledgeDebugProviderId]).length > 0 ? getSuggestedModels(knowledgeDebugProviderId === "all" ? [] : [knowledgeDebugProviderId]).map((modelId) => (
                  <button
                    key={`debug-${modelId}`}
                    className={`ui-button ui-button-chip shrink-0 px-3 py-2 text-xs ${
                      knowledgeDebugModelId === modelId ? "ui-button-primary" : "ui-button-secondary"
                    }`}
                    type="button"
                    onClick={() => toggleKnowledgeDebugModelId(modelId)}
                  >
                    {modelId}
                  </button>
                )) : (
                  <span className="text-xs text-muted">{literal("No model suggestions are available for this debug scope yet.")}</span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line/80 bg-white/45 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {knowledgeDebugResponse?.scoringMode === "hybrid"
                      ? literal("Hybrid lexical + vector ranking")
                      : literal("Lexical-only ranking")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {knowledgeDebugResponse
                      ? knowledgeDebugResponse.vectorAvailable
                        ? literal("Using {model} across {count} scoped knowledge entries.", {
                          model: knowledgeDebugResponse.vectorModel ?? literal("local embeddings"),
                          count: knowledgeDebugResponse.knowledgeCount,
                        })
                        : knowledgeDebugResponse.fallbackReason === "no-knowledge"
                          ? literal("No knowledge entries match the current provider and model scope yet.")
                          : literal("Vector signals are unavailable, so this debug run is using lexical fallback.")
                      : literal("Run a debug search to inspect hybrid retrieval and vector proximity.")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`ui-button px-3 py-2 text-xs ${knowledgeDebugViewMode === "list" ? "ui-button-primary" : "ui-button-secondary"}`}
                    type="button"
                    onClick={() => setKnowledgeDebugViewMode("list")}
                  >
                    {literal("Ranked list")}
                  </button>
                  <button
                    className={`ui-button px-3 py-2 text-xs ${knowledgeDebugViewMode === "map" ? "ui-button-primary" : "ui-button-secondary"}`}
                    disabled={knowledgeDebugResults.length === 0}
                    type="button"
                    onClick={() => setKnowledgeDebugViewMode("map")}
                  >
                    {literal("Vector map")}
                  </button>
                </div>
              </div>
              {knowledgeDebugViewMode === "map" && knowledgeDebugResults.length > 0 ? (
                <div className="mt-4 rounded-[24px] border border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,240,232,0.82))] p-4">
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span className="ui-pill ui-pill-neutral border border-line">{literal("center = query")}</span>
                    <span className="ui-pill ui-pill-neutral border border-line">{literal("node size = hybrid score")}</span>
                    <span className="ui-pill ui-pill-neutral border border-line">{literal("distance = semantic closeness")}</span>
                    <span className="ui-pill ui-pill-neutral border border-line">{literal("dashed line = lexical fallback")}</span>
                  </div>
                  <svg className="mt-4 h-auto w-full" viewBox="0 0 320 320" role="img" aria-label={literal("Shared knowledge vector map")}>
                    <defs>
                      <radialGradient id="knowledge-debug-center" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="#f4d8b2" />
                        <stop offset="100%" stopColor="#e7b47c" />
                      </radialGradient>
                    </defs>
                    <circle cx="160" cy="160" r="126" fill="rgba(214, 186, 145, 0.08)" stroke="rgba(143, 111, 74, 0.2)" strokeDasharray="6 8" />
                    <circle cx="160" cy="160" r="84" fill="rgba(214, 186, 145, 0.08)" stroke="rgba(143, 111, 74, 0.16)" strokeDasharray="4 6" />
                    {knowledgeDebugMapNodes.map((node) => (
                      <line
                        key={`edge-${node.id}`}
                        x1="160"
                        y1="160"
                        x2={node.x}
                        y2={node.y}
                        stroke={node.vectorAvailable ? "rgba(108, 86, 57, 0.45)" : "rgba(108, 86, 57, 0.25)"}
                        strokeDasharray={node.vectorAvailable ? undefined : "6 6"}
                        strokeWidth={Math.max(1.5, node.hybridScore / 12)}
                      />
                    ))}
                    <circle cx="160" cy="160" r="28" fill="url(#knowledge-debug-center)" stroke="#8a5b31" strokeWidth="2" />
                    <text x="160" y="156" fill="#5f3a1f" fontSize="12" fontWeight="700" textAnchor="middle">{literal("Query")}</text>
                    <text x="160" y="172" fill="#6d4a29" fontSize="10" textAnchor="middle">{truncateKnowledgeMapLabel(knowledgeDebugQuery.trim())}</text>
                    {knowledgeDebugMapNodes.map((node) => (
                      <g key={node.id}>
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius}
                          fill={node.vectorAvailable ? "rgba(195, 122, 69, 0.78)" : "rgba(125, 130, 141, 0.7)"}
                          stroke={node.duplicatePenalty > 0 ? "#6c3f1b" : "#fff8ef"}
                          strokeWidth={node.duplicatePenalty > 0 ? 2.5 : 2}
                        />
                        <text x={node.x} y={node.y + 4} fill="#fffaf4" fontSize="10" fontWeight="700" textAnchor="middle">
                          {node.hybridScore}
                        </text>
                        <text
                          x={node.x + (Math.cos(node.angle) >= 0 ? node.radius + 8 : -(node.radius + 8))}
                          y={node.y + (Math.sin(node.angle) >= 0 ? node.radius + 6 : -(node.radius + 2))}
                          fill="#6b5944"
                          fontSize="10"
                          fontWeight="600"
                          textAnchor={Math.cos(node.angle) >= 0 ? "start" : "end"}
                        >
                          {truncateKnowledgeMapLabel(node.title)}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {knowledgeDebugResults.map((entry) => (
                      <div key={`map-legend-${entry.id}`} className="rounded-2xl border border-line/80 bg-white/70 px-3 py-3 text-xs text-muted">
                        <p className="font-semibold text-foreground">{entry.title}</p>
                        <p className="mt-1">{literal("Hybrid {hybrid} · lexical {lexical}", {
                          hybrid: entry.breakdown.hybridScore,
                          lexical: entry.breakdown.lexicalScoreTotal,
                        })}</p>
                        <p className="mt-1">{entry.breakdown.vectorSimilarity !== null
                          ? literal("Vector {value}", { value: entry.breakdown.vectorSimilarity.toFixed(3) })
                          : literal("Lexical fallback only")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 space-y-3">
                {knowledgeDebugViewMode === "list" && knowledgeDebugResults.length > 0 ? knowledgeDebugResults.map((entry) => (
                  <div key={entry.id} className="rounded-[22px] border border-line/80 bg-[var(--panel)]/70 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {literal("Score {score} · {source} · {scope}", {
                            score: entry.score,
                            source: entry.source,
                            scope: formatKnowledgeProviderScope(entry.providerIds, activeUiLanguage),
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {entry.modelIds.length > 0 ? literal("Model scope: {models}", { models: entry.modelIds.join(", ") }) : literal("Model scope: all")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        <span className="ui-pill ui-pill-neutral border border-line">{literal("phrase {value}", { value: entry.breakdown.exactPhraseBonus })}</span>
                        <span className="ui-pill ui-pill-neutral border border-line">{literal("all tokens {value}", { value: entry.breakdown.allTokenBonus })}</span>
                        <span className="ui-pill ui-pill-neutral border border-line">{literal("tag bonus {value}", { value: entry.breakdown.exactTagBonus })}</span>
                        {entry.breakdown.vectorAvailable ? (
                          <span className="ui-pill ui-pill-neutral border border-line">
                            {literal("vector {value}", { value: entry.breakdown.vectorScore })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                      <span className="ui-pill ui-pill-soft border border-line">{literal("lexical {value}", { value: entry.breakdown.lexicalScoreTotal })}</span>
                      <span className="ui-pill ui-pill-soft border border-line">{literal("title {value}", { value: entry.breakdown.titleScore })}</span>
                      <span className="ui-pill ui-pill-soft border border-line">{literal("tags {value}", { value: entry.breakdown.tagsScore })}</span>
                      <span className="ui-pill ui-pill-soft border border-line">{literal("source {value}", { value: entry.breakdown.sourceScore })}</span>
                      <span className="ui-pill ui-pill-soft border border-line">{literal("chunk {value}", { value: entry.breakdown.chunkScore })}</span>
                      <span className="ui-pill ui-pill-soft border border-line">{literal("hybrid {value}", { value: entry.breakdown.hybridScore })}</span>
                      {entry.breakdown.duplicatePenalty > 0 ? (
                        <span className="ui-pill ui-pill-soft border border-line">
                          {literal("duplicate penalty -{value}", { value: entry.breakdown.duplicatePenalty })}
                        </span>
                      ) : null}
                    </div>
                    {entry.breakdown.vectorAvailable && entry.breakdown.vectorSimilarity !== null ? (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        {literal("Vector similarity: {similarity} via {model}.", {
                          similarity: entry.breakdown.vectorSimilarity.toFixed(3),
                          model: entry.breakdown.vectorModel ?? literal("local embeddings"),
                        })}
                      </p>
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        {literal("Vector signals are unavailable right now, so this ranking is lexical only.")}
                      </p>
                    )}
                    {entry.breakdown.duplicatePenalty > 0 && entry.breakdown.duplicateReferenceTitle ? (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        {literal("Suppressed against {title} (overlap {score}).", {
                          title: entry.breakdown.duplicateReferenceTitle,
                          score: entry.breakdown.duplicateReferenceScore,
                        })}
                      </p>
                    ) : null}
                    {entry.breakdown.matchedTokens.length > 0 ? (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        {literal("Matched tokens: {tokens}", { tokens: entry.breakdown.matchedTokens.join(", ") })}
                      </p>
                    ) : null}
                    {entry.breakdown.matchedTags.length > 0 ? (
                      <p className="mt-1 text-xs leading-6 text-muted">
                        {literal("Exact tag hits: {tags}", { tags: entry.breakdown.matchedTags.join(", ") })}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm leading-6 text-muted">{entry.content}</p>
                  </div>
                )) : knowledgeDebugViewMode === "list" ? (
                  <div className="rounded-[22px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                    {knowledgeDebugQuery.trim()
                      ? literal("No ranked matches yet for this debug search.")
                      : literal("Run a debug search to inspect how the shared knowledge index ranks entries.")}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
              <div>
                <p className="eyebrow text-muted">{literal("Workspace backup")}</p>
                <p className="mt-2 text-sm text-muted">
                  {literal("Export or restore the local users, conversations, activity log, and job history for this machine.")}
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isExportingBackup}
                type="button"
                onClick={exportWorkspaceBackup}
              >
                {isExportingBackup ? literal("Exporting...") : literal("Export backup")}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-amber-50 px-4 py-4 text-sm text-amber-950">
              {literal("Backup files are sensitive. They include local account metadata and the credential hashes required to restore sign-in access on this machine.")}
            </div>

            <p className="mt-3 text-sm text-muted">
              {literal("Keep exported backups in a trusted location and only restore files from sources you control.")}
            </p>

            {pendingBackupSnapshot ? (
              <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
                <p className="font-semibold">{literal("Restore replaces the current local workspace state.")}</p>
                <p className="mt-2 leading-6">
                  {literal("Users, conversations, activity events, and job history on this machine will be overwritten by the selected backup.")}
                </p>
                <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
                  <input
                    checked={backupRestoreConfirmed}
                    className="mt-1 h-4 w-4 rounded border-line"
                    type="checkbox"
                    onChange={(event) => setBackupRestoreConfirmed(event.target.checked)}
                  />
                  <span>
                    {literal("I understand this restore overwrites the current local workspace data and may sign out or change the access level of the current user.")}
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <input
                ref={backupImportInputRef}
                accept="application/json"
                className="hidden"
                type="file"
                onChange={handleBackupFileSelected}
              />
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                type="button"
                onClick={() => backupImportInputRef.current?.click()}
              >
                {literal("Choose backup file")}
              </button>
              {pendingBackupSnapshot ? (
                <button
                  className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                  type="button"
                  onClick={clearPendingBackupSelection}
                >
                  {literal("Clear selected backup")}
                </button>
              ) : null}
              <button
                aria-label={pendingBackupSnapshot ? literal("Confirm restore workspace backup") : literal("Restore workspace backup")}
                className="ui-button ui-button-primary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={!pendingBackupSnapshot || !backupRestoreConfirmed || isImportingBackup}
                type="button"
                onClick={importWorkspaceBackup}
              >
                {isImportingBackup
                  ? literal("Restoring...")
                  : pendingBackupSnapshot
                    ? literal("Confirm restore backup")
                    : literal("Restore backup")}
              </button>
            </div>

            {pendingBackupFileName ? (
              <p className="mt-3 text-xs text-muted">
                {literal("Selected backup: {fileName}", { fileName: pendingBackupFileName })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}