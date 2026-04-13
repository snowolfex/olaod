import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { getUserByUsername, toPublicUser, toSessionUser, verifyUserPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    username?: string;
    password?: string;
  };

  if (!payload.username?.trim() || !payload.password?.trim()) {
    return Response.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const user = await getUserByUsername(payload.username);

  if (!user || !verifyUserPassword(user, payload.password)) {
    await recordActivity({
      level: "warning",
      summary: "User login failed",
      details: `Invalid login attempt for ${payload.username.trim().toLowerCase()}.`,
      type: "user.login_failed",
    });
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const cookie = createUserSessionCookie(toSessionUser(user));
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
    maxAge: cookie.maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}