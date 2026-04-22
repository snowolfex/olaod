import { getAppUpdateStatus } from "@/lib/app-update";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getAppUpdateStatus();
  return Response.json(status, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}