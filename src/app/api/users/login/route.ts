import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { sendLocalVerificationCode } from "@/lib/local-auth-email";
import { getUserByLoginIdentifier, issueEmailVerificationChallenge, toPublicUser, toSessionUser, verifyUserPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    rememberSession?: boolean;
    password?: string;
  };

  if (!payload.email?.trim() || !payload.password?.trim()) {
    return Response.json(
      { error: "Email address and password are required." },
      { status: 400 },
    );
  }

  const user = await getUserByLoginIdentifier(payload.email);

  if (user?.authProvider === "google") {
    await recordActivity({
      level: "warning",
      summary: "User login failed",
      details: `Password login attempted for Google account ${payload.email.trim().toLowerCase()}.`,
      type: "user.login_failed",
    });
    return Response.json({ error: "That account uses Google sign-in. Use the Google button instead." }, { status: 401 });
  }

  if (!user || !verifyUserPassword(user, payload.password)) {
    await recordActivity({
      level: "warning",
      summary: "User login failed",
      details: `Invalid login attempt for ${payload.email.trim().toLowerCase()}.`,
      type: "user.login_failed",
    });
    return Response.json({ error: "Invalid email address or password." }, { status: 401 });
  }

  if (!user.emailVerifiedAt || (user.requireEmailVerificationOnLogin && user.email)) {
    const challenge = await issueEmailVerificationChallenge({
      purpose: "login",
      rememberSession: payload.rememberSession === true,
      userId: user.id,
    });

    if (!challenge) {
      return Response.json({ error: "Unable to start email verification." }, { status: 500 });
    }

    await sendLocalVerificationCode({
      code: challenge.code,
      displayName: user.displayName,
      email: challenge.user.email ?? payload.email.trim().toLowerCase(),
      expiresAt: challenge.expiresAt,
      purpose: "login",
      requestedAt: challenge.user.pendingEmailVerification?.requestedAt ?? new Date().toISOString(),
    });

    await recordActivity({
      level: "info",
      summary: `Verification code sent: ${user.displayName}`,
      details: `A login verification code was sent to ${challenge.user.email}.`,
      type: "user.login_verification_sent",
    });

    return Response.json({
      expiresAt: challenge.expiresAt,
      user: toPublicUser(user),
      verificationRequired: true,
      verificationTarget: challenge.user.email,
    });
  }

  const cookie = createUserSessionCookie(toSessionUser(user), {
    persistent: payload.rememberSession === true,
  });
  const response = NextResponse.json({ user: toPublicUser(user) });

  await recordActivity({
    level: "info",
    summary: `User login: ${user.displayName}`,
    details: `Signed in as ${user.role}.`,
    type: "user.login",
  });

  response.cookies.set({
    name: cookie.name,
    value: cookie.value,
    httpOnly: true,
    ...(typeof cookie.maxAge === "number" ? { maxAge: cookie.maxAge } : {}),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}