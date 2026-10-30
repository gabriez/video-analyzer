import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sendWebhookNotification, WebhookDeliveryError, type WebhookPayload } from "../services/webhookService.js";

describe("Webhook Delivery Service with Exponential Backoff", () => {
  let server: http.Server;
  let serverPort: number;
  let webhookUrl: string;

  let requestCount = 0;
  let lastReceivedHeaders: http.IncomingHttpHeaders = {};
  let lastReceivedBody: unknown = null;
  let handlerMode: "always-200" | "fail-twice-then-200" | "always-500" | "timeout" = "always-200";

  const samplePayload: WebhookPayload = {
    jobId: "job-webhook-001",
    telegramId: "tg-user-999",
    videoUrl: "https://example.com/video.mp4",
    hasTranscription: true,
    transcription: "Sample text transcript",
    summary: "Structured markdown summary",
    completedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestCount++;
      lastReceivedHeaders = req.headers;

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", () => {
        try {
          lastReceivedBody = body ? JSON.parse(body) : null;
        } catch {
          lastReceivedBody = body;
        }

        if (handlerMode === "always-200") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
          return;
        }

        if (handlerMode === "fail-twice-then-200") {
          if (requestCount <= 2) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Service Unavailable" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true }));
          }
          return;
        }

        if (handlerMode === "always-500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal Server Error" }));
          return;
        }

        if (handlerMode === "timeout") {
          // Do not reply immediately; delay to exceed requestTimeoutMs
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(200);
              res.end("delayed");
            }
          }, 500);
          return;
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
          webhookUrl = `http://127.0.0.1:${serverPort}/webhook`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    requestCount = 0;
    lastReceivedHeaders = {};
    lastReceivedBody = null;
    handlerMode = "always-200";
  });

  it("should successfully deliver payload on first attempt (200 OK) with auth headers", async () => {
    const result = await sendWebhookNotification(samplePayload, {
      webhookUrl,
      authHeader: "X-N8N-Webhook-Token",
      authToken: "secret-token-xyz",
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(requestCount).toBe(1);
    expect(lastReceivedHeaders["x-n8n-webhook-token"]).toBe("secret-token-xyz");
    expect(lastReceivedHeaders["content-type"]).toContain("application/json");
    expect(lastReceivedBody).toEqual(samplePayload);
  });

  it("should retry with backoff when receiving 500/503 and succeed on subsequent attempt", async () => {
    handlerMode = "fail-twice-then-200";
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const result = await sendWebhookNotification(samplePayload, {
      webhookUrl,
      maxAttempts: 5,
      sleepFn: sleepMock,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(requestCount).toBe(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it("should exhaust retries and throw WebhookDeliveryError when target persistently responds with 500", async () => {
    handlerMode = "always-500";
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await expect(
      sendWebhookNotification(samplePayload, {
        webhookUrl,
        maxAttempts: 3,
        sleepFn: sleepMock,
      }),
    ).rejects.toThrowError(WebhookDeliveryError);

    expect(requestCount).toBe(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it("should respect custom timeout per HTTP request and retry upon timeout", async () => {
    handlerMode = "timeout";
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await expect(
      sendWebhookNotification(samplePayload, {
        webhookUrl,
        maxAttempts: 2,
        requestTimeoutMs: 100, // 100ms timeout against 500ms server delay
        sleepFn: sleepMock,
      }),
    ).rejects.toThrowError(WebhookDeliveryError);

    expect(requestCount).toBe(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });
});
