import fs from "node:fs";
import { OpenAI } from "openai";

import { getConfig } from "../config.js";
import type { VisionAnalysisOptions } from "../types/vision.js";

export class VisionAnalysisError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VisionAnalysisError";
  }
}

export type { VisionAnalysisOptions } from "../types/vision.js";

const SYSTEM_PROMPT = `You are an expert video summarizer and multimodal analyst.
Analyze the provided sequence of sampled video frames alongside any audio transcription text.
Provide a clear, cohesive, structured summary in Markdown format highlighting:
- The main topic and key takeaways
- Step-by-step actions or narrative flow observed
- Important visual or textual details shown in the video`;

/**
 * Analyzes video visual frames and audio transcription using OpenRouter multimodal models.
 *
 * @param options Transcription, frame image file paths, and optional OpenRouter credentials
 * @returns Structured Markdown summary of the video
 * @throws VisionAnalysisError if API fails, rate limits, or frames are missing/unreadable
 */
export async function analyzeVideoContext(options: VisionAnalysisOptions): Promise<string> {
  let apiKey = options.apiKey;
  let model = options.model;

  if (!apiKey || !model) {
    try {
      const config = getConfig();
      apiKey = apiKey ?? config.OPENROUTER_API_KEY;
      model = model ?? config.OPENROUTER_MODEL;
    } catch (err) {
      if (!apiKey) {
        throw new VisionAnalysisError("OpenRouter API key is required but not provided or configured in environment", err);
      }
    }
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

  if (options.transcription && options.transcription.trim().length > 0) {
    contentParts.push({
      type: "text",
      text: `Audio Transcription:\n"""\n${options.transcription.trim()}\n"""\n\nSampled video frames in sequential order:`,
    });
  } else {
    contentParts.push({
      type: "text",
      text: "Note: This video has no audio or the audio is silent. Please analyze the video based solely on the visual frame sequence below:",
    });
  }

  for (const framePath of options.framePaths) {
    if (!fs.existsSync(framePath)) {
      throw new VisionAnalysisError(`Video frame file does not exist at: ${framePath}`);
    }
    const base64Data = fs.readFileSync(framePath).toString("base64");
    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${base64Data}`,
      },
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: model ?? "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: contentParts,
        },
      ],
    });

    const choice = response.choices?.[0];
    if (!choice?.message?.content) {
      throw new VisionAnalysisError("OpenRouter returned empty choices or null message content");
    }

    return choice.message.content.trim();
  } catch (error) {
    if (error instanceof VisionAnalysisError) {
      throw error;
    }
    throw new VisionAnalysisError(`OpenRouter vision analysis failed: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}
