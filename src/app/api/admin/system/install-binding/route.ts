import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { rebindCurrentInstall } from "@/lib/install-binding-actions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  try {
    const payload = (await request.json()) as { action?: "rebind" };

    if (payload.action !== "rebind") {
      return Response.json({ error: "A valid install binding action is required." }, { status: 400 });
    }

    const status = await rebindCurrentInstall();

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} rebound the installed app to the current machine and location.` ,
      level: "warning",
      summary: "Install binding repaired",
      type: "system.install_binding_rebound",
    });

    return Response.json({ ok: true, status }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to repair the install binding.";

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} attempted to repair the install binding, but the request failed: ${message}`,
      level: "warning",
      summary: "Install binding repair failed",
      type: "system.install_binding_rebind_failed",
    });

    return Response.json({ error: message }, { status: 400 });
  }
}