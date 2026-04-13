import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { countAdmins, getUserById, toPublicUser, updateUserRole } from "@/lib/users";
import type { UserRole } from "@/lib/user-types";

export const dynamic = "force-dynamic";

const VALID_ROLES: UserRole[] = ["viewer", "operator", "admin"];

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/users/[id]/role">,
) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  if (currentUser?.role !== "admin") {
    return Response.json({ error: "Admin access is required." }, { status: 401 });
  }

  const { id } = await context.params;

  if (id === currentUser.id) {
    return Response.json(
      { error: "You cannot change your own role in this panel." },
      { status: 400 },
    );
  }

  const payload = (await request.json()) as { role?: UserRole };
  const nextRole = payload.role;

  if (!nextRole || !VALID_ROLES.includes(nextRole)) {
    return Response.json({ error: "A valid role is required." }, { status: 400 });
  }

  const targetUser = await getUserById(id);

  if (!targetUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  if (targetUser.role === "admin" && nextRole !== "admin") {
    const adminCount = await countAdmins();

    if (adminCount <= 1) {
      return Response.json(
        { error: "At least one admin user must remain." },
        { status: 400 },
      );
    }
  }

  const updatedUser = await updateUserRole(id, nextRole);

  if (!updatedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  await recordActivity({
    level: nextRole === "viewer" ? "warning" : "info",
    summary: `User role updated: ${updatedUser.displayName}`,
    details: `${currentUser.displayName} changed role to ${nextRole}.`,
    type: "user.role_updated",
  });

  return Response.json({ user: toPublicUser(updatedUser) });
}