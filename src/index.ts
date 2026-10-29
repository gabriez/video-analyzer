import "reflect-metadata";
import express from "express";

import AppDataSource from "#database/appDataSource.js";

const app = express();
const port = process.env.PORT ?? "3000";

app.get("/", (_req, res) => {
  res.send("Hello World!");
});

try {
  await AppDataSource.initialize();
  console.log("Database connected successfully (SQLite)");

  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
  });
} catch (error) {
  console.error("Error connecting to database:", error);
  process.exit(1);
}
