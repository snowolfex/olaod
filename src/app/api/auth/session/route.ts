import { getAdminSessionStatus } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const status = getAdminSessionStatus(request.headers.get("cookie"));
  return Response.json(status);
}