import { NextResponse } from "next/server";

import { sendLocalVerificationCode } from "@/lib/local-auth-email";
import { recordActivity } from "@/lib/activity";
import { createUser, issueEmailVerificationChallenge, toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
      displayName?: string;
      password?: string;
      rememberSession?: boolean;
    };

    if (!payload.email?.trim() || !payload.password?.trim()) {
      return Response.json(
        { error: "Email address and password are required." },
        { status: 400 },
      );
    }

    const user = await createUser({
      email: payload.email,
      displayName: payload.displayName ?? payload.email,
      password: payload.password,
    });
    const challenge = await issueEmailVerificationChallenge({
      purpose: "register",
      rememberSession: payload.rememberSession === true,
      userId: user.id,
    });

    if (!challenge) {
      throw new Error("Unable to start email verification.");
    }

    await sendLocalVerificationCode({
      code: challenge.code,
      displayName: user.displayName,
      email: challenge.user.email ?? payload.email.trim().toLowerCase(),
      expiresAt: challenge.expiresAt,
      purpose: "register",
      requestedAt: challenge.user.pendingEmailVerification?.requestedAt ?? new Date().toISOString(),
    });

    await recordActivity({
      level: "info",
      summary: `User registered: ${user.displayName}`,
      details: `Role assigned: ${user.role}. Verification code sent to ${user.email ?? payload.email.trim().toLowerCase()}.`,
      type: "user.registered",
    });

    return NextResponse.json({
      expiresAt: challenge.expiresAt,
      user: toPublicUser(user),
      verificationRequired: true,
      verificationTarget: user.email,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected user registration error.",
      },
      { status: 500 },
    );
  }
}