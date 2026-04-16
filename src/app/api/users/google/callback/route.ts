import { NextRequest, NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import {
  clearGoogleOAuthStateCookie,
  exchangeGoogleCode,
  readGoogleOAuthState,
} from "@/lib/google-auth";
import { toSessionUser, upsertGoogleUser } from "@/lib/users";

export const dynamic = "force-dynamic";

function withClearedStateCookie(response: NextResponse) {
  const cookie = clearGoogleOAuthStateCookie();

  response.cookies.set({
    name: cookie.name,
    value: cookie.value,
    httpOnly: true,
    maxAge: cookie.maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const verifiedState = code && state
    ? readGoogleOAuthState(request.headers.get("cookie"), state)
    : null;

  if (oauthError) {
    return withClearedStateCookie(
      NextResponse.redirect(new URL("/?loginError=google_access_denied", request.url)),
    );
  }

  if (!code || !state || !verifiedState) {
    return withClearedStateCookie(
      NextResponse.redirect(new URL("/?loginError=google_state_invalid", request.url)),
    );
  }

  try {
    const googleUser = await exchangeGoogleCode({
      code,
      origin: request.nextUrl.origin,
    });
    const { user, created } = await upsertGoogleUser({
      email: googleUser.email,
      providerSubject: googleUser.subject,
      displayName: googleUser.displayName,
      avatarUrl: googleUser.avatarUrl,
    });

    const cookie = createUserSessionCookie(toSessionUser(user), {
      persistent: verifiedState.rememberSession === true,
    });
    const response = withClearedStateCookie(NextResponse.redirect(new URL("/", request.url)));

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
      details: error instanceof Error ? error.message : "Unexpected Google OAuth error.",
      type: "user.google_login_failed",
    });

    return withClearedStateCookie(
      NextResponse.redirect(new URL("/?loginError=google_login_failed", request.url)),
    );
  }
}