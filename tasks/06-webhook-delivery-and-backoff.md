# Task 06: Webhook Delivery & Exponential Backoff

## Objective

Implement a resilient webhook dispatcher that posts the final video analysis summary to the configured n8n webhook, with custom authentication headers and exponential backoff retry logic.

## Requirements

- `webhookService.ts`:
  - `sendWebhookNotification(payload: WebhookPayload): Promise<WebhookDeliveryResult>`
  - Headers:
    - `Content-Type: application/json`
    - Injects `[config.webhookAuthHeader]: config.webhookAuthToken` if configured.
  - Payload schema:

    ```typescript
    interface WebhookPayload {
      jobId: string;
      telegramId: string;
      videoUrl: string;
      hasTranscription: boolean;
      transcription: string | null;
      summary: string;
      completedAt: string;
    }
    ```
  - Retry Algorithm:
    - Max attempts: 5.
    - Base delay: 2000 ms.
    - Max delay: 300000 ms (5 min).
    - Formula: `min(maxDelay, baseDelay * 2^(attempt - 1)) + randomJitter(0, 1000)`.
  - Return `{ success: true, attempts }` on HTTP 2xx.
  - Throws `WebhookDeliveryError` after all retries are exhausted.

## Tests to Implement (`src/__tests__/webhook.spec.ts`)

- [x] Successfully delivers payload on first attempt (200 OK) with auth headers.
- [x] Retries with backoff when receiving 500/503 and succeeds on subsequent attempt.
- [x] Exhausts retries when target persistently responds with 500 or times out.
- [x] Respects custom timeout per HTTP request.
