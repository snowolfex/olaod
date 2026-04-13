import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import {
  bulkDeleteArchivedConversations,
  bulkRestoreArchivedConversations,
} from "@/lib/conversations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request.headers.get("cookie"));

    if (!currentUser) {
      return Response.json({ error: "Sign in to manage conversations." }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: "delete-archived-empty" | "delete-archived-older-than" | "restore-archived-visible";
      olderThanDays?: number;
      ids?: string[];
      scope?: "selected" | "visible";
    };
    const actionScope = payload.scope === "selected" ? "selected" : "visible";

    if (!payload.action) {
      return Response.json({ error: "Bulk conversation action is required." }, { status: 400 });
    }

    if (
      payload.action !== "delete-archived-empty"
      && payload.action !== "delete-archived-older-than"
      && payload.action !== "restore-archived-visible"
    ) {
      return Response.json({ error: "Unsupported bulk conversation action." }, { status: 400 });
    }

    if (payload.action === "restore-archived-visible") {
      const ids = Array.isArray(payload.ids)
        ? payload.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const result = await bulkRestoreArchivedConversations(currentUser.id, ids);

      await recordActivity({
        level: result.restoredCount > 0 ? "info" : "warning",
        summary: `Archived chats restored: ${result.restoredCount}`,
        details: `${currentUser.displayName} restored ${result.restoredCount} archived conversation${result.restoredCount === 1 ? "" : "s"} from the current archived ${actionScope === "selected" ? "selection" : "view"}.`,
        type: "conversation.cleanup.archived-restore",
      });

      return Response.json({
        ...result,
        action: payload.action,
        olderThanDays: null,
      });
    }

    const olderThanDays = payload.action === "delete-archived-older-than"
      ? Math.max(1, Math.min(365, Math.round(payload.olderThanDays ?? 30)))
      : undefined;

    const result = await bulkDeleteArchivedConversations(currentUser.id, {
      action: payload.action,
      olderThanDays,
      ids: Array.isArray(payload.ids)
        ? payload.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : undefined,
    });

    await recordActivity({
      level: result.deletedCount > 0 ? "warning" : "info",
      summary:
        payload.action === "delete-archived-empty"
          ? `Archived empty chats cleanup: ${result.deletedCount} removed`
          : `Archived retention cleanup: ${result.deletedCount} removed`,
      details:
        payload.action === "delete-archived-empty"
          ? `${currentUser.displayName} removed ${result.deletedCount} archived empty conversation${result.deletedCount === 1 ? "" : "s"} from the current archived ${actionScope === "selected" ? "selection" : "view"}.`
          : `${currentUser.displayName} removed ${result.deletedCount} archived conversation${result.deletedCount === 1 ? "" : "s"} older than ${olderThanDays} day${olderThanDays === 1 ? "" : "s"} from the current archived ${actionScope === "selected" ? "selection" : "view"}.`,
      type:
        payload.action === "delete-archived-empty"
          ? "conversation.cleanup.archived-empty"
          : "conversation.cleanup.archived-retention",
    });

    return Response.json({
      ...result,
      action: payload.action,
      olderThanDays: olderThanDays ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected conversation cleanup error.",
      },
      { status: 500 },
    );
  }
}