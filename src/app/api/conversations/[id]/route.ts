import {
  deleteConversation,
  getConversation,
  summarizeConversation,
  updateConversation,
} from "@/lib/conversations";
import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/conversations/[id]">,
) {
  const { id } = await context.params;
  const currentUser = await getCurrentUser(_request.headers.get("cookie"));

  if (!currentUser) {
    return Response.json({ error: "Sign in to load conversations." }, { status: 401 });
  }

  const conversation = await getConversation(id, currentUser.id);

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  return Response.json({ conversation });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/conversations/[id]">,
) {
  try {
    const { id } = await context.params;
    const currentUser = await getCurrentUser(request.headers.get("cookie"));

    if (!currentUser) {
      return Response.json({ error: "Sign in to update conversations." }, { status: 401 });
    }

    const payload = (await request.json()) as {
      title?: string;
      messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      settings?: {
        model?: string;
        providerId?: "ollama" | "anthropic" | "openai";
        systemPrompt?: string;
        temperature?: number;
      };
      archived?: boolean;
    };
    const previousConversation = await getConversation(id, currentUser.id);

    if (!previousConversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    const conversation = await updateConversation(currentUser.id, id, payload);

    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    const archivedStateChanged = Boolean(previousConversation.archivedAt) !== Boolean(conversation.archivedAt);

    if (archivedStateChanged) {
      await recordActivity({
        level: conversation.archivedAt ? "warning" : "info",
        summary: `${conversation.archivedAt ? "Conversation archived" : "Conversation restored"}: ${conversation.title}`,
        details: conversation.archivedAt
          ? `Archived by ${currentUser.displayName}. ${conversation.messages.length} messages remain stored.`
          : `Restored by ${currentUser.displayName}. ${conversation.messages.length} messages are available again.`,
        type: conversation.archivedAt ? "conversation.archived" : "conversation.restored",
      });
    } else {
      await recordActivity({
        level: "info",
        summary: `Conversation updated: ${conversation.title}`,
        details: `${conversation.messages.length} messages currently stored for ${currentUser.displayName}.`,
        type: "conversation.updated",
      });
    }

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
            : "Unexpected conversation update error.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/conversations/[id]">,
) {
  const { id } = await context.params;
  const currentUser = await getCurrentUser(_request.headers.get("cookie"));

  if (!currentUser) {
    return Response.json({ error: "Sign in to delete conversations." }, { status: 401 });
  }

  const deleted = await deleteConversation(currentUser.id, id);

  if (!deleted) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  await recordActivity({
    level: "warning",
    summary: `Conversation deleted: ${id}`,
    details: "A saved conversation record was removed.",
    type: "conversation.deleted",
  });

  return Response.json({ ok: true, id });
}