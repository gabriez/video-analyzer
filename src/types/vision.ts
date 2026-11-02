import type { OpenAI } from "openai";

export interface VisionAnalysisOptions {
  transcription: string | null;
  framePaths: string[];
  analysisPrompt?: string | null;
  apiKey?: string;
  model?: string;
  client?: OpenAI;
}
