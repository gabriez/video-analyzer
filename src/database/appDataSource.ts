import "reflect-metadata";
import { DataSource } from "typeorm";

import { dataSourceOptionsCommon } from "./databaseConfig.js";

const AppDataSource = new DataSource({
  ...dataSourceOptionsCommon,
  migrations: [],
});

export default AppDataSource;
