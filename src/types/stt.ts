import type { OpenAI } from "openai";

export interface STTOptions {
  whisperUrl?: string;
  client?: OpenAI;
}
