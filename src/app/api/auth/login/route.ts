import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createAdminSessionCookie, verifyAdminPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const password = ((await request.json()) as { password?: string }).password?.trim();

  if (!password) {
    return Response.json({ error: "Password is required." }, { status: 400 });
  }

  if (!verifyAdminPassword(password)) {
    await recordActivity({
      level: "warning",
      summary: "Admin login failed",
      details: "Invalid password submitted to the admin login route.",
      type: "auth.login_failed",
    });
    return Response.json({ error: "Invalid admin password." }, { status: 401 });
  }

  const cookie = createAdminSessionCookie();
  const response = NextResponse.json({ ok: true });

  await recordActivity({
    level: "info",
    summary: "Admin login succeeded",
    details: "An admin session cookie was issued.",
    type: "auth.login",
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