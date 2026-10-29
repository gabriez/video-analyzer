import axios, { AxiosError } from "axios";

import { getConfig } from "../config.js";
import type { WebhookDeliveryOptions, WebhookDeliveryResult, WebhookPayload } from "../types/webhook.js";

export class WebhookDeliveryError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WebhookDeliveryError";
  }
}

export type {
  WebhookDeliveryOptions,
  WebhookDeliveryResult,
  WebhookPayload,
} from "../types/webhook.js";

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates exponential backoff delay with random jitter.
 * Formula: min(maxDelay, baseDelay * 2^(attempt - 1)) + randomJitter(0, 1000)
 */
export function calculateBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(maxDelayMs, exponential);
  const jitter = Math.floor(Math.random() * 1000);
  return capped + jitter;
}

/**
 * Delivers the completed video analysis payload to the configured webhook endpoint.
 * Implements exponential backoff retry logic with jitter upon 4xx/5xx or network errors.
 *
 * @param payload Webhook data payload
 * @param options Delivery options (custom URL, headers, timeouts, or sleepFn for deterministic testing)
 * @returns WebhookDeliveryResult with success flag and total attempts
 * @throws WebhookDeliveryError when retries are exhausted or configuration is missing
 */
export async function sendWebhookNotification(payload: WebhookPayload, options: WebhookDeliveryOptions = {}): Promise<WebhookDeliveryResult> {
  let webhookUrl = options.webhookUrl;
  let authHeader = options.authHeader;
  let authToken = options.authToken;

  if (!webhookUrl) {
    try {
      const config = getConfig();
      webhookUrl = config.WEBHOOK_URL;
      authHeader = authHeader ?? config.WEBHOOK_AUTH_HEADER;
      authToken = authToken ?? config.WEBHOOK_AUTH_TOKEN;
    } catch {
      // Allowed fallback if options provide overrides
    }
  }

  if (!webhookUrl) {
    throw new WebhookDeliveryError("Webhook delivery URL is not specified or configured in environment");
  }

  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const maxDelayMs = options.maxDelayMs ?? 300000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  const sleep = options.sleepFn ?? defaultSleep;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authHeader && authToken) {
    headers[authHeader] = authToken;
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(webhookUrl, payload, {
        headers,
        timeout: requestTimeoutMs,
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          attempts: attempt,
        };
      }
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
        await sleep(delay);
      }
    }
  }

  const errorMessage =
    lastError instanceof AxiosError
      ? `HTTP ${lastError.response?.status ?? "NETWORK_ERROR"}: ${lastError.message}`
      : lastError instanceof Error
        ? lastError.message
        : String(lastError);

  throw new WebhookDeliveryError(`Failed to deliver webhook to ${webhookUrl} after ${maxAttempts} attempts. Last error: ${errorMessage}`, lastError);
}
