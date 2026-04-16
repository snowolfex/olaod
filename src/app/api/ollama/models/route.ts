import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdminSession } from "@/lib/auth";
import { createJobRecord, updateJobRecord } from "@/lib/job-history";
import { getOllamaStatus } from "@/lib/ollama-status";
import { deleteOllamaModel } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getOllamaStatus();

  return Response.json(status, {
    status: status.isReachable ? 200 : 503,
  });
}

export async function DELETE(request: Request) {
  let jobId: string | null = null;

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
      type: "model.delete",
      target: name,
      requestedBy: currentUser?.displayName ?? "local-admin",
      progressMessage: "Delete queued.",
      status: "queued",
    });
    jobId = job.id;

    await updateJobRecord(job.id, {
      progressMessage: "Delete started.",
      status: "running",
      progressEntry: {
        statusLabel: "running",
      },
    });

    const upstream = await deleteOllamaModel(name);

    if (!upstream.ok) {
      const detail = await upstream.text();

      await updateJobRecord(job.id, {
        progressMessage:
          detail.trim() || `Delete request failed with ${upstream.status}.`,
        status: "failed",
      });

      await recordActivity({
        level: "warning",
        summary: `Model delete failed: ${name}`,
        details: detail.trim() || `Delete request failed with ${upstream.status}.`,
        type: "model.delete_failed",
      });

      return Response.json(
        {
          error:
            detail.trim() || `Delete request failed with ${upstream.status}.`,
        },
        { status: upstream.status },
      );
    }

    await updateJobRecord(job.id, {
      progressMessage: "Model deleted.",
      status: "succeeded",
    });

    await recordActivity({
      level: "warning",
      summary: `Model deleted: ${name}`,
      details: "A privileged model deletion request completed.",
      type: "model.deleted",
    });

    return Response.json({ ok: true, name });
  } catch (error) {
    if (jobId) {
      await updateJobRecord(jobId, {
        progressMessage:
          error instanceof Error
            ? error.message
            : "Unexpected model deletion error.",
        status: "failed",
      });
    }

    await recordActivity({
      level: "warning",
      summary: "Model delete route failed",
      details:
        error instanceof Error
          ? error.message
          : "Unexpected model deletion error.",
      type: "model.delete_failed",
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected model deletion error.",
      },
      { status: 500 },
    );
  }
}