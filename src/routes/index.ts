import { Router } from "express";

import { createAnalyzeRouter } from "./analyzeRoutes.js";

export function createApiRouter(bearerToken: string): Router {
  const router = Router();

  router.use("/v1", createAnalyzeRouter(bearerToken));

  return router;
}

export * from "./analyzeRoutes.js";
