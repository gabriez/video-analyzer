import type { ServerResponse } from "node:http";
import { Writable } from "node:stream";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../logger.js";
import { createRequestLoggerMiddleware, type RequestWithLogger } from "../middleware/requestLogger.js";

function createMemoryStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, lines };
}

describe("Pino Production Logger Integration", () => {
  it("should filter logs below configured log level", () => {
    const { stream, lines } = createMemoryStream();
    const logger = createLogger({ level: "info" }, stream);

    logger.debug("This debug should be filtered out");
    logger.info("This info should be recorded");
    logger.warn("This warn should be recorded");
    logger.error("This error should be recorded");

    expect(lines.length).toBe(3);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].level).toBe(30); // info
    expect(parsed[0].msg).toBe("This info should be recorded");
    expect(parsed[1].level).toBe(40); // warn
    expect(parsed[1].msg).toBe("This warn should be recorded");
    expect(parsed[2].level).toBe(50); // error
    expect(parsed[2].msg).toBe("This error should be recorded");
  });

  it("should be completely silent when level is silent", () => {
    const { stream, lines } = createMemoryStream();
    const logger = createLogger({ level: "silent" }, stream);

    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(lines.length).toBe(0);
  });

  it("should automatically redact sensitive tokens and credentials", () => {
    const { stream, lines } = createMemoryStream();
    const logger = createLogger({ level: "info" }, stream);

    logger.info(
      {
        bearerToken: "super-secret-1234",
        openRouterApiKey: "sk-or-secret-token",
        password: "user-password",
        username: "gabriel",
      },
      "User authentication checked",
    );

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.username).toBe("gabriel");
    expect(parsed.bearerToken).toBe("[REDACTED]");
    expect(parsed.openRouterApiKey).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
  });

  it("should attach child context and job metadata", () => {
    const { stream, lines } = createMemoryStream();
    const rootLogger = createLogger({ level: "info" }, stream);
    const jobLogger = rootLogger.child({ context: "Worker", jobId: 99 });

    jobLogger.info("Starting task execution");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.context).toBe("Worker");
    expect(parsed.jobId).toBe(99);
    expect(parsed.msg).toBe("Starting task execution");
  });

  it("should format errors and preserve stack trace in error logs", () => {
    const { stream, lines } = createMemoryStream();
    const logger = createLogger({ level: "error" }, stream);

    const testError = new Error("Connection failed to Whisper");
    logger.error({ err: testError, retryCount: 2 }, "Audio processing failed");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.msg).toBe("Audio processing failed");
    expect(parsed.retryCount).toBe(2);
    expect(parsed.err.message).toBe("Connection failed to Whisper");
    expect(parsed.err.stack).toBeDefined();
  });
});

describe("Request Logger Middleware with Pino", () => {
  it("should assign X-Request-Id and log request completion on finish", () => {
    const { stream, lines } = createMemoryStream();
    const logger = createLogger({ level: "debug" }, stream);

    const middleware = createRequestLoggerMiddleware(logger);

    let finishCallback: (() => void) | undefined;
    const req = {
      method: "POST",
      url: "/api/v1/analyze",
      originalUrl: "/api/v1/analyze",
      headers: { "user-agent": "test-client" },
      ip: "10.0.0.5",
      socket: { remoteAddress: "10.0.0.5" },
      get: (header: string) => (header.toLowerCase() === "user-agent" ? "test-client" : undefined),
    } as unknown as RequestWithLogger;

    const responseHeaders: Record<string, string> = {};
    const res = {
      statusCode: 202,
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
      },
      on: (event: string, callback: () => void) => {
        if (event === "finish") {
          finishCallback = callback;
        }
      },
    } as unknown as ServerResponse & { setHeader: (name: string, value: string) => void; on: (event: string, cb: () => void) => void };

    const next = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.id).toBeDefined();
    expect(responseHeaders["X-Request-Id"]).toBe(req.id);

    // Trigger finish
    expect(finishCallback).toBeDefined();
    finishCallback?.();

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.level).toBe(30); // info
    expect(parsed.statusCode).toBe(202);
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("/api/v1/analyze");
    expect(parsed.ip).toBe("10.0.0.5");
    expect(parsed.durationMs).toBeDefined();
    expect(parsed.msg).toContain("HTTP POST /api/v1/analyze 202");
  });
});
