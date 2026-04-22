import { recordActivity } from "@/lib/activity";
import { applyAppUpdate } from "@/lib/app-update";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  try {
    const result = await applyAppUpdate();

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} started a live patch to ${result.targetVersion}. The server will restart automatically to complete the update.`,
      level: "warning",
      summary: `Live patch started for ${result.targetVersion}`,
      type: "system.update_requested",
    });

    return Response.json({
      ok: true,
      restarting: true,
      targetVersion: result.targetVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start the live patch.";

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} attempted to start a live patch, but the request failed: ${message}`,
      level: "warning",
      summary: "Live patch failed to start",
      type: "system.update_failed",
    });

    return Response.json({ error: message }, { status: 400 });
  }
}