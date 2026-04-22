import { recordActivity } from "@/lib/activity";
import { consumeEmailVerificationChallenge, resetUserPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      code?: string;
      email?: string;
      nextPassword?: string;
    };

    if (!payload.email?.trim() || !payload.code?.trim() || !payload.nextPassword?.trim()) {
      return Response.json({ error: "Email address, verification code, and new password are required." }, { status: 400 });
    }

    const verification = await consumeEmailVerificationChallenge({
      code: payload.code,
      email: payload.email,
      purpose: "password-reset",
    });

    if (!verification.user || verification.error) {
      return Response.json({ error: verification.error ?? "Unable to verify that code." }, { status: 401 });
    }

    const updatedUser = await resetUserPassword({
      id: verification.user.id,
      nextPassword: payload.nextPassword,
    });

    if (!updatedUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    await recordActivity({
      level: "info",
      summary: `Password reset completed: ${updatedUser.displayName}`,
      details: `${updatedUser.displayName} completed a code-based password reset.`,
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