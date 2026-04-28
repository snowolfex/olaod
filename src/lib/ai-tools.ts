import { getKnowledgeBaseEntryIds, listAiKnowledgeBases } from "@/lib/ai-knowledge-bases";
import { listAiWorkspaceProfiles } from "@/lib/ai-profiles";
import { listAiKnowledge, searchAiKnowledge } from "@/lib/ai-context";
import { getOllamaStatus } from "@/lib/ollama-status";
import type {
  AiChatAttachmentDocument,
  AiKnowledgeEntry,
  AiToolCall,
  AiToolDefinition,
  AiToolId,
} from "@/lib/ai-types";

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    id: "search-knowledge",
    label: "Search knowledge",
    description: "Search shared knowledge bases and attached chat documents for relevant context.",
    promptHint: "Use this when the answer depends on workspace knowledge, attached documents, or named internal references.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to run against the workspace knowledge.",
        },
        knowledgeBaseId: {
          type: "string",
          description: "Optional knowledge base id to scope the search to one reusable corpus.",
        },
      },
      required: ["query"],
    },
  },
  {
    id: "list-knowledge-bases",
    label: "List knowledge bases",
    description: "List reusable knowledge bases available to the current workspace.",
    promptHint: "Use this before searching if the user asks which knowledge bases exist or which corpus is attached.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    id: "workspace-snapshot",
    label: "Workspace snapshot",
    description: "Summarize the current local workspace AI status, including models and knowledge inventory.",
    promptHint: "Use this for operator questions about local runtime state, model availability, and workspace inventory.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

type ToolExecutionContext = {
  attachmentDocuments?: AiChatAttachmentDocument[];
  knowledgeBaseIds?: string[];
  providerId?: "ollama" | "anthropic" | "openai";
  modelId?: string;
};

function createToolCallId() {
  return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findToolDefinition(toolId: AiToolId) {
  return AI_TOOL_DEFINITIONS.find((tool) => tool.id === toolId);
}

function formatSearchResults(results: Awaited<ReturnType<typeof searchAiKnowledge>>) {
  if (results.length === 0) {
    return "No matching knowledge entries were found.";
  }

  return results.map((entry, index) => {
    const excerpt = entry.content.trim().replace(/\s+/g, " ").slice(0, 240);
    return [
      `${index + 1}. ${entry.title}`,
      `Source: ${entry.source}`,
      `Score: ${entry.score}`,
      `Excerpt: ${excerpt}`,
    ].join("\n");
  }).join("\n\n");
}

function buildAttachmentEntries(documents: AiChatAttachmentDocument[] | undefined): AiKnowledgeEntry[] {
  return (documents ?? []).map((document) => ({
    id: `attachment:${document.id}`,
    title: document.name,
    content: document.textContent,
    source: `chat-attachment:${document.name}`,
    tags: ["attachment"],
    providerIds: [],
    modelIds: [],
    updatedAt: document.uploadedAt,
  }));
}

async function executeKnowledgeSearch(argumentsValue: Record<string, unknown>, context: ToolExecutionContext) {
  const query = typeof argumentsValue.query === "string" ? argumentsValue.query.trim() : "";
  const requestedKnowledgeBaseId = typeof argumentsValue.knowledgeBaseId === "string"
    ? argumentsValue.knowledgeBaseId.trim()
    : "";

  if (!query) {
    throw new Error("The knowledge search tool requires a query.");
  }

  const scopedKnowledgeBaseIds = requestedKnowledgeBaseId
    ? [requestedKnowledgeBaseId]
    : (context.knowledgeBaseIds ?? []);
  const entryIds = await getKnowledgeBaseEntryIds(scopedKnowledgeBaseIds);
  const results = await searchAiKnowledge(query, 4, {
    providerId: context.providerId,
    modelId: context.modelId,
    entryIds: entryIds.length > 0 ? entryIds : undefined,
    additionalEntries: buildAttachmentEntries(context.attachmentDocuments),
  });

  return formatSearchResults(results);
}

async function executeListKnowledgeBases() {
  const bases = await listAiKnowledgeBases();

  if (bases.length === 0) {
    return "No reusable knowledge bases have been created yet.";
  }

  return bases.map((base, index) =>
    `${index + 1}. ${base.name} (${base.entryIds.length} entries)${base.description ? ` - ${base.description}` : ""}`,
  ).join("\n");
}

async function executeWorkspaceSnapshot() {
  const [ollamaStatus, knowledgeEntries, knowledgeBases, profiles] = await Promise.all([
    getOllamaStatus(),
    listAiKnowledge(),
    listAiKnowledgeBases(),
    listAiWorkspaceProfiles(),
  ]);

  return [
    `Ollama reachable: ${ollamaStatus.isReachable ? "yes" : "no"}`,
    `Downloaded models: ${ollamaStatus.modelCount}`,
    `Running models: ${ollamaStatus.runningCount}`,
    `Knowledge entries: ${knowledgeEntries.length}`,
    `Knowledge bases: ${knowledgeBases.length}`,
    `Agents/profiles: ${profiles.length}`,
  ].join("\n");
}

export async function executeAiToolCalls(
  requestedCalls: Array<{ toolId: AiToolId; arguments?: Record<string, unknown> }>,
  context: ToolExecutionContext,
) {
  const completedCalls: AiToolCall[] = [];

  for (const requestedCall of requestedCalls.slice(0, 3)) {
    const tool = findToolDefinition(requestedCall.toolId);

    if (!tool) {
      continue;
    }

    try {
      let output = "";
      if (tool.id === "search-knowledge") {
        output = await executeKnowledgeSearch(requestedCall.arguments ?? {}, context);
      } else if (tool.id === "list-knowledge-bases") {
        output = await executeListKnowledgeBases();
      } else {
        output = await executeWorkspaceSnapshot();
      }

      completedCalls.push({
        id: createToolCallId(),
        toolId: tool.id,
        title: tool.label,
        arguments: requestedCall.arguments ?? {},
        status: "completed",
        output,
      });
    } catch (error) {
      completedCalls.push({
        id: createToolCallId(),
        toolId: tool.id,
        title: tool.label,
        arguments: requestedCall.arguments ?? {},
        status: "failed",
        output: error instanceof Error ? error.message : "Tool execution failed.",
      });
    }
  }

  return completedCalls;
}