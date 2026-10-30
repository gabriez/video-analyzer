import type { OpenAI } from "openai";

export interface VisionAnalysisOptions {
  transcription: string | null;
  framePaths: string[];
  apiKey?: string;
  model?: string;
  client?: OpenAI;
}
