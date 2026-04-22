import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { toPublicUser, updateUserProfile } from "@/lib/users";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser(request.headers.get("cookie"));

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

    return Response.json({ user: toPublicUser(updatedUser) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update the account profile." },
      { status: 400 },
    );
  }
}