import { recordActivity } from "@/lib/activity";
import { requireAdminSession } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { createJobRecord } from "@/lib/job-history";
import { executePullJob } from "@/lib/pull-job-executor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authError = await requireAdminSession(request);

    if (authError) {
      return authError;
    }

    const payload = (await request.json()) as { name?: string };
    const name = payload.name?.trim();

    if (!name) {
      return Response.json({ error: "Model name is required." }, { status: 400 });
    }

    const currentUser = await getCurrentUser(request.headers.get("cookie"));
    const job = await createJobRecord({
      type: "model.pull",
      target: name,
      requestedBy: currentUser?.displayName ?? "local-admin",
      progressMessage: "Pull queued.",
      status: "queued",
    });

    await recordActivity({
      level: "info",
      summary: `Model pull requested: ${name}`,
      details: "A privileged model pull request was started.",
      type: "model.pull_requested",
    });
    const encoder = new TextEncoder();

    return new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await executePullJob({
            jobId: job.id,
            modelName: name,
            signal: request.signal,
            onMessage: (message) => {
              controller.enqueue(encoder.encode(`${message}\n`));
            },
          });
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Oload-Job-Id": job.id,
      },
    });
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Model pull route failed",
      details:
        error instanceof Error ? error.message : "Unexpected model pull error.",
      type: "model.pull_failed",
    });

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected model pull error.",
      },
      { status: 500 },
    );
  }
}