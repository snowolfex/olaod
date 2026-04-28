import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataStorePath } from "@/lib/data-store";
import { DEFAULT_USER_SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { OllamaChatMessage } from "@/lib/ollama";
import type {
  ConversationSettings,
  ConversationSummary,
  StoredConversation,
} from "@/lib/conversation-types";

type ConversationInput = {
  title?: string;
  messages?: OllamaChatMessage[];
  settings?: Partial<ConversationSettings>;
  archived?: boolean;
};

const STORE_PATH = getDataStorePath("conversations.json");

const DEFAULT_SETTINGS: ConversationSettings = {
  model: "",
  providerId: "ollama",
  systemPrompt: DEFAULT_USER_SYSTEM_PROMPT,
  temperature: 0.7,
  useKnowledge: false,
  groundingMode: "off",
  assistantProfileId: null,
  enabledToolIds: [],
  knowledgeBaseIds: [],
  attachmentDocuments: [],
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferTitle(messages: OllamaChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const base = firstUserMessage?.content.trim() || "New conversation";
  return base.slice(0, 48);
}

function previewMessage(messages: OllamaChatMessage[]) {
  const lastMessage = messages.at(-1)?.content.trim() || "";
  return lastMessage.slice(0, 96);
}

function normalizeConversation(
  ownerId: string,
  input: ConversationInput,
  previous?: StoredConversation,
): StoredConversation {
  const now = new Date().toISOString();
  const messages = input.messages ?? previous?.messages ?? [];
  const settings = {
    ...DEFAULT_SETTINGS,
    ...previous?.settings,
    ...input.settings,
  };
  const archivedAt = input.archived === undefined
    ? previous?.archivedAt ?? null
    : input.archived
      ? previous?.archivedAt ?? now
      : null;

  return {
    id: previous?.id ?? createId(),
    ownerId,
    title: input.title?.trim() || previous?.title || inferTitle(messages),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    archivedAt,
    messages,
    settings,
  };
}

async function ensureStore() {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, "[]\n", "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw) as Array<StoredConversation & { archivedAt?: string | null }>;

  return parsed.map((conversation) => ({
    ...conversation,
    archivedAt: conversation.archivedAt ?? null,
  }));
}

async function writeStore(conversations: StoredConversation[]) {
  await ensureStore();
  await writeFile(STORE_PATH, `${JSON.stringify(conversations, null, 2)}\n`, "utf8");
}

function sortByUpdatedAt(conversations: StoredConversation[]) {
  return [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function isArchivedOlderThanDays(conversation: StoredConversation, olderThanDays: number) {
  if (!conversation.archivedAt) {
    return false;
  }

  const archivedAtMs = new Date(conversation.archivedAt).getTime();

  if (Number.isNaN(archivedAtMs)) {
    return false;
  }

  return archivedAtMs <= Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
}

export function summarizeConversation(
  conversation: StoredConversation,
): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt ?? null,
    messageCount: conversation.messages.length,
    lastMessagePreview: previewMessage(conversation.messages),
  };
}

export async function listConversationSummaries() {
  const conversations = sortByUpdatedAt(await readStore());
  return conversations.map(summarizeConversation);
}

export async function listConversationSummariesForUser(ownerId: string) {
  const conversations = sortByUpdatedAt(await readStore()).filter(
    (conversation) => conversation.ownerId === ownerId,
  );
  return conversations.map(summarizeConversation);
}

export async function getConversation(id: string, ownerId?: string) {
  const conversations = await readStore();
  return (
    conversations.find(
      (conversation) =>
        conversation.id === id && (!ownerId || conversation.ownerId === ownerId),
    ) ?? null
  );
}

export async function getMostRecentConversation(ownerId?: string) {
  const conversations = sortByUpdatedAt(await readStore()).filter(
    (conversation) => (!ownerId || conversation.ownerId === ownerId) && !conversation.archivedAt,
  );
  return conversations[0] ?? null;
}

export async function createConversation(
  ownerId: string,
  input: ConversationInput = {},
) {
  const conversations = await readStore();
  const conversation = normalizeConversation(ownerId, input);
  conversations.push(conversation);
  await writeStore(sortByUpdatedAt(conversations));
  return conversation;
}

export async function updateConversation(
  ownerId: string,
  id: string,
  input: ConversationInput,
) {
  const conversations = await readStore();
  const index = conversations.findIndex(
    (conversation) => conversation.id === id && conversation.ownerId === ownerId,
  );

  if (index === -1) {
    return null;
  }

  const updated = normalizeConversation(ownerId, input, conversations[index]);
  conversations[index] = updated;
  await writeStore(sortByUpdatedAt(conversations));
  return updated;
}

export async function deleteConversation(ownerId: string, id: string) {
  const conversations = await readStore();
  const nextConversations = conversations.filter(
    (conversation) =>
      !(conversation.id === id && conversation.ownerId === ownerId),
  );

  if (nextConversations.length === conversations.length) {
    return false;
  }

  await writeStore(sortByUpdatedAt(nextConversations));
  return true;
}

export async function bulkDeleteArchivedConversations(
  ownerId: string,
  input: {
    action: "delete-archived-empty" | "delete-archived-older-than";
    olderThanDays?: number;
    ids?: string[];
  },
) {
  const conversations = await readStore();
  const allowedIds = input.ids ? new Set(input.ids) : null;
  const archivedOwnedConversations = conversations.filter(
    (conversation) => {
      if (conversation.ownerId !== ownerId || !conversation.archivedAt) {
        return false;
      }

      if (allowedIds && !allowedIds.has(conversation.id)) {
        return false;
      }

      return true;
    },
  );
  const archivedToDelete = archivedOwnedConversations.filter((conversation) => {
    if (input.action === "delete-archived-empty") {
      return conversation.messages.length === 0;
    }

    return isArchivedOlderThanDays(conversation, input.olderThanDays ?? 30);
  });

  if (archivedToDelete.length === 0) {
    return {
      deletedCount: 0,
      deletedIds: [] as string[],
    };
  }

  const deletedIds = new Set(archivedToDelete.map((conversation) => conversation.id));
  const nextConversations = conversations.filter((conversation) => !deletedIds.has(conversation.id));

  await writeStore(sortByUpdatedAt(nextConversations));

  return {
    deletedCount: archivedToDelete.length,
    deletedIds: archivedToDelete.map((conversation) => conversation.id),
  };
}

export async function bulkRestoreArchivedConversations(
  ownerId: string,
  ids?: string[],
) {
  const conversations = await readStore();
  const allowedIds = ids ? new Set(ids) : null;
  const restoredAt = new Date().toISOString();
  const restoredIds: string[] = [];
  const nextConversations = conversations.map((conversation) => {
    if (conversation.ownerId !== ownerId || !conversation.archivedAt) {
      return conversation;
    }

    if (allowedIds && !allowedIds.has(conversation.id)) {
      return conversation;
    }

    restoredIds.push(conversation.id);

    return {
      ...conversation,
      archivedAt: null,
      updatedAt: restoredAt,
    };
  });

  if (restoredIds.length === 0) {
    return {
      restoredCount: 0,
      restoredIds: [] as string[],
      restoredAt,
    };
  }

  await writeStore(sortByUpdatedAt(nextConversations));

  return {
    restoredCount: restoredIds.length,
    restoredIds,
    restoredAt,
  };
}

export async function deleteConversationsForUser(ownerId: string) {
  const conversations = await readStore();
  const nextConversations = conversations.filter(
    (conversation) => conversation.ownerId !== ownerId,
  );

  const deletedCount = conversations.length - nextConversations.length;

  if (deletedCount === 0) {
    return 0;
  }

  await writeStore(sortByUpdatedAt(nextConversations));
  return deletedCount;
}

export async function countConversationsByOwnerIds(ownerIds: string[]) {
  const counts = Object.fromEntries(ownerIds.map((ownerId) => [ownerId, 0])) as Record<string, number>;

  if (ownerIds.length === 0) {
    return counts;
  }

  const requestedOwnerIds = new Set(ownerIds);
  const conversations = await readStore();

  for (const conversation of conversations) {
    if (requestedOwnerIds.has(conversation.ownerId)) {
      counts[conversation.ownerId] = (counts[conversation.ownerId] ?? 0) + 1;
    }
  }

  return counts;
}