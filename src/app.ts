import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { getConfig } from "./config.js";
import { logger as defaultLogger } from "./logger.js";
import { createRequestLoggerMiddleware, type RequestWithLogger } from "./middleware/requestLogger.js";
import { createApiRouter } from "./routes/index.js";
import type { AppOptions } from "./types/app.js";

export type { AppOptions } from "./types/app.js";

/**
 * Creates and configures the Express application instance.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const appLogger = options.logger ?? defaultLogger.child({ context: "API" });

  app.use(createRequestLoggerMiddleware(appLogger));
  app.use(express.json());

  let token = options.bearerToken;
  if (!token) {
    try {
      token = getConfig().API_BEARER_TOKEN;
    } catch {
      token = "dummy-token";
    }
  }

  // Health and root check
  app.get("/", (_req: Request, res: Response) => {
    res.send("Hello World!");
  });

  // API Routes
  app.use("/api", createApiRouter(token, options.databaseService));

  // Global Error Handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const reqLogger = (req as RequestWithLogger).logger ?? appLogger;
    reqLogger.error(
      {
        err,
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip,
      },
      "Unhandled API error processing request",
    );
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
