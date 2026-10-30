import "reflect-metadata";

import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import AppDataSource, { initializeDatabase } from "./database/appDataSource.js";
import { logger } from "./logger.js";

const main = async () => {
  const config = getConfig();
  const apiLogger = logger.child({ context: "API" });
  const app = createApp({ bearerToken: config.API_BEARER_TOKEN, logger: apiLogger });
  const port = config.PORT;
  const host = config.HOST;

  try {
    await initializeDatabase();
    apiLogger.info(
      {
        database: config.DB_DATABASE,
        mode: "SQLite WAL",
      },
      "Database connected successfully",
    );

    const server = app.listen(port, host, () => {
      apiLogger.info(
        {
          host,
          port,
          env: process.env.NODE_ENV || "development",
          logLevel: config.LOG_LEVEL,
        },
        `Video Analyzer API listening at http://${host}:${port}`,
      );
    });

    const shutdown = (signal: string) => {
      apiLogger.info(`Received ${signal}. Gracefully stopping API server...`);
      server.close(async () => {
        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
        }
        apiLogger.info("API server stopped cleanly.");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    apiLogger.error({ err: error }, "Fatal error starting API server");
    process.exit(1);
  }
};

void main();
