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

    const existingTables = (await AppDataSource.query("SELECT name FROM sqlite_master WHERE type='table' AND name='resumes';")) as Array<{
      name: string;
    }>;

    if (!existingTables || existingTables.length === 0) {
      await AppDataSource.synchronize();
    }
  }
  return AppDataSource;
}

export default AppDataSource;
