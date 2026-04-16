import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthStateCookie,
  isGoogleRedirectOAuthConfigured,
} from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGoogleRedirectOAuthConfigured()) {
    return NextResponse.redirect(new URL("/?loginError=google_not_configured", request.url));
  }

  const rememberSession = request.nextUrl.searchParams.get("rememberSession") === "1";
  const { cookie, state } = createGoogleOAuthStateCookie(rememberSession);
  const authorizationUrl = buildGoogleAuthorizationUrl(request.nextUrl.origin, state);
  const response = NextResponse.redirect(authorizationUrl);

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