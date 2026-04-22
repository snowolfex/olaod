import { recordActivity } from "@/lib/activity";
import { sendLocalVerificationCode } from "@/lib/local-auth-email";
import { getUserByLoginIdentifier, issueEmailVerificationChallenge } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
    };

    if (!payload.email?.trim()) {
      return Response.json({ error: "Email address is required." }, { status: 400 });
    }

    const user = await getUserByLoginIdentifier(payload.email);

    if (!user) {
      return Response.json({ error: "No local account matches that email address.", userExists: false }, { status: 404 });
    }

    if (user.authProvider !== "local") {
      return Response.json({ error: "That account uses Google sign-in. Use the Google button instead." }, { status: 409 });
    }

    const challenge = await issueEmailVerificationChallenge({
      purpose: "password-reset",
      rememberSession: false,
      userId: user.id,
    });

    if (!challenge) {
      return Response.json({ error: "Unable to start password reset." }, { status: 500 });
    }

    await sendLocalVerificationCode({
      code: challenge.code,
      displayName: user.displayName,
      email: challenge.user.email ?? payload.email.trim().toLowerCase(),
      expiresAt: challenge.expiresAt,
      purpose: "password-reset",
      requestedAt: challenge.user.pendingEmailVerification?.requestedAt ?? new Date().toISOString(),
    });

    await recordActivity({
      level: "info",
      summary: `Password reset code sent: ${user.displayName}`,
      details: `A password reset code was sent to ${challenge.user.email}.`,
      type: "user.password_reset_requested",
    });

    return Response.json({
      expiresAt: challenge.expiresAt,
      resetTarget: challenge.user.email,
      userExists: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to start password reset." },
      { status: 400 },
    );
  }
}