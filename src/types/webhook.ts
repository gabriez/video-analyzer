export interface WebhookPayload {
  jobId: string;
  telegramId: string;
  videoUrl: string;
  originalPrompt: string | null;
  analysisPrompt: string | null;
  storagePrompt: string | null;
  hasTranscription: boolean;
  transcription: string | null;
  summary: string;
  completedAt: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  attempts: number;
}

export interface WebhookDeliveryOptions {
  webhookUrl?: string;
  authHeader?: string;
  authToken?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  requestTimeoutMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}
