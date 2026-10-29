import { Router } from "express";

import { submitAnalyzeJob } from "../controllers/analyzeController.js";
import { createAuthMiddleware } from "../middleware/auth.js";

export function createAnalyzeRouter(bearerToken: string): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(bearerToken);

  router.post("/analyze", authMiddleware, submitAnalyzeJob);

  return router;
}

export default createAnalyzeRouter;
