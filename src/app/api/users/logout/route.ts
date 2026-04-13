import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { getUserSessionCookieName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  await recordActivity({
    level: "info",
    summary: "User logged out",
    details: "The application user session cookie was removed.",
    type: "user.logout",
  });

  response.cookies.set({
    name: getUserSessionCookieName(),
    value: "",
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}