import "reflect-metadata";

import { getConfig } from "./config.js";
import AppDataSource, { initializeDatabase } from "./database/appDataSource.js";
import { getAiClients } from "./services/aiClients.js";
import { getResumeDatabaseService } from "./services/database/resumeDatabaseService.js";
import { WorkerDispatcher } from "./services/workerDispatcher.js";

async function main() {
  const config = getConfig();
  console.log(`Starting Video Analyzer Background Worker (Max Concurrency: ${config.MAX_CONCURRENT_JOBS})`);

  try {
    await initializeDatabase();
    console.log("Worker database connected successfully (SQLite WAL mode)");

    // Persistent clients and database service instance
    const databaseService = getResumeDatabaseService(AppDataSource);
    const aiClients = getAiClients();

    const dispatcher = new WorkerDispatcher({
      databaseService,
      aiClients,
      maxConcurrency: config.MAX_CONCURRENT_JOBS,
      tempDir: config.TEMP_DIR,
    });

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Gracefully stopping worker...`);
      await dispatcher.stop();
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      console.log("Worker stopped cleanly.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    dispatcher.start();
    console.log("Background dispatcher running and listening for jobs...");
  } catch (error) {
    console.error("Fatal error starting worker:", error);
    process.exit(1);
  }
}

void main();
