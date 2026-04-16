import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authError = await requireAdminSession(request);

    if (authError) {
      return authError;
    }

    const { ensureOllamaServerRunning } = await import("@/lib/ollama-admin");
    const status = await ensureOllamaServerRunning();
    const currentUser = await getCurrentUser(request.headers.get("cookie"));

    await recordActivity({
      level: "info",
      summary: "Ollama server ensured running",
      details: `${currentUser?.displayName ?? "local-admin"} ensured the Ollama server is reachable at ${status.baseUrl}.`,
      type: "ollama.server_started",
    });

    return Response.json(status);
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Ollama server start failed",
      details: error instanceof Error ? error.message : "Unexpected Ollama server start failure.",
      type: "ollama.server_start_failed",
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unexpected Ollama server start failure.",
      },
      { status: 500 },
    );
  }
}