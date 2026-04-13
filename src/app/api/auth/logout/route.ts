import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { getSessionCookieName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await recordActivity({
    level: "info",
    summary: "Admin session cleared",
    details: "The admin session cookie was removed.",
    type: "auth.logout",
  });

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: "",
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}