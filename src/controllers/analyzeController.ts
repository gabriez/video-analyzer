import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { logger as defaultLogger } from "../logger.js";
import type { RequestWithLogger } from "../middleware/requestLogger.js";
import { getResumeDatabaseService } from "../services/database/resumeDatabaseService.js";
import type { IResumeDatabaseService } from "../types/database.js";
import type { Logger } from "../types/logger.js";

export const analyzeRequestSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  url: z.url("A valid video URL is required"),
});

export type { AnalyzeRequest } from "../types/api.js";

/**
 * Recursively flattens Zod v4's treeifyError data structure into a clean, intuitive map of field names to error messages.
 * e.g. { "telegramId": ["telegramId is required"], "url": ["A valid video URL is required"] }
 */
export function parseTreeErrors(treeError: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  function walk(node: unknown, path: string): void {
    if (!node || typeof node !== "object") return;

    const n = node as {
      errors?: unknown[];
      properties?: Record<string, unknown>;
      items?: unknown[];
    };

    if (Array.isArray(n.errors) && n.errors.length > 0) {
      const messages = n.errors.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
      if (messages.length > 0) {
        const key = path || "_form";
        result[key] = (result[key] ?? []).concat(messages);
      }
    }

    if (n.properties && typeof n.properties === "object") {
      for (const [key, child] of Object.entries(n.properties)) {
        const nextPath = path ? `${path}.${key}` : key;
        walk(child, nextPath);
      }
    }

    if (Array.isArray(n.items)) {
      n.items.forEach((child, index) => {
        const nextPath = path ? `${path}[${index}]` : `[${index}]`;
        walk(child, nextPath);
      });
    }
  }

  walk(treeError, "");
  return result;
}

/**
 * Factory creating the submit controller with an injected database service and logger.
 */
export function createSubmitAnalyzeJobHandler(
  databaseService: IResumeDatabaseService = getResumeDatabaseService(),
  logger: Logger = defaultLogger,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reqLogger = (req as RequestWithLogger).logger ?? logger;
    const parseResult = analyzeRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      const tree = z.treeifyError(parseResult.error);
      const details = parseTreeErrors(tree);
      reqLogger.warn({ details }, "Validation error on /api/v1/analyze");
      res.status(400).json({
        error: "Validation error",
        details,
      });
      return;
    }

    try {
      const enqueueStart = Date.now();
      const savedJob = await databaseService.createAndSave({
        telegramId: parseResult.data.telegramId,
        videoUrl: parseResult.data.url,
      });

      reqLogger.info(
        {
          jobId: savedJob.id,
          telegramId: parseResult.data.telegramId,
          videoUrl: parseResult.data.url,
          status: savedJob.status,
          durationMs: Date.now() - enqueueStart,
        },
        `Job #${savedJob.id} queued for analysis`,
      );

      res.status(202).json({
        jobId: String(savedJob.id),
        status: savedJob.status,
        message: "Video queued for analysis",
      });
    } catch (error) {
      reqLogger.error({ err: error, telegramId: parseResult.data.telegramId }, "Failed to enqueue video analysis job");
      next(error);
    }
  };
}

/**
 * Default handler using singleton database service.
 */
export const submitAnalyzeJob: RequestHandler = createSubmitAnalyzeJobHandler();
