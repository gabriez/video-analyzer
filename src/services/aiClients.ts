import { OpenAI } from "openai";

import { getConfig } from "../config.js";
import type { AiClients } from "../types/ai.js";

/**
 * Creates persistent, singleton-ready OpenAI client instances:
 * - whisperClient: points to local Speaches (faster-whisper) server
 * - visionClient: points to OpenRouter multimodal endpoint
 *
 * Reusing these clients across jobs preserves connection pools and HTTP keep-alive,
 * eliminating the overhead of instantiating new clients per task.
 */
export function createAiClients(options?: { whisperUrl?: string; openRouterApiKey?: string }): AiClients {
  let whisperUrl = options?.whisperUrl;
  let openRouterApiKey = options?.openRouterApiKey;

  if (!whisperUrl || !openRouterApiKey) {
    try {
      const config = getConfig();
      whisperUrl = whisperUrl ?? config.WHISPER_URL;
      openRouterApiKey = openRouterApiKey ?? config.OPENROUTER_API_KEY;
    } catch {
      whisperUrl = whisperUrl ?? "http://speaches:8000/v1";
      openRouterApiKey = openRouterApiKey ?? "dummy-key";
    }
  }

  const whisperClient = new OpenAI({
    baseURL: whisperUrl,
    apiKey: openRouterApiKey,
  });

  const visionClient = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: openRouterApiKey,
  });

  return {
    whisperClient,
    visionClient,
  };
}

let activeAiClients: AiClients | null = null;

export function getAiClients(): AiClients {
  if (!activeAiClients) {
    activeAiClients = createAiClients();
  }
  return activeAiClients;
}
