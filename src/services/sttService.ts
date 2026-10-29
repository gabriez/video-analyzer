import fs from "node:fs";
import { OpenAI } from "openai";

import { getConfig } from "../config.js";
import type { STTOptions } from "../types/stt.js";

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export type { STTOptions } from "../types/stt.js";

/**
 * Transcribes an audio file using Speaches / Whisper via the OpenAI-compatible transcription endpoint.
 *
 * @param audioPath Path to the input audio file
 * @param options Configurable options such as custom whisperUrl
 * @returns Trimmed transcription text, or empty string "" if silent/inaudible
 * @throws TranscriptionError on non-existent file, network failure, or API rejection
 */
export async function transcribeAudio(audioPath: string, options: STTOptions = {}): Promise<string> {
  if (!fs.existsSync(audioPath)) {
    throw new TranscriptionError(`Audio file does not exist at: ${audioPath}`);
  }

  let client = options.client;

  if (!client) {
    let whisperUrl = options.whisperUrl;
    if (!whisperUrl) {
      try {
        whisperUrl = getConfig().WHISPER_URL;
      } catch {
        whisperUrl = "http://speaches:8000/v1";
      }
    }

    client = new OpenAI({
      baseURL: whisperUrl,
      apiKey: "dummy-key-for-speaches",
    });
  }

  try {
    const fileStream = fs.createReadStream(audioPath);
    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
    });

    return response.text ? response.text.trim() : "";
  } catch (error) {
    if (error instanceof TranscriptionError) {
      throw error;
    }
    throw new TranscriptionError(`Failed to transcribe audio file at ${audioPath}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}
