import { requireAdminSession } from "@/lib/auth";
import {
  queryJobHistory,
  type JobHistoryFilter,
  type JobHistoryTypeFilter,
} from "@/lib/job-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdminSession(request);

  if (authError) {
    return authError;
  }

  const { searchParams } = new URL(request.url);
  const rawFilter = searchParams.get("status");
  const rawType = searchParams.get("type");
  const rawRequestedBy = searchParams.get("requestedBy")?.trim();
  const rawLimit = Number(searchParams.get("limit"));
  const filter: JobHistoryFilter = rawFilter === "queued"
    || rawFilter === "running"
    || rawFilter === "failed"
    || rawFilter === "cancelled"
    || rawFilter === "completed"
    || rawFilter === "all"
    ? rawFilter
    : "all";
  const type: JobHistoryTypeFilter = rawType === "model.pull"
    || rawType === "model.delete"
    || rawType === "all"
    ? rawType
    : "all";
  const limit = Number.isFinite(rawLimit) ? rawLimit : 12;

  const result = await queryJobHistory({
    filter,
    type,
    limit,
    requestedBy: rawRequestedBy || undefined,
  });
  return Response.json(result);
}