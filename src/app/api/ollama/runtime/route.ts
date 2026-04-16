import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authError = await requireAdminSession(request);

    if (authError) {
      return authError;
    }

    const payload = (await request.json()) as {
      action?: "start" | "stop";
      name?: string;
    };
    const action = payload.action;
    const name = payload.name?.trim();

    if (!name) {
      return Response.json({ error: "Model name is required." }, { status: 400 });
    }

    if (action !== "start" && action !== "stop") {
      return Response.json({ error: "A valid runtime action is required." }, { status: 400 });
    }

    const currentUser = await getCurrentUser(request.headers.get("cookie"));
    const { startOllamaModel, stopOllamaModel } = await import("@/lib/ollama-admin");
    const status = action === "start"
      ? await startOllamaModel(name)
      : await stopOllamaModel(name);

    await recordActivity({
      level: "info",
      summary: action === "start" ? `Model started: ${name}` : `Model stopped: ${name}`,
      details: `${currentUser?.displayName ?? "local-admin"} ${action === "start" ? "started" : "stopped"} ${name}.`,
      type: action === "start" ? "ollama.model_started" : "ollama.model_stopped",
    });

    return Response.json(status);
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Ollama runtime action failed",
      details: error instanceof Error ? error.message : "Unexpected Ollama runtime failure.",
      type: "ollama.runtime_failed",
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unexpected Ollama runtime failure.",
      },
      { status: 500 },
    );
  }
}