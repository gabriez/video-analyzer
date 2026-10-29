import "reflect-metadata";

import { DataSource } from "typeorm";

import { dataSourceOptionsCommon } from "./databaseConfig.js";

const AppDataSource = new DataSource({
  ...dataSourceOptionsCommon,
  migrations: [],
});

/**
 * Inicializa la base de datos y configura los pragmas de SQLite para WAL mode.
 */
export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    await AppDataSource.query("PRAGMA journal_mode = WAL;");
    await AppDataSource.query("PRAGMA busy_timeout = 5000;");
    await AppDataSource.query("PRAGMA synchronous = NORMAL;");
  }
  return AppDataSource;
}

export default AppDataSource;
