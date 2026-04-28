import type { AiChatAttachmentDocument, AiGroundingMode, AiProviderId, AiToolId } from "@/lib/ai-types";
import type { OllamaChatMessage } from "@/lib/ollama";

export type ConversationSettings = {
  model: string;
  providerId: AiProviderId;
  systemPrompt: string;
  temperature: number;
  useKnowledge?: boolean;
  groundingMode?: AiGroundingMode;
  assistantProfileId?: string | null;
  enabledToolIds?: AiToolId[];
  knowledgeBaseIds?: string[];
  attachmentDocuments?: AiChatAttachmentDocument[];
};

export type StoredConversation = {
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  messages: OllamaChatMessage[];
  settings: ConversationSettings;
};

export type ConversationSummary = Pick<
  StoredConversation,
  "id" | "title" | "createdAt" | "updatedAt" | "archivedAt"
> & {
  messageCount: number;
  lastMessagePreview: string;
};

export type ActiveConversationSnapshot = {
  archivedAt: string | null;
  id: string | null;
  messageCount: number;
  modelName: string;
  title: string;
};