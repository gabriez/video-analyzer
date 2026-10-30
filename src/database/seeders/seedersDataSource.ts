import "reflect-metadata";
import { DataSource } from "typeorm";

import { dataSourceOptionsCommon } from "../databaseConfig.js";

const SeedersDataSource = new DataSource({
  ...dataSourceOptionsCommon,
  migrations: [],
});

export default SeedersDataSource;
