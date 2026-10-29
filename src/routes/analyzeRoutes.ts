import { Router } from "express";

import { createSubmitAnalyzeJobHandler } from "../controllers/analyzeController.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { getResumeDatabaseService } from "../services/database/resumeDatabaseService.js";
import type { IResumeDatabaseService } from "../types/database.js";

export function createAnalyzeRouter(bearerToken: string, databaseService: IResumeDatabaseService = getResumeDatabaseService()): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(bearerToken);
  const handler = createSubmitAnalyzeJobHandler(databaseService);

  router.post("/analyze", authMiddleware, handler);

  return router;
}

export default createAnalyzeRouter;
