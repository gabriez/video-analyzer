import type { OpenAI } from "openai";

export interface AiClients {
  whisperClient: OpenAI;
  visionClient: OpenAI;
}
