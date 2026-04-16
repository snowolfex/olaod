import { NextResponse } from "next/server";

import {
  DESKTOP_WORKSPACE_PAGE_COOKIE_NAME,
  isDesktopWorkspacePage,
} from "@/lib/workspace-page";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    page?: string;
  };

  if (!isDesktopWorkspacePage(payload.page)) {
    return Response.json({ error: "Invalid workspace page." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, page: payload.page });

  response.cookies.set({
    name: DESKTOP_WORKSPACE_PAGE_COOKIE_NAME,
    value: payload.page,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}