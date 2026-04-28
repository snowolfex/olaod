export type AiProviderId = "ollama" | "anthropic" | "openai";

export type AiProviderKind = "local" | "hosted";

export type AiModelCapability =
  | "chat"
  | "streaming"
  | "runtime-load"
  | "model-pull"
  | "tool-use"
  | "vision"
  | "fine-tuning";

export type AiChatRole = "system" | "user" | "assistant";

export type AiToolId = "search-knowledge" | "list-knowledge-bases" | "workspace-snapshot";

export type AiToolCallStatus = "completed" | "failed";

export type AiToolCall = {
  id: string;
  toolId: AiToolId;
  title: string;
  arguments: Record<string, unknown>;
  status: AiToolCallStatus;
  output: string;
};

export type AiChatAttachmentDocument = {
  id: string;
  name: string;
  contentType: string;
  textContent: string;
  uploadedAt: string;
};

export type AiToolDefinition = {
  id: AiToolId;
  label: string;
  description: string;
  promptHint: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    required?: string[];
  };
};

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
  toolCalls?: AiToolCall[];
};

export type AiChatRequest = {
  providerId?: AiProviderId;
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  systemPrompt?: string;
  useKnowledge?: boolean;
  groundingMode?: AiGroundingMode;
  assistantProfileId?: string | null;
  enabledToolIds?: AiToolId[];
  knowledgeBaseIds?: string[];
  attachmentDocuments?: AiChatAttachmentDocument[];
};

export type AiGroundingMode = "off" | "balanced" | "strict";

export const AI_KNOWLEDGE_SOURCES_HEADER = "x-oload-knowledge-sources";
export const AI_TOOL_CALLS_HEADER = "x-oload-tool-calls";

export type AiProviderSummary = {
  id: AiProviderId;
  label: string;
  kind: AiProviderKind;
  enabled: boolean;
  configured: boolean;
  supportsChat: boolean;
  supportsStreaming: boolean;
  supportsModelLoading: boolean;
  supportsFineTuning: boolean;
  description: string;
  notes: string[];
};

export type AiModelSummary = {
  id: string;
  providerId: AiProviderId;
  providerLabel: string;
  name: string;
  displayName: string;
  installed: boolean;
  loaded: boolean;
  local: boolean;
  capabilities: AiModelCapability[];
  sizeBytes?: number;
  modifiedAt?: string;
};

export type AiTerminologyEntry = {
  id: "inference" | "model-pull" | "model-loading" | "training" | "fine-tuning" | "rag";
  label: string;
  definition: string;
  ollamaMeaning: string;
  multiProviderMeaning: string;
};

export type AiProviderConfigSummary = {
  providerId: Extract<AiProviderId, "anthropic" | "openai">;
  hasStoredApiKey: boolean;
  hasEnvironmentApiKey: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type AiKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  providerIds: AiProviderId[];
  modelIds: string[];
  updatedAt: string;
};

export type AiKnowledgeBase = {
  id: string;
  name: string;
  description: string;
  entryIds: string[];
  updatedAt: string;
};

export type AiKnowledgeSearchResult = AiKnowledgeEntry & {
  score: number;
};

export type AiKnowledgeScoreBreakdown = {
  exactPhraseBonus: number;
  allTokenBonus: number;
  exactTagBonus: number;
  titleScore: number;
  tagsScore: number;
  sourceScore: number;
  chunkScore: number;
  lexicalScoreTotal: number;
  vectorScore: number;
  vectorSimilarity: number | null;
  vectorAvailable: boolean;
  vectorModel: string | null;
  hybridScore: number;
  scoringMode: "lexical" | "hybrid";
  duplicatePenalty: number;
  duplicateReferenceTitle: string | null;
  duplicateReferenceScore: number;
  matchedTokens: string[];
  matchedTags: string[];
};

export type AiKnowledgeDebugResult = AiKnowledgeSearchResult & {
  breakdown: AiKnowledgeScoreBreakdown;
};

export type AiKnowledgeDebugResponse = {
  query: string;
  providerId?: AiProviderId | null;
  modelId?: string;
  scoringMode: "lexical" | "hybrid";
  vectorAvailable: boolean;
  vectorModel: string | null;
  knowledgeCount: number;
  fallbackReason: "no-query" | "no-knowledge" | "vector-unavailable" | null;
  results: AiKnowledgeDebugResult[];
};

export type AiKnowledgeOverlapBreakdown = {
  scopeOverlap: "exact" | "partial" | "global";
  titleSimilarity: number;
  contentSimilarity: number;
  sharedTagCount: number;
  sharedProviderCount: number;
  sharedModelCount: number;
  exactTitleMatch: boolean;
  exactContentMatch: boolean;
  sharedTags: string[];
  sharedProviders: AiProviderId[];
  sharedModels: string[];
};

export type AiKnowledgeOverlapResult = AiKnowledgeEntry & {
  overlapScore: number;
  breakdown: AiKnowledgeOverlapBreakdown;
};

export type AiKnowledgeCitation = {
  id: string;
  title: string;
  source: string;
  tags: string[];
  providerIds: AiProviderId[];
  modelIds: string[];
  excerpt: string;
  score: number;
};

export type AiWorkspaceProfile = {
  id: string;
  name: string;
  description: string;
  providerId: AiProviderId;
  model: string;
  systemPrompt: string;
  temperature: number;
  useKnowledge: boolean;
  groundingMode: Exclude<AiGroundingMode, "off">;
  enabledToolIds: AiToolId[];
  knowledgeBaseIds: string[];
  updatedAt: string;
};