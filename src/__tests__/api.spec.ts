import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import AppDataSource, { initializeDatabase } from "../database/appDataSource.js";
import { ResumeDatabaseService } from "../services/database/resumeDatabaseService.js";
import { ResumeStatus } from "../types/resume.js";

describe("HTTP API Endpoints - POST /api/v1/analyze", () => {
  const TEST_BEARER_TOKEN = "api-secret-token-lan-999";
  let server: Server;
  let baseUrl: string;
  let databaseService: ResumeDatabaseService;

  beforeAll(async () => {
    process.env.API_BEARER_TOKEN = TEST_BEARER_TOKEN;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    await initializeDatabase();
    await AppDataSource.synchronize();

    databaseService = new ResumeDatabaseService(AppDataSource);
    const app = createApp({
      bearerToken: TEST_BEARER_TOKEN,
      databaseService,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    await databaseService.clear();
  });

  it("should return 202 Accepted and create database record when payload and Bearer token are valid", async () => {
    const payload = {
      telegramId: "tg-user-777",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };

    const response = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_BEARER_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(202);

    const body = (await response.json()) as {
      jobId: string;
      status: string;
      message: string;
    };

    expect(body.status).toBe(ResumeStatus.Created);
    expect(body.message).toBe("Video queued for analysis");
    expect(body.jobId).toBeDefined();

    // Verify record in SQLite database via injected service
    const savedEntity = await databaseService.findById(Number(body.jobId));

    expect(savedEntity).toBeDefined();
    expect(savedEntity?.telegramId).toBe("tg-user-777");
    expect(savedEntity?.videoUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(savedEntity?.status).toBe(ResumeStatus.Created);
  });

  it("should return 400 Bad Request with structured errors when url is missing or not a valid URL", async () => {
    const payload = {
      telegramId: "tg-user-777",
      url: "not-a-valid-http-url",
    };

    const response = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_BEARER_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string; details?: Record<string, string[]> };
    expect(body.error).toBe("Validation error");
    expect(body.details).toBeDefined();
    expect(body.details?.url).toBeDefined();
    expect(Array.isArray(body.details?.url)).toBe(true);
    expect(body.details?.url?.[0]).toContain("valid video URL");
  });

  it("should return 400 Bad Request when telegramId is missing or empty", async () => {
    const payload = {
      telegramId: "",
      url: "https://example.com/video.mp4",
    };

    const response = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_BEARER_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string; details?: Record<string, string[]> };
    expect(body.error).toBe("Validation error");
    expect(body.details?.telegramId).toBeDefined();
    expect(body.details?.telegramId?.[0]).toBe("telegramId is required");
  });

  it("should return 401 Unauthorized when Bearer token is omitted or invalid", async () => {
    const payload = {
      telegramId: "tg-user-777",
      url: "https://example.com/video.mp4",
    };

    // Missing header
    const resNoAuth = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(resNoAuth.status).toBe(401);

    // Invalid token
    const resBadToken = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token-xyz",
      },
      body: JSON.stringify(payload),
    });
    expect(resBadToken.status).toBe(401);
  });
});
