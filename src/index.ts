import "reflect-metadata";

import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { initializeDatabase } from "./database/appDataSource.js";

const main = async () => {
  const config = getConfig();
  const app = createApp({ bearerToken: config.API_BEARER_TOKEN });
  const port = config.PORT;
  const host = config.HOST;

  try {
    await initializeDatabase();
    console.log("Database connected successfully (SQLite WAL mode)");

    app.listen(port, host, () => {
      console.log(`Video Analyzer API listening at http://${host}:${port}`);
    });
  } catch (error) {
    console.error("Error connecting to database:", error);
    process.exit(1);
  }
};

main();
