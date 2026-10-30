import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { getResumeDatabaseService } from "../services/database/resumeDatabaseService.js";
import type { IResumeDatabaseService } from "../types/database.js";

export const analyzeRequestSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  url: z.string().url("A valid video URL is required"),
});

export type { AnalyzeRequest } from "../types/api.js";

/**
 * Factory creating the submit controller with an injected database service.
 */
export function createSubmitAnalyzeJobHandler(databaseService: IResumeDatabaseService = getResumeDatabaseService()): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parseResult = analyzeRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Validation error",
        details: parseResult.error.format(),
      });
      return;
    }

    try {
      const savedJob = await databaseService.createAndSave({
        telegramId: parseResult.data.telegramId,
        videoUrl: parseResult.data.url,
      });

      res.status(202).json({
        jobId: String(savedJob.id),
        status: savedJob.status,
        message: "Video queued for analysis",
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Default handler using singleton database service.
 */
export const submitAnalyzeJob: RequestHandler = createSubmitAnalyzeJobHandler();
