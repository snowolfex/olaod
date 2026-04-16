import { getCurrentUser, getUserSessionStatus } from "@/lib/auth";
import { countUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const baseStatus = getUserSessionStatus(cookieHeader);
  const user = await getCurrentUser(cookieHeader);
  const userCount = await countUsers();

  return Response.json({
    authAvailable: baseStatus.authAvailable,
    googleAuthEnabled: baseStatus.googleAuthEnabled,
    googleAuthMode: baseStatus.googleAuthMode,
    user,
    userCount,
  });
}