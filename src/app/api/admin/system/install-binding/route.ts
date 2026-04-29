import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { rebindCurrentInstall, rotateCurrentInstallId } from "@/lib/install-binding-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  try {
    const payload = (await request.json()) as { action?: "rebind" | "rotate-install-id" };

    if (payload.action !== "rebind" && payload.action !== "rotate-install-id") {
      return Response.json({ error: "A valid install binding action is required." }, { status: 400 });
    }

    const status = payload.action === "rotate-install-id"
      ? await rotateCurrentInstallId()
      : await rebindCurrentInstall();

    await recordActivity({
      details: payload.action === "rotate-install-id"
        ? `${currentUser?.displayName ?? "local-admin"} generated a new install ID for the current machine-bound install.`
        : `${currentUser?.displayName ?? "local-admin"} rebound the installed app to the current machine and location.`,
      level: "warning",
      summary: payload.action === "rotate-install-id" ? "Install ID rotated" : "Install binding repaired",
      type: payload.action === "rotate-install-id" ? "system.install_id_rotated" : "system.install_binding_rebound",
    });

    return Response.json({ ok: true, status }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to change the install binding.";

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} attempted to change the install binding, but the request failed: ${message}`,
      level: "warning",
      summary: "Install binding change failed",
      type: "system.install_binding_change_failed",
    });

    return Response.json({ error: message }, { status: 400 });
  }
}