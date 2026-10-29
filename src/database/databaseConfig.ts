import type { DataSourceOptions } from "typeorm";

export const DB_DATABASE = process.env.DB_DATABASE ?? "database.sqlite";

const databaseConfig: DataSourceOptions = {
  database: DB_DATABASE,
  logging: process.env.DB_LOGGING === "true",
  synchronize: process.env.DB_SYNCHRONIZE === "true",
  type: "sqlite",
};

export const dataSourceOptionsCommon: DataSourceOptions = {
  ...databaseConfig,
  entities: [],
};
