import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { WaveFile } from "wavefile";
const ENGLISH_WHISPER_MODEL = "Xenova/whisper-tiny.en";
const MAX_TRANSCRIPTION_BYTES = 10 * 1024 * 1024;

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function mixDownToMono(samples: Float32Array | Float64Array | ArrayLike<number>[]) {
  if (!Array.isArray(samples)) {
    return Float32Array.from(samples);
  }

  const firstChannel = samples[0];
  if (!firstChannel) {
    return new Float32Array();
  }

  const monoSamples = new Float32Array(firstChannel.length);

  for (let sampleIndex = 0; sampleIndex < firstChannel.length; sampleIndex += 1) {
    let sum = 0;

    for (const channel of samples) {
      sum += channel[sampleIndex] ?? 0;
    }

    monoSamples[sampleIndex] = sum / samples.length;
  }

  return monoSamples;
}

function decodeWavFile(buffer: Uint8Array) {
  const wav = new WaveFile(buffer);
  wav.toBitDepth("32f");
  wav.toSampleRate(16_000);

  const samples = wav.getSamples(false, Float32Array as unknown as Function) as
    | Float32Array
    | Float64Array
    | ArrayLike<number>[];

  return mixDownToMono(samples);
}

async function getEnglishTranscriber() {
  env.allowLocalModels = true;

  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      ENGLISH_WHISPER_MODEL,
      {
        device: "cpu",
      },
    );
  }

  return transcriberPromise;
}

export async function transcribeEnglishAudioFile(file: File) {
  if (file.size === 0) {
    throw new Error("The recorded audio was empty.");
  }

  if (file.size > MAX_TRANSCRIPTION_BYTES) {
    throw new Error("The recorded audio is too large to transcribe.");
  }

  const audioInput = decodeWavFile(new Uint8Array(await file.arrayBuffer()));

  if (audioInput.length === 0) {
    throw new Error("The recorded audio did not contain usable samples.");
  }

  const transcriber = await getEnglishTranscriber();
  const result = await transcriber(audioInput, {
    chunk_length_s: 15,
    stride_length_s: 3,
  });

  return result.text.trim();
}