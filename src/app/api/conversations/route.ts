import {
  createConversation,
  listConversationSummariesForUser,
  summarizeConversation,
} from "@/lib/conversations";
import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  if (!currentUser) {
    return Response.json({ conversations: [] });
  }

  const conversations = await listConversationSummariesForUser(currentUser.id);
  return Response.json({ conversations });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      title?: string;
      messages?: Array<{
        role: "system" | "user" | "assistant";
        content: string;
        toolCalls?: Array<{
          id: string;
          toolId: "search-knowledge" | "list-knowledge-bases" | "workspace-snapshot";
          title: string;
          arguments: Record<string, unknown>;
          status: "completed" | "failed";
          output: string;
        }>;
      }>;
      settings?: {
        model?: string;
        providerId?: "ollama" | "anthropic" | "openai";
        systemPrompt?: string;
        temperature?: number;
        useKnowledge?: boolean;
        groundingMode?: "off" | "balanced" | "strict";
        assistantProfileId?: string | null;
        enabledToolIds?: Array<"search-knowledge" | "list-knowledge-bases" | "workspace-snapshot">;
        knowledgeBaseIds?: string[];
        attachmentDocuments?: Array<{
          id: string;
          name: string;
          contentType: string;
          textContent: string;
          uploadedAt: string;
        }>;
      };
    };
    const currentUser = await getCurrentUser(request.headers.get("cookie"));

    if (!currentUser) {
      return Response.json({ error: "Sign in to save conversations." }, { status: 401 });
    }

    const conversation = await createConversation(currentUser.id, payload);

    await recordActivity({
      level: "info",
      summary: `Conversation created: ${conversation.title}`,
      details: `${conversation.messages.length} messages saved for ${currentUser.displayName}.`,
      type: "conversation.created",
    });

    return Response.json({
      conversation,
      summary: summarizeConversation(conversation),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected conversation creation error.",
      },
      { status: 500 },
    );
  }
}