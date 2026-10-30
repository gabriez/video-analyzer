import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { logger as defaultLogger } from "../logger.js";
import type { Logger } from "../types/logger.js";

export interface RequestWithLogger extends Request {
  id?: string;
  logger?: Logger;
}

/**
 * Creates an Express middleware that logs incoming HTTP requests and responses.
 * Assigns or preserves a unique X-Request-Id for distributed tracing.
 */
export function createRequestLoggerMiddleware(logger: Logger = defaultLogger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawHeader = req.headers["x-request-id"];
    const requestId = typeof rawHeader === "string" && rawHeader.trim().length > 0 ? rawHeader.trim() : crypto.randomUUID();

    const reqWithLogger = req as RequestWithLogger;
    reqWithLogger.id = requestId;
    reqWithLogger.logger = logger.child({ context: "API", requestId });

    res.setHeader("X-Request-Id", requestId);

    const startTime = process.hrtime.bigint();

    res.on("finish", () => {
      const elapsedNs = process.hrtime.bigint() - startTime;
      const durationMs = Number(elapsedNs) / 1_000_000;
      const statusCode = res.statusCode;
      const method = req.method;
      const url = req.originalUrl || req.url;
      const ip = req.ip || req.socket.remoteAddress || "-";

      const meta = {
        method,
        url,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip,
        userAgent: req.get("user-agent"),
      };

      const line = `HTTP ${method} ${url} ${statusCode} in ${durationMs.toFixed(2)}ms`;

      // Log root healthcheck at debug level to avoid polluting container logs
      if (url === "/" && statusCode < 400) {
        reqWithLogger.logger?.debug(meta, line);
      } else if (statusCode >= 500) {
        reqWithLogger.logger?.error(meta, line);
      } else if (statusCode >= 400) {
        reqWithLogger.logger?.warn(meta, line);
      } else {
        reqWithLogger.logger?.info(meta, line);
      }
    });

    next();
  };
}

export const requestLogger = createRequestLoggerMiddleware();
