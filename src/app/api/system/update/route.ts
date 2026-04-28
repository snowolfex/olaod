import { readAppUpdateStatus } from "@/lib/app-update";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const status = await readAppUpdateStatus({ forceRefresh: refresh });
  return Response.json(status, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}