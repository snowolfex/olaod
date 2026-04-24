import { NextResponse } from "next/server";

import { recordActivity } from "@/lib/activity";
import { createUserSessionCookie, getCurrentUser, getUserSessionPersistence } from "@/lib/auth";
import { toPublicUser, toSessionUser, updateUserProfile } from "@/lib/users";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const currentUser = await getCurrentUser(cookieHeader);

  if (!currentUser) {
    return Response.json({ error: "Sign in to update your account." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      displayName?: string;
      email?: string;
      preferredModel?: string;
      preferredTemperature?: number;
      preferredSystemPrompt?: string;
      preferredVoiceTranscriptionLanguage?: VoiceTranscriptionLanguage;
    };

    const updatedUser = await updateUserProfile({
      id: currentUser.id,
      displayName: payload.displayName ?? currentUser.displayName,
      email: payload.email,
      preferredModel: payload.preferredModel,
      preferredTemperature: payload.preferredTemperature,
      preferredSystemPrompt: payload.preferredSystemPrompt,
      preferredVoiceTranscriptionLanguage: payload.preferredVoiceTranscriptionLanguage,
    });

    if (!updatedUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    await recordActivity({
      level: "info",
      summary: `Account updated: ${updatedUser.displayName}`,
      details: `${currentUser.displayName} updated their account profile details.`,
      type: "user.updated",
    });

    const cookie = createUserSessionCookie(toSessionUser(updatedUser), {
      persistent: getUserSessionPersistence(cookieHeader),
    });
    const response = NextResponse.json({ user: toPublicUser(updatedUser) });

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
      { error: error instanceof Error ? error.message : "Unable to update the account profile." },
      { status: 400 },
    );
  }
}