import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { getGoogleClientId } from "@/lib/google-auth";
import { countUsers, toPublicUser, toSessionUser, upsertGoogleUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type GoogleTokenPayload = {
  credential?: string;
  rememberSession?: boolean;
};

const googleClient = new OAuth2Client();

export async function POST(request: Request) {
  const clientId = getGoogleClientId();

  if (!clientId) {
    return Response.json({ error: "Google sign-in is not configured." }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as GoogleTokenPayload;

    if (!payload.credential?.trim()) {
      return Response.json({ error: "Google credential is required." }, { status: 400 });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: payload.credential,
      audience: clientId,
    });
    const tokenPayload = ticket.getPayload();

    if (!tokenPayload?.sub || !tokenPayload.email || !tokenPayload.email_verified) {
      return Response.json({ error: "Google sign-in requires a verified email address." }, { status: 401 });
    }

    const { user, created } = await upsertGoogleUser({
      email: tokenPayload.email,
      providerSubject: tokenPayload.sub,
      displayName: tokenPayload.name ?? tokenPayload.email,
      avatarUrl: tokenPayload.picture,
    });
    const cookie = createUserSessionCookie(toSessionUser(user), {
      persistent: payload.rememberSession === true,
    });
    const userCount = await countUsers();
    const response = NextResponse.json({
      user: toPublicUser(user),
      userCount,
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

    await recordActivity({
      level: "info",
      summary: `${created ? "Google user registered" : "Google user login"}: ${user.displayName}`,
      details: `Signed in as ${user.role}.`,
      type: created ? "user.google_registered" : "user.google_login",
    });

    return response;
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Google login failed",
      details: error instanceof Error ? error.message : "Unexpected Google identity error.",
      type: "user.google_login_failed",
    });

    return Response.json(
      { error: error instanceof Error ? error.message : "Google sign-in failed." },
      { status: 401 },
    );
  }
}