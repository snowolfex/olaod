import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { consumeEmailVerificationChallenge, toPublicUser, toSessionUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      code?: string;
      email?: string;
    };

    if (!payload.email?.trim() || !payload.code?.trim()) {
      return Response.json({ error: "Email address and verification code are required." }, { status: 400 });
    }

    const result = await consumeEmailVerificationChallenge({
      code: payload.code,
      email: payload.email,
    });

    if (!result.user || result.error) {
      return Response.json({ error: result.error ?? "Unable to verify that code." }, { status: 401 });
    }

    const cookie = createUserSessionCookie(toSessionUser(result.user), {
      persistent: result.rememberSession === true,
    });
    const response = NextResponse.json({ user: toPublicUser(result.user) });

    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: true,
      ...(typeof cookie.maxAge === "number" ? { maxAge: cookie.maxAge } : {}),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    await recordActivity({
      level: "info",
      summary: `Email verified: ${result.user.displayName}`,
      details: result.purpose === "login"
        ? `Signed in as ${result.user.role} after login verification.`
        : `Email verified for ${result.user.role} account setup.`,
      type: result.purpose === "login" ? "user.login" : "user.email_verified",
    });

    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to verify this email code." },
      { status: 400 },
    );
  }
}
