import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { readAppServerControlStatus, requestAppServerControl } from "@/lib/app-control-broker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  try {
    const status = await readAppServerControlStatus();
    return Response.json(status, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Unable to read app server control status.",
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  try {
    const payload = (await request.json()) as { action?: "start" | "stop" | "restart" };

    if (payload.action !== "start" && payload.action !== "stop" && payload.action !== "restart") {
      return Response.json({ error: "A valid app server action is required." }, { status: 400 });
    }

    const result = await requestAppServerControl(payload.action);

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} requested an app server ${payload.action} action through the local control broker.`,
      level: payload.action === "stop" ? "warning" : "info",
      summary: `App server ${payload.action} requested`,
      type: `system.app_server_${payload.action}_requested`,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to control the app server.";

    await recordActivity({
      details: `${currentUser?.displayName ?? "local-admin"} attempted to control the app server, but the broker returned: ${message}`,
      level: "warning",
      summary: "App server control failed",
      type: "system.app_server_control_failed",
    });

    return Response.json({ error: message }, { status: 503 });
  }
}