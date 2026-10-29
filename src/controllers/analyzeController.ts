import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import AppDataSource from "../database/appDataSource.js";
import { ResumeEntity } from "../database/entities/ResumeEntity.js";
import { ResumeStatus } from "../types/resume.js";

export const analyzeRequestSchema = z.object({
  telegramId: z.string().min(1, "telegramId is required"),
  url: z.string().url("A valid video URL is required"),
});

export type { AnalyzeRequest } from "../types/api.js";

/**
 * Controller handling video analysis job submissions.
 * Validates request payload, persists a new ResumeEntity in `in_progress` state,
 * and responds with HTTP 202 Accepted.
 */
export async function submitAnalyzeJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parseResult = analyzeRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: "Validation error",
      details: parseResult.error.format(),
    });
    return;
  }

  try {
    const repository = AppDataSource.getRepository(ResumeEntity);
    const newJob = repository.create({
      telegramId: parseResult.data.telegramId,
      videoUrl: parseResult.data.url,
      status: ResumeStatus.InProgress,
    });

    const savedJob = await repository.save(newJob);

    res.status(202).json({
      jobId: String(savedJob.id),
      status: savedJob.status,
      message: "Video queued for analysis",
    });
  } catch (error) {
    next(error);
  }
}
