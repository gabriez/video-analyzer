import type { OpenAI } from "openai";

export interface STTOptions {
  whisperUrl?: string;
  model?: string;
  client?: OpenAI;
}
