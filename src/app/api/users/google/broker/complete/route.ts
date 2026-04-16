import { NextResponse } from "next/server";

import { exchangeBrokerLogin } from "@/lib/auth-broker";
import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { countUsers, toPublicUser, toSessionUser, upsertGoogleUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { requestId?: string; rememberSession?: boolean };

    if (!payload.requestId?.trim()) {
      return Response.json({ error: "Broker request ID is required." }, { status: 400 });
    }

    const exchange = await exchangeBrokerLogin(payload.requestId);
    const { user, created } = await upsertGoogleUser({
      email: exchange.identity.email,
      providerSubject: exchange.identity.sub,
      displayName: exchange.identity.name,
      avatarUrl: exchange.identity.picture,
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
      summary: `${created ? "Broker Google user registered" : "Broker Google user login"}: ${user.displayName}`,
      details: `Signed in as ${user.role}.`,
      type: created ? "user.google_registered" : "user.google_login",
    });

    return response;
  } catch (error) {
    await recordActivity({
      level: "warning",
      summary: "Broker Google login failed",
      details: error instanceof Error ? error.message : "Unexpected auth broker error.",
      type: "user.google_login_failed",
    });

    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to complete broker sign-in." },
      { status: 401 },
    );
  }
}