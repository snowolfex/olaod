import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import {
  exportWorkspaceBackupSnapshot,
  importWorkspaceBackupSnapshot,
  validateWorkspaceBackupSnapshot,
} from "@/lib/workspace-backup";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const snapshot = await exportWorkspaceBackupSnapshot();
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  await recordActivity({
    level: "info",
    summary: "Workspace backup exported",
    details: `${currentUser?.displayName ?? "local-admin"} exported a workspace backup snapshot.`,
    type: "workspace.backup_exported",
  });

  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="oload-backup-${snapshot.exportedAt.replaceAll(":", "-")}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const payload = (await request.json()) as unknown;

  if (!validateWorkspaceBackupSnapshot(payload)) {
    return Response.json({ error: "A valid workspace backup snapshot is required." }, { status: 400 });
  }

  const summary = await importWorkspaceBackupSnapshot(payload);
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  await recordActivity({
    level: "warning",
    summary: "Workspace backup restored",
    details: `${currentUser?.displayName ?? "local-admin"} restored a workspace backup snapshot containing ${summary.userCount} users, ${summary.conversationCount} conversations, ${summary.activityEventCount} activity events, and ${summary.jobCount} jobs.`,
    type: "workspace.backup_restored",
  });

  return Response.json({
    ok: true,
    ...summary,
  });
}