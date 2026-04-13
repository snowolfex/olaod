import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { deleteConversationsForUser } from "@/lib/conversations";
import { countAdmins, deleteUser, getUserById, toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  if (currentUser?.role !== "admin") {
    return Response.json({ error: "Admin access is required." }, { status: 401 });
  }

  const { id } = await context.params;

  if (id === currentUser.id) {
    return Response.json(
      { error: "You cannot delete your own account in this panel." },
      { status: 400 },
    );
  }

  const targetUser = await getUserById(id);

  if (!targetUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  if (targetUser.role === "admin") {
    const adminCount = await countAdmins();

    if (adminCount <= 1) {
      return Response.json(
        { error: "At least one admin user must remain." },
        { status: 400 },
      );
    }
  }

  const deletedConversationCount = await deleteConversationsForUser(targetUser.id);
  const deletedUser = await deleteUser(targetUser.id);

  if (!deletedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  await recordActivity({
    level: "warning",
    summary: `User deleted: ${deletedUser.displayName}`,
    details: `${currentUser.displayName} deleted ${deletedUser.displayName} and removed ${deletedConversationCount} saved conversation${deletedConversationCount === 1 ? "" : "s"}.`,
    type: "user.deleted",
  });

  return Response.json({
    user: toPublicUser(deletedUser),
    deletedConversationCount,
  });
}