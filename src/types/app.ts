import type { IResumeDatabaseService } from "./database.js";
import type { Logger } from "./logger.js";

export interface AppOptions {
  bearerToken?: string;
  databaseService?: IResumeDatabaseService;
  logger?: Logger;
}
