import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { updateUserPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

  if (!currentUser) {
    return Response.json({ error: "Sign in to reset your password." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      currentPassword?: string;
      nextPassword?: string;
    };

    if (!payload.currentPassword?.trim() || !payload.nextPassword?.trim()) {
      return Response.json({ error: "Current password and new password are required." }, { status: 400 });
    }

    const updatedUser = await updateUserPassword({
      id: currentUser.id,
      currentPassword: payload.currentPassword,
      nextPassword: payload.nextPassword,
    });

    if (!updatedUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    await recordActivity({
      level: "info",
      summary: `Password reset: ${updatedUser.displayName}`,
      details: `${currentUser.displayName} reset their local account password.`,
      type: "user.password_reset",
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to reset the password." },
      { status: 400 },
    );
  }
}