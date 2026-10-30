import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { logger as defaultLogger } from "../logger.js";
import type { Logger } from "../types/logger.js";
import type { RequestWithLogger } from "./requestLogger.js";

/**
 * Validates a provided token against an expected token in constant time.
 * Handles length mismatches deterministically to mitigate timing side-channel attacks.
 */
export function isTokenValid(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    // Constant-time dummy comparison to prevent short-circuit timing leaks
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Creates an Express middleware that validates incoming requests against
 * a static Bearer token.
 */
export function createAuthMiddleware(expectedToken: string, logger: Logger = defaultLogger): RequestHandler {
  if (!expectedToken || expectedToken.trim().length === 0) {
    throw new Error("createAuthMiddleware requires a non-empty expectedToken string");
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const reqLogger = (req as RequestWithLogger).logger ?? logger;

    if (!authHeader) {
      reqLogger.warn(
        {
          path: req.originalUrl || req.url,
          ip: req.ip,
        },
        "Unauthorized request: missing Authorization header",
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const match = authHeader.match(/^bearer\s+(\S+)$/i);
    if (!match?.[1]) {
      reqLogger.warn(
        {
          path: req.originalUrl || req.url,
          ip: req.ip,
        },
        "Unauthorized request: malformed Authorization header",
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = match[1];
    if (!isTokenValid(token, expectedToken)) {
      reqLogger.warn(
        {
          path: req.originalUrl || req.url,
          ip: req.ip,
        },
        "Unauthorized request: invalid Bearer token",
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
