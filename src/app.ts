import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { getConfig } from "./config.js";
import { createApiRouter } from "./routes/index.js";

export interface AppOptions {
  bearerToken?: string;
}

/**
 * Creates and configures the Express application instance.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();

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
  app.use("/api", createApiRouter(token));

  // Global Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    console.error("Unhandled API error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
