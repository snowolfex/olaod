import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie } from "@/lib/auth";
import { createUser, toPublicUser, toSessionUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
    };

    if (!payload.username?.trim() || !payload.password?.trim()) {
      return Response.json(
        { error: "Username and password are required." },
        { status: 400 },
      );
    }

    const user = await createUser({
      username: payload.username,
      displayName: payload.displayName ?? payload.username,
      password: payload.password,
    });
    const cookie = createUserSessionCookie(toSessionUser(user));
    const response = NextResponse.json({ user: toPublicUser(user) });

    await recordActivity({
      level: "info",
      summary: `User registered: ${user.displayName}`,
      details: `Role assigned: ${user.role}.`,
      type: "user.registered",
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