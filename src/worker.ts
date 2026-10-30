import "reflect-metadata";

import { getConfig } from "./config.js";
import AppDataSource, { initializeDatabase } from "./database/appDataSource.js";
import { logger } from "./logger.js";
import { getAiClients } from "./services/aiClients.js";
import { getResumeDatabaseService } from "./services/database/resumeDatabaseService.js";
import { WorkerDispatcher } from "./services/workerDispatcher.js";

async function main() {
  const config = getConfig();
  const workerLogger = logger.child({ context: "Worker" });

  workerLogger.info(
    {
      maxConcurrency: config.MAX_CONCURRENT_JOBS,
      tempDir: config.TEMP_DIR,
      whisperModel: config.WHISPER_MODEL,
      visionModel: config.OPENROUTER_MODEL,
      logLevel: config.LOG_LEVEL,
    },
    `Starting Video Analyzer Background Worker (Max Concurrency: ${config.MAX_CONCURRENT_JOBS})`,
  );

  try {
    await initializeDatabase();
    workerLogger.info(
      {
        database: config.DB_DATABASE,
        mode: "SQLite WAL",
      },
      "Worker database connected successfully",
    );

    // Persistent clients and database service instance
    const databaseService = getResumeDatabaseService(AppDataSource);
    const aiClients = getAiClients();

    const dispatcher = new WorkerDispatcher({
      databaseService,
      aiClients,
      maxConcurrency: config.MAX_CONCURRENT_JOBS,
      tempDir: config.TEMP_DIR,
      logger: workerLogger,
    });

    const shutdown = async (signal: string) => {
      workerLogger.info(`Received ${signal}. Gracefully stopping worker...`);
      await dispatcher.stop();
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      workerLogger.info("Worker stopped cleanly.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    dispatcher.start();
    workerLogger.info("Background dispatcher running and listening for jobs...");
  } catch (error) {
    workerLogger.error({ err: error }, "Fatal error starting worker");
    process.exit(1);
  }
}

void main();
