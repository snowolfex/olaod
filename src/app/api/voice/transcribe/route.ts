import { transcribeEnglishAudioFile } from "@/lib/voice-transcription";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Recorded audio is required." }, { status: 400 });
    }

    const text = await transcribeEnglishAudioFile(file);

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