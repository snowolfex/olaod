import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  if (currentUser?.role !== "admin") {
    return Response.json({ error: "Admin access is required." }, { status: 401 });
  }

  const users = await listUsers();
  return Response.json({ users });
}