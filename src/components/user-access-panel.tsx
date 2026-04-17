"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getHelpHint } from "@/lib/help-manual";
import { readQuickHelpEnabled, writeQuickHelpEnabled } from "@/lib/help-preferences";
import { DEFAULT_USER_SYSTEM_PROMPT } from "@/lib/system-prompt";
import type {
  AiModelSummary,
  AiKnowledgeDebugResult,
  AiKnowledgeEntry,
  AiKnowledgeOverlapResult,
  AiProviderConfigSummary,
  AiProviderId,
} from "@/lib/ai-types";
import type { ManagedUser, PublicUser, SessionUser, UserSessionStatus } from "@/lib/user-types";

const AI_PROVIDER_CONFIG_CHANGED_EVENT = "oload:ai-provider-config-changed";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_AUTH_UI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH_UI === "1";
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

function formatKnowledgeProviderScope(providerIds: AiProviderId[]) {
  if (providerIds.length === 0) {
    return "all providers";
  }

  return providerIds.map((providerId) => {
    if (providerId === "ollama") {
      return "Ollama";
    }

    if (providerId === "anthropic") {
      return "Anthropic";
    }

    return "OpenAI";
  }).join(", ");
}

function parseScopedModelIds(value: string) {
  return Array.from(new Set(value.split(",").map((modelId) => modelId.trim()).filter(Boolean)));
}

function parseKnowledgeTags(value: string) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)));
}

function formatKnowledgeOverlapScope(scopeOverlap: "exact" | "partial" | "global") {
  if (scopeOverlap === "exact") {
    return "Exact scope match";
  }

  if (scopeOverlap === "global") {
    return "Global scope overlap";
  }

  return "Partial scope overlap";
}

let googleScriptLoadPromise: Promise<void> | null = null;

type WorkspaceBackupSnapshot = {
  version: number;
  exportedAt: string;
  users: Array<{ id: string }>;
  conversations: Array<{ id: string }>;
  activityEvents: Array<{ id: string }>;
  jobHistory: Array<{ id: string }>;
};

type UserAccessPanelProps = {
  compact?: boolean;
  onSessionChange: (status: UserSessionStatus) => void;
  session: UserSessionStatus;
  surface?: "embedded" | "page";
};

function describeRestoreOutcome(previousUser: SessionUser | null, nextSession: UserSessionStatus) {
  if (!previousUser) {
    return {
      summary: "Workspace backup restored.",
      tone: "success" as const,
    };
  }

  if (!nextSession.user) {
    if (nextSession.userCount === 0) {
      return {
        summary:
          "Workspace backup restored. Your previous session was cleared because the restored workspace no longer includes any local users.",
        tone: "warning" as const,
      };
    }

    return {
      summary:
        "Workspace backup restored. Your previous session was cleared because that user is no longer present in the restored workspace.",
      tone: "warning" as const,
    };
  }

  if (nextSession.user.id === previousUser.id && nextSession.user.role !== previousUser.role) {
    return {
      summary: `Workspace backup restored. Your access changed from ${previousUser.role} to ${nextSession.user.role}.`,
      tone: "warning" as const,
    };
  }

  return {
    summary: "Workspace backup restored.",
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

function getLoginErrorMessage(code: string | null) {
  switch (code) {
    case "google_not_configured":
      return "Google sign-in is not configured on this deployment yet.";
    case "google_access_denied":
      return "Google sign-in was cancelled before access was granted.";
    case "google_state_invalid":
      return "Google sign-in could not verify the login state. Try again.";
    case "google_login_failed":
      return "Google sign-in failed. Check the Google app configuration and try again.";
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

export function UserAccessPanel({ compact = false, onSessionChange, session, surface = "embedded" }: UserAccessPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleBrokerPollRef = useRef<number | null>(null);
  const knowledgeFormRef = useRef<HTMLDivElement | null>(null);
  const knowledgeTitleInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserId = session.user?.id ?? null;
  const isPageSurface = surface === "page" && !compact;
  const isAdminSession = session.user?.role === "admin";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPreferredSystemPrompt, setAccountPreferredSystemPrompt] = useState(DEFAULT_USER_SYSTEM_PROMPT);
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
  const [knowledgeEntries, setKnowledgeEntries] = useState<AiKnowledgeEntry[]>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeSource, setKnowledgeSource] = useState("manual");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [knowledgeProviderIds, setKnowledgeProviderIds] = useState<AiProviderId[]>([]);
  const [knowledgeModelIds, setKnowledgeModelIds] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeOverlapResults, setKnowledgeOverlapResults] = useState<AiKnowledgeOverlapResult[]>([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);
  const [isCheckingKnowledgeOverlaps, setIsCheckingKnowledgeOverlaps] = useState(false);
  const [busyKnowledgeId, setBusyKnowledgeId] = useState<string | null>(null);
  const [knownModelsByProvider, setKnownModelsByProvider] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const [isLoadingKnowledgeModelSuggestions, setIsLoadingKnowledgeModelSuggestions] = useState(false);
  const [knowledgeDebugQuery, setKnowledgeDebugQuery] = useState("");
  const [knowledgeDebugProviderId, setKnowledgeDebugProviderId] = useState<AiProviderId | "all">("all");
  const [knowledgeDebugModelId, setKnowledgeDebugModelId] = useState("");
  const [knowledgeDebugResults, setKnowledgeDebugResults] = useState<AiKnowledgeDebugResult[]>([]);
  const [isRunningKnowledgeDebug, setIsRunningKnowledgeDebug] = useState(false);
  const configuredProviderCount = providerConfigs.filter((provider) => provider.configured).length;
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const hasOfficialGoogleSignIn = GOOGLE_CLIENT_ID.trim().length > 0;
  const isBrokerGoogleSignIn = session.googleAuthMode === "broker";
  const hasDirectGoogleSignIn = session.googleAuthMode === "direct" && hasOfficialGoogleSignIn;
  const hasLegacyGoogleRedirect = session.googleAuthMode === "redirect";
  const showGoogleAuthUi = GOOGLE_AUTH_UI_ENABLED;
  const quickHelpHint = getHelpHint("command.quick-help-toggle");
  const quickHelpPreferenceSummary = "Show short contextual help cards on desktop hover and mobile long-press.";

  useEffect(() => {
    setAccountDisplayName(session.user?.displayName ?? "");
    setAccountEmail(session.user?.email ?? "");
    setAccountPreferredSystemPrompt(session.user?.preferredSystemPrompt ?? DEFAULT_USER_SYSTEM_PROMPT);
    setCurrentPasswordDraft("");
    setNextPasswordDraft("");
    setAccountSummary(null);
  }, [session.user?.displayName, session.user?.email, session.user?.id, session.user?.preferredSystemPrompt]);

  useEffect(() => {
    setIsQuickHelpEnabled(readQuickHelpEnabled());
  }, []);

  useEffect(() => {
    const message = getLoginErrorMessage(searchParams.get("loginError"));

    if (!message) {
      return;
    }

    setError(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("loginError");
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

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
              ? loadError.message
              : "Unable to load Google sign-in.",
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hasDirectGoogleSignIn, showGoogleAuthUi]);

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
        throw new Error("Google sign-in finished, but the session was not established. Reload and try again.");
      }

      onSessionChange(nextSession);
      setUsername("");
      setDisplayName("");
      setPassword("");
    } catch (googleError) {
      setError(
        googleError instanceof Error
          ? googleError.message
          : "Unable to complete Google sign-in.",
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  });

  const startBrokerGoogleSignIn = useEffectEvent(async () => {
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
        throw new Error("The broker sign-in window was blocked. Allow popups and try again.");
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
              setError("Google sign-in was closed before completion.");
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
                ? "Google sign-in expired. Try again."
                : "Google sign-in is no longer available for this request. Try again.",
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
            throw new Error("Google sign-in finished, but the session was not established. Reload and try again.");
          }

          onSessionChange(nextSession);
          setUsername("");
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
              : "Unable to complete broker Google sign-in.",
          );
        }
      }, payload.pollIntervalMs);
    } catch (brokerError) {
      setIsGoogleSubmitting(false);
      setError(
        brokerError instanceof Error
          ? brokerError.message
          : "Unable to start broker Google sign-in.",
      );
    }
  });

  useEffect(() => {
    if (!showGoogleAuthUi || !hasDirectGoogleSignIn || !googleScriptReady || !googleButtonRef.current || session.user) {
      return;
    }

    const googleIdentity = window.google?.accounts?.id;

    if (!googleIdentity) {
      return;
    }

    googleButtonRef.current.innerHTML = "";
    googleIdentity.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (!response.credential) {
          setError("Google sign-in did not return a credential.");
          return;
        }

        void completeGoogleSignIn(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
    });
    googleIdentity.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: session.userCount === 0 ? "continue_with" : "signin_with",
      width: 320,
      logo_alignment: "left",
    });
  }, [completeGoogleSignIn, googleScriptReady, hasDirectGoogleSignIn, session.user, session.userCount, showGoogleAuthUi]);

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
    if (session.user?.role === "admin") {
      void refreshUsers();
      void refreshProviderConfigs();
      void refreshKnowledgeEntries();
      void refreshKnowledgeModelSuggestions();
      return;
    }

    setManagedUsers([]);
    setProviderConfigs([]);
    setKnowledgeEntries([]);
    setKnowledgeOverlapResults([]);
    setKnownModelsByProvider({});
  }, [session.user?.id, session.user?.role]);

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

  async function refreshUsers() {
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
          : "Unable to load users.",
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function refreshProviderConfigs() {
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
          : "Unable to load AI provider settings.",
      );
    } finally {
      setIsLoadingProviderConfigs(false);
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
          : "Unable to save the Anthropic API key.",
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
          : "Unable to save the OpenAI API key.",
      );
    } finally {
      setIsSavingOpenAiApiKey(false);
    }
  }

  async function refreshKnowledgeEntries() {
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
          : "Unable to load shared knowledge entries.",
      );
    } finally {
      setIsLoadingKnowledge(false);
    }
  }

  async function refreshKnowledgeModelSuggestions() {
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
          : "Unable to save the shared knowledge entry.",
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
          : "Unable to delete the shared knowledge entry.",
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
    setKnowledgeOverlapResults([]);
  }

  async function runKnowledgeDebugSearch() {
    const query = knowledgeDebugQuery.trim();

    if (!query) {
      setKnowledgeDebugResults([]);
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

      const payload = (await response.json()) as { results: AiKnowledgeDebugResult[] };
      setKnowledgeDebugResults(payload.results);
    } catch (knowledgeError) {
      setError(
        knowledgeError instanceof Error
          ? knowledgeError.message
          : "Unable to run the shared knowledge debug search.",
      );
    } finally {
      setIsRunningKnowledgeDebug(false);
    }
  }

  function toggleKnowledgeDebugModelId(modelId: string) {
    setKnowledgeDebugModelId((current) => current === modelId ? "" : modelId);
  }

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
    const submittedUsername = String(formData.get("username") ?? "").trim();
    const submittedDisplayName = String(formData.get("displayName") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");

    if (!submittedUsername || !submittedPassword) {
      setError("Username and password are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

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
            username: submittedUsername,
            displayName: submittedDisplayName,
            password: submittedPassword,
            rememberSession,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser };
      const nextSession = await fetchCurrentSession();

      if (!nextSession.user || nextSession.user.id !== payload.user.id) {
        throw new Error("Sign-in finished, but the session was not established. Reload and try again.");
      }

      onSessionChange(nextSession);
      setUsername("");
      setDisplayName("");
      setPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to complete user authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
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
        throw new Error("Sign-out did not clear the active session. Reload and try again.");
      }

      onSessionChange(nextSession);
      setManagedUsers([]);
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Unable to sign out.",
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
          preferredSystemPrompt: accountPreferredSystemPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const nextSession = await fetchCurrentSession();
      onSessionChange(nextSession);
      setAccountSummary("Account details and assistant style saved.");
      setAccountSummaryTone("success");
    } catch (accountError) {
      setError(
        accountError instanceof Error
          ? accountError.message
          : "Unable to save your account details.",
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
      setAccountSummary("Password updated for this local account.");
      setAccountSummaryTone("success");
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "Unable to reset your password.",
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
          : "Unable to update the user role.",
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
        `${payload.user.displayName} was deleted. Removed ${payload.deletedConversationCount} saved conversation${payload.deletedConversationCount === 1 ? "" : "s"}.`,
      );
      setBackupSummaryTone("warning");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the user.",
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
      setBackupSummary("Workspace backup exported.");
      setBackupSummaryTone("success");
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Unable to export the workspace backup.",
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
        throw new Error("That backup file is not in the expected workspace snapshot format.");
      }

      setPendingBackupSnapshot(parsed);
      setPendingBackupFileName(file.name);
      setBackupSummary(
        `Loaded backup ${file.name} with ${parsed.users.length} users, ${parsed.conversations.length} conversations, ${parsed.activityEvents.length} activity events, and ${parsed.jobHistory.length} jobs.`,
      );
      setBackupSummaryTone("success");
    } catch (backupError) {
      clearPendingBackupSelection();
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Unable to read the selected backup file.",
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
      const restoreOutcome = describeRestoreOutcome(previousUser, nextSession);
      onSessionChange(nextSession);
      clearPendingBackupSelection();
      setManagedUsers([]);
      setUsername("");
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
          : "Unable to restore the workspace backup.",
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
            <p className="section-label text-xs font-semibold">Accounts</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {isPageSurface
                ? isAdminSession
                  ? "Identity, providers, knowledge, and backup"
                  : "Account, preferences, and sign-in"
                : isAdminSession
                  ? "Users and backup"
                  : "Account and sign-in"}
            </h2>
            {isPageSurface ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
                {isAdminSession
                  ? "Access is the administrative control surface for local identity, hosted-provider credentials, shared knowledge grounding, and workspace recovery operations."
                  : "Use this page to manage your profile details, quick-help preference, password, and current sign-in session without exposing admin-only operations."}
              </p>
            ) : null}
          </div>
          <div className="ui-pill ui-pill-surface text-sm">
            {session.userCount} user{session.userCount === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}

      {isPageSurface ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">Signed-in user</p>
            <p className="mt-2 text-base font-semibold text-foreground">{session.user?.displayName ?? "No active user"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{session.user ? `${session.user.role} via ${session.user.authProvider === "google" ? "Google" : "local"} auth.` : "Local access gate only."}</p>
          </div>
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">{isAdminSession ? "Providers ready" : "Quick help"}</p>
            <p className="mt-2 text-base font-semibold text-foreground">{isAdminSession ? configuredProviderCount : isQuickHelpEnabled ? "Enabled" : "Muted"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{isAdminSession ? "Hosted gateway providers currently configured for use." : "Contextual help cards follow this device-local preference."}</p>
          </div>
          <div className="theme-surface-soft rounded-[24px] px-4 py-4">
            <p className="eyebrow text-muted">Access posture</p>
            <p className="mt-2 text-base font-semibold text-foreground">{session.user?.role === "admin" ? "Administrative" : session.user ? "Self-service" : "Entry required"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{isAdminSession ? "Backup restore and role changes stay gated to admin sessions." : "Only your own account settings appear here outside admin sessions."}</p>
          </div>
        </div>
      ) : null}

      {session.user ? (
        <div className={`mt-6 grid gap-6 ${isPageSurface ? "lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]" : ""}`}>
          <div className={`rounded-[28px] ${isPageSurface ? "theme-surface-elevated px-5 py-5" : "theme-surface-soft p-5"}`}>
            <p className="text-lg font-semibold text-foreground">{session.user.displayName}</p>
            <p className="mt-1 text-sm text-muted">@{session.user.username}</p>
            {session.user.email ? (
              <p className="mt-1 text-sm text-muted">{session.user.email}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <p className="ui-pill ui-pill-success inline-flex text-xs">
                {session.user.role}
              </p>
              <p className="ui-pill ui-pill-soft inline-flex border border-line text-xs text-muted">
                {session.user.authProvider === "google" ? "Google account" : "Local account"}
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {isAdminSession
                ? "Conversations remain scoped to the signed-in user while this session also unlocks role management, provider configuration, workspace recovery, and model operations. Your assistant style stays personal to this account."
                : "Conversations remain scoped to your signed-in account. This view keeps only your own profile, assistant style, preference, and password controls visible."}
            </p>
            <button
              className="ui-button ui-button-secondary mt-5 w-full px-4 py-2 text-sm sm:w-auto"
              data-help-id="access.logout"
              type="button"
              onClick={logout}
            >
              Sign out
            </button>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow text-muted">Account settings</p>
                <p className="mt-2 text-sm text-muted">
                  Manage your profile details, assistant style, quick-help preference, and local password from one place.
                </p>
              </div>
              <span className="ui-pill ui-pill-surface text-xs">
                {session.user.authProvider === "google" ? "Google sign-in" : "Local sign-in"}
              </span>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-foreground">Profile</p>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    Display name
                    <input
                      className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal text-foreground outline-none"
                      autoComplete="name"
                      value={accountDisplayName}
                      onChange={(event) => setAccountDisplayName(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    Email
                    <input
                      className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal text-foreground outline-none disabled:cursor-not-allowed disabled:bg-neutral-100"
                      autoComplete="email"
                      disabled={session.user.authProvider === "google"}
                      placeholder={session.user.authProvider === "google" ? "Managed by Google sign-in" : "name@example.com"}
                      type="email"
                      value={accountEmail}
                      onChange={(event) => setAccountEmail(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted/75">
                    Assistant style
                    <textarea
                      className="mt-2 min-h-36 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-normal leading-7 text-foreground outline-none"
                      value={accountPreferredSystemPrompt}
                      onChange={(event) => setAccountPreferredSystemPrompt(event.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">
                  {session.user.authProvider === "google"
                    ? "Google-managed accounts keep their provider email. You can still change the display name and default assistant style used for new chats."
                    : "Local accounts can leave email blank or store one address for identification and future recovery workflows. The assistant style becomes your per-user default for new chats."}
                </p>
                <button
                  className="ui-button ui-button-primary mt-4 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  disabled={isSavingAccountProfile}
                  type="button"
                  onClick={() => {
                    void saveAccountProfile();
                  }}
                >
                  {isSavingAccountProfile ? "Saving..." : "Save profile"}
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
                      <span className="block font-semibold text-foreground">Quick help popovers</span>
                      <span className="mt-1 block text-xs leading-6 text-muted">
                        {quickHelpPreferenceSummary}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted/85">
                        {quickHelpHint?.summary ?? "The first card in a session stays open until dismissed or turned off."}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="rounded-[24px] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">Password</p>
                  {session.user.authProvider === "local" ? (
                    <>
                      <div className="mt-4 space-y-3">
                        <input
                          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                          autoComplete="current-password"
                          placeholder="Current password"
                          type="password"
                          value={currentPasswordDraft}
                          onChange={(event) => setCurrentPasswordDraft(event.target.value)}
                        />
                        <input
                          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                          autoComplete="new-password"
                          placeholder="New password"
                          type="password"
                          value={nextPasswordDraft}
                          onChange={(event) => setNextPasswordDraft(event.target.value)}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-6 text-muted">
                        Local password resets require your current password and a new password with at least 8 characters.
                      </p>
                      <button
                        className="ui-button ui-button-secondary mt-4 w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        disabled={isSavingPassword}
                        type="button"
                        onClick={() => {
                          void resetPassword();
                        }}
                      >
                        {isSavingPassword ? "Updating..." : "Update password"}
                      </button>
                    </>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-muted">
                      Google-managed accounts do not use a local password here. Use your Google account security settings if you need to rotate credentials.
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
              className={`ui-button min-h-[3.5rem] justify-center px-4 py-3 text-sm ${
                mode === "login"
                  ? "ui-button-primary"
                  : "ui-button-secondary"
              }`}
              data-help-id="access.mode.login"
              type="button"
              onClick={() => setMode("login")}
            >
              Sign in
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
              Create account
            </button>
          </div>
          {showGoogleAuthUi ? (
            isBrokerGoogleSignIn ? (
              <button
                className="ui-button ui-button-secondary flex w-full items-center justify-center gap-3 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isGoogleSubmitting}
                type="button"
                onClick={() => {
                  void startBrokerGoogleSignIn();
                }}
              >
                <span className="text-base leading-none">G</span>
                <span>{isGoogleSubmitting ? "Waiting for Google sign-in..." : session.userCount === 0 ? "Continue with Google" : "Sign in with Google"}</span>
              </button>
            ) : hasDirectGoogleSignIn ? (
              <div className="theme-surface-soft rounded-[24px] px-4 py-4">
                <div className="flex items-center justify-center">
                  <div ref={googleButtonRef} className="min-h-[44px] w-full max-w-[320px]" />
                </div>
                {isGoogleSubmitting ? (
                  <p className="mt-3 text-center text-sm text-muted">
                    Signing in with Google...
                  </p>
                ) : null}
              </div>
            ) : hasLegacyGoogleRedirect ? (
              <button
                className="ui-button ui-button-secondary flex w-full items-center justify-center gap-3 px-5 py-3 text-sm"
                type="button"
                onClick={() => {
                  const rememberFlag = rememberSession ? "1" : "0";
                  window.location.href = `/api/users/google/start?rememberSession=${rememberFlag}`;
                }}
              >
                <span className="text-base leading-none">G</span>
                <span>{session.userCount === 0 ? "Continue with Google" : "Sign in with Google"}</span>
              </button>
            ) : (
              <button
                aria-disabled="true"
                className="ui-button ui-button-secondary flex w-full items-center justify-center gap-3 px-5 py-3 text-sm opacity-50"
                disabled
                type="button"
              >
                <span className="text-base leading-none">G</span>
                <span>{session.userCount === 0 ? "Continue with Google" : "Sign in with Google"}</span>
              </button>
            )
          ) : null}
          {showGoogleAuthUi ? (
            <p className="text-sm leading-6 text-muted">
              {isBrokerGoogleSignIn
                ? "This build uses a hosted auth broker. Users choose a Gmail account in the broker window and the app completes sign-in locally after approval."
                : hasDirectGoogleSignIn
                ? "This build includes publisher-configured Google sign-in. Users can choose a Gmail account and continue without local Google setup."
                  : hasLegacyGoogleRedirect
                  ? "This app is still using the older redirect-based Google OAuth flow for this deployment."
                  : "Google sign-in becomes one-click when the release is built with NEXT_PUBLIC_GOOGLE_CLIENT_ID."}
            </p>
          ) : null}
          <div className="flex items-center gap-3 pt-1 text-xs uppercase tracking-[0.18em] text-muted/70">
            <span className="h-px flex-1 bg-line" />
            <span>Local account</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            autoComplete="username"
            name="username"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          {mode === "register" ? (
            <input
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              autoComplete="name"
              name="displayName"
              placeholder="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          ) : null}
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            name="password"
            placeholder="Password"
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
              <span className="block font-semibold text-foreground">Stay logged in on this device</span>
              <span className="mt-1 block text-xs leading-6 text-muted">
                Checked keeps this device signed in for up to 7 days. Unchecked ends the session when the browser closes.
              </span>
            </span>
          </label>
          {error ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
          <p className="text-sm leading-6 text-muted">
            {session.userCount === 0
              ? "The first account becomes admin. Later accounts start as operators."
              : "Sign in to access your saved conversations and role-based controls."}
          </p>
          {showGoogleAuthUi ? (
            <p className="text-xs leading-6 text-muted">
              This stay-logged-in choice also applies to Google sign-in.
            </p>
          ) : null}
          <button
            className="ui-button ui-button-primary px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            data-help-id="access.submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      )}

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
                <p className="eyebrow text-muted">Role management</p>
                <p className="mt-2 text-sm text-muted">
                  Promote or restrict other local users.
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="access.users.refresh"
                disabled={isLoadingUsers}
                type="button"
                onClick={refreshUsers}
              >
                {isLoadingUsers ? "Refreshing..." : "Refresh users"}
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
                        <p className="mt-1 text-xs text-muted">@{user.username}</p>
                      </div>
                      <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                        {user.role}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                        {user.authProvider === "google" ? "Google" : "Local"}
                      </span>
                      {user.email ? (
                        <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                          {user.email}
                        </span>
                      ) : null}
                    </div>
                    {user.id === currentUserId ? (
                      <p className="mt-3 text-xs text-muted">
                        Your own role is locked in this panel.
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
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              data-help-id="access.role.change"
                              disabled={busyUserId === user.id || user.role === role}
                              type="button"
                              onClick={() => changeRole(user.id, role)}
                            >
                              {busyUserId === user.id && user.role !== role
                                ? "Updating..."
                                : role}
                            </button>
                          ))}
                        </div>

                        {pendingDeleteUserId === user.id ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                            <p className="font-semibold">Delete {user.displayName}?</p>
                            <p className="mt-2 leading-6">
                              This removes the local account and permanently deletes {user.savedConversationCount} saved conversation{user.savedConversationCount === 1 ? "" : "s"} for this user on this machine.
                            </p>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                              <button
                                className="ui-button ui-button-primary w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                data-help-id="access.user.delete.confirm"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => removeUser(user)}
                              >
                                {busyUserId === user.id ? "Deleting..." : "Confirm delete"}
                              </button>
                              <button
                                className="ui-button ui-button-secondary w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                data-help-id="access.user.delete.cancel"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => setPendingDeleteUserId(null)}
                              >
                                Cancel
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
                              Delete user
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  No users to manage yet.
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">AI providers</p>
                <p className="mt-2 text-sm text-muted">
                  Configure hosted-provider credentials for the shared AI gateway.
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="providers.refresh"
                disabled={isLoadingProviderConfigs}
                type="button"
                onClick={refreshProviderConfigs}
              >
                {isLoadingProviderConfigs ? "Refreshing..." : "Refresh providers"}
              </button>
            </div>

            <div ref={knowledgeFormRef} className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Anthropic</p>
                  <p className="mt-1 text-xs text-muted">
                    Enable Claude chat through the shared provider layer.
                  </p>
                </div>
                <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                  {providerConfigs.find((provider) => provider.providerId === "anthropic")?.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Enter or replace the Anthropic API key"
                type="password"
                value={anthropicApiKeyDraft}
                onChange={(event) => setAnthropicApiKeyDraft(event.target.value)}
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                Stored keys are encrypted at rest. Environment variables still take priority when present.
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
                  {isSavingAnthropicApiKey ? "Saving..." : "Save Anthropic key"}
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
                  Clear stored key
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">OpenAI</p>
                  <p className="mt-1 text-xs text-muted">
                    Enable GPT chat through the shared provider layer.
                  </p>
                </div>
                <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                  {providerConfigs.find((provider) => provider.providerId === "openai")?.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Enter or replace the OpenAI API key"
                type="password"
                value={openAiApiKeyDraft}
                onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                Stored keys are encrypted at rest. Environment variables still take priority when present.
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
                  {isSavingOpenAiApiKey ? "Saving..." : "Save OpenAI key"}
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
                  Clear stored key
                </button>
              </div>
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow text-muted">Shared knowledge</p>
                <p className="mt-2 text-sm text-muted">
                  Save reusable context snippets here so the AI can pull them into a reply when they match the request.
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-help-id="knowledge.refresh"
                disabled={isLoadingKnowledge}
                type="button"
                onClick={refreshKnowledgeEntries}
              >
                {isLoadingKnowledge ? "Refreshing..." : "Refresh knowledge"}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {editingKnowledgeId ? "Edit knowledge entry" : "New knowledge entry"}
                </p>
                {editingKnowledgeId ? (
                  <button
                    className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                    data-help-id="knowledge.edit.cancel"
                    type="button"
                    onClick={resetKnowledgeForm}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <input
                ref={knowledgeTitleInputRef}
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Entry title"
                value={knowledgeTitle}
                onChange={(event) => setKnowledgeTitle(event.target.value)}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder="Source label"
                  value={knowledgeSource}
                  onChange={(event) => setKnowledgeSource(event.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder="Tags, comma-separated"
                  value={knowledgeTags}
                  onChange={(event) => setKnowledgeTags(event.target.value)}
                />
              </div>
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Provider scope</p>
                  <p className="text-xs text-muted">
                    {knowledgeProviderIds.length > 0
                      ? `${knowledgeProviderIds.length} provider${knowledgeProviderIds.length === 1 ? "" : "s"} selected`
                      : "Empty means all providers"}
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
                        {provider.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Model scope, comma-separated exact model names"
                value={knowledgeModelIds}
                onChange={(event) => setKnowledgeModelIds(event.target.value)}
              />
              <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Known models</p>
                  <p className="text-xs text-muted">
                    {isLoadingKnowledgeModelSuggestions
                      ? "Loading suggestions..."
                      : "Tap to add or remove exact model names"}
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
                    <span className="text-xs text-muted">No model suggestions are available for the current provider scope yet.</span>
                  )}
                </div>
              </div>
              <textarea
                className="mt-3 min-h-32 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Shared context content"
                value={knowledgeContent}
                onChange={(event) => setKnowledgeContent(event.target.value)}
              />
              {isCheckingKnowledgeOverlaps || knowledgeOverlapResults.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-line/80 bg-[var(--panel)]/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Potential overlap</p>
                    <p className="text-xs text-muted">
                      {isCheckingKnowledgeOverlaps
                        ? "Checking existing entries..."
                        : knowledgeOverlapResults.length > 0
                          ? "Warnings only. Saving still works."
                          : "No close overlap found."}
                    </p>
                  </div>
                  {knowledgeOverlapResults.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {knowledgeOverlapResults.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                              <p className="mt-1 text-xs text-muted">{entry.source} · overlap score {entry.overlapScore}</p>
                            </div>
                            <span className="ui-pill ui-pill-soft border border-line text-xs text-muted">
                              {formatKnowledgeOverlapScope(entry.breakdown.scopeOverlap)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.breakdown.exactTitleMatch ? (
                              <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">Exact title match</span>
                            ) : null}
                            {entry.breakdown.exactContentMatch ? (
                              <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">Exact content match</span>
                            ) : null}
                            {entry.breakdown.sharedTags.map((tag) => (
                              <span key={tag} className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                                Shared tag: {tag}
                              </span>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-6 text-muted">
                            Title similarity {Math.round(entry.breakdown.titleSimilarity * 100)}% · Content similarity {Math.round(entry.breakdown.contentSimilarity * 100)}%
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="ui-button ui-button-chip ui-button-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={editingKnowledgeId === entry.id}
                              type="button"
                              onClick={() => startEditingKnowledgeEntry(entry)}
                            >
                              {editingKnowledgeId === entry.id ? "Editing this note" : "Edit existing note"}
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
                {isSavingKnowledge ? "Saving..." : editingKnowledgeId ? "Update knowledge entry" : "Save knowledge entry"}
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
                        Edit
                      </button>
                      <button
                        className="ui-button ui-button-chip ui-button-danger flex-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                        disabled={busyKnowledgeId === entry.id}
                        type="button"
                        onClick={() => {
                          void deleteKnowledgeEntry(entry.id);
                        }}
                      >
                        {busyKnowledgeId === entry.id ? "Deleting..." : "Delete"}
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
                        ? `Providers: ${formatKnowledgeProviderScope(entry.providerIds)}`
                        : "Providers: all"}
                    </span>
                    <span className="ui-pill ui-pill-neutral border border-line text-xs text-muted">
                      {entry.modelIds.length > 0
                        ? `Models: ${entry.modelIds.join(", ")}`
                        : "Models: all"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{entry.content}</p>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  No shared knowledge entries yet.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] bg-white px-4 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Retrieval debugger</p>
                  <p className="mt-1 text-xs text-muted">
                    Test a prompt against the shared knowledge index and inspect why each result ranked.
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
                  {isRunningKnowledgeDebug ? "Checking..." : "Run debug search"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  placeholder="Ask what should match, for example: anthropic scope checklist"
                  value={knowledgeDebugQuery}
                  onChange={(event) => setKnowledgeDebugQuery(event.target.value)}
                />
                <select
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                  value={knowledgeDebugProviderId}
                  onChange={(event) => setKnowledgeDebugProviderId(event.target.value as AiProviderId | "all")}
                >
                  <option value="all">All providers</option>
                  {KNOWLEDGE_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.label}</option>
                  ))}
                </select>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
                placeholder="Optional exact model name, for example: claude-haiku-4-5"
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
                  <span className="text-xs text-muted">No model suggestions are available for this debug scope yet.</span>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {knowledgeDebugResults.length > 0 ? knowledgeDebugResults.map((entry) => (
                  <div key={entry.id} className="rounded-[22px] border border-line/80 bg-[var(--panel)]/70 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          Score {entry.score} · {entry.source} · {formatKnowledgeProviderScope(entry.providerIds)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {entry.modelIds.length > 0 ? `Model scope: ${entry.modelIds.join(", ")}` : "Model scope: all"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        <span className="ui-pill ui-pill-neutral border border-line">phrase {entry.breakdown.exactPhraseBonus}</span>
                        <span className="ui-pill ui-pill-neutral border border-line">all tokens {entry.breakdown.allTokenBonus}</span>
                        <span className="ui-pill ui-pill-neutral border border-line">tag bonus {entry.breakdown.exactTagBonus}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                      <span className="ui-pill ui-pill-soft border border-line">title {entry.breakdown.titleScore}</span>
                      <span className="ui-pill ui-pill-soft border border-line">tags {entry.breakdown.tagsScore}</span>
                      <span className="ui-pill ui-pill-soft border border-line">source {entry.breakdown.sourceScore}</span>
                      <span className="ui-pill ui-pill-soft border border-line">chunk {entry.breakdown.chunkScore}</span>
                      {entry.breakdown.duplicatePenalty > 0 ? (
                        <span className="ui-pill ui-pill-soft border border-line">
                          duplicate penalty -{entry.breakdown.duplicatePenalty}
                        </span>
                      ) : null}
                    </div>
                    {entry.breakdown.duplicatePenalty > 0 && entry.breakdown.duplicateReferenceTitle ? (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        Suppressed against {entry.breakdown.duplicateReferenceTitle} (overlap {entry.breakdown.duplicateReferenceScore}).
                      </p>
                    ) : null}
                    {entry.breakdown.matchedTokens.length > 0 ? (
                      <p className="mt-3 text-xs leading-6 text-muted">
                        Matched tokens: {entry.breakdown.matchedTokens.join(", ")}
                      </p>
                    ) : null}
                    {entry.breakdown.matchedTags.length > 0 ? (
                      <p className="mt-1 text-xs leading-6 text-muted">
                        Exact tag hits: {entry.breakdown.matchedTags.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm leading-6 text-muted">{entry.content}</p>
                  </div>
                )) : (
                  <div className="rounded-[22px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                    {knowledgeDebugQuery.trim()
                      ? "No ranked matches yet for this debug search."
                      : "Run a debug search to inspect how the shared knowledge index ranks entries."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`rounded-[28px] border border-line/80 ${isPageSurface ? "theme-surface-panel p-6" : "theme-surface-soft p-5"}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
              <div>
                <p className="eyebrow text-muted">Workspace backup</p>
                <p className="mt-2 text-sm text-muted">
                  Export or restore the local users, conversations, activity log, and job history for this machine.
                </p>
              </div>
              <button
                className="ui-button ui-button-secondary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={isExportingBackup}
                type="button"
                onClick={exportWorkspaceBackup}
              >
                {isExportingBackup ? "Exporting..." : "Export backup"}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-amber-50 px-4 py-4 text-sm text-amber-950">
              Backup files are sensitive. They include local account metadata and the credential hashes required to restore sign-in access on this machine.
            </div>

            <p className="mt-3 text-sm text-muted">
              Keep exported backups in a trusted location and only restore files from sources you control.
            </p>

            {pendingBackupSnapshot ? (
              <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
                <p className="font-semibold">Restore replaces the current local workspace state.</p>
                <p className="mt-2 leading-6">
                  Users, conversations, activity events, and job history on this machine will be overwritten by the selected backup.
                </p>
                <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
                  <input
                    checked={backupRestoreConfirmed}
                    className="mt-1 h-4 w-4 rounded border-line"
                    type="checkbox"
                    onChange={(event) => setBackupRestoreConfirmed(event.target.checked)}
                  />
                  <span>
                    I understand this restore overwrites the current local workspace data and may sign out or change the access level of the current user.
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
                Choose backup file
              </button>
              {pendingBackupSnapshot ? (
                <button
                  className="ui-button ui-button-secondary w-full px-4 py-2 text-sm sm:w-auto"
                  type="button"
                  onClick={clearPendingBackupSelection}
                >
                  Clear selected backup
                </button>
              ) : null}
              <button
                aria-label={pendingBackupSnapshot ? "Confirm restore workspace backup" : "Restore workspace backup"}
                className="ui-button ui-button-primary w-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={!pendingBackupSnapshot || !backupRestoreConfirmed || isImportingBackup}
                type="button"
                onClick={importWorkspaceBackup}
              >
                {isImportingBackup
                  ? "Restoring..."
                  : pendingBackupSnapshot
                    ? "Confirm restore backup"
                    : "Restore backup"}
              </button>
            </div>

            {pendingBackupFileName ? (
              <p className="mt-3 text-xs text-muted">
                Selected backup: {pendingBackupFileName}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}