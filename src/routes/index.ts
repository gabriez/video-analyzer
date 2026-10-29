import { Router } from "express";
import { getResumeDatabaseService } from "../services/database/resumeDatabaseService.js";
import type { IResumeDatabaseService } from "../types/database.js";
import { createAnalyzeRouter } from "./analyzeRoutes.js";

export function createApiRouter(bearerToken: string, databaseService: IResumeDatabaseService = getResumeDatabaseService()): Router {
  const router = Router();

  router.use("/v1", createAnalyzeRouter(bearerToken, databaseService));

  return router;
}

export * from "./analyzeRoutes.js";
