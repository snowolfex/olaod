import { transcribeAudioFile } from "@/lib/voice-transcription";
import { isVoiceTranscriptionLanguage } from "@/lib/voice-types";
import type { VoiceTranscriptionLanguage } from "@/lib/user-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const languageValue = formData.get("language");

    if (!(file instanceof File)) {
      return Response.json({ error: "Recorded audio is required." }, { status: 400 });
    }

    let language: VoiceTranscriptionLanguage = "auto";

    if (typeof languageValue === "string" && isVoiceTranscriptionLanguage(languageValue)) {
      language = languageValue as VoiceTranscriptionLanguage;
    }

    const text = await transcribeAudioFile(file, language);

    return Response.json({ text });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to transcribe recorded audio.",
      },
      { status: 400 },
    );
  }
}