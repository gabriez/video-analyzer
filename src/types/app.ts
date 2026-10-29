import type { IResumeDatabaseService } from "./database.js";

export interface AppOptions {
  bearerToken?: string;
  databaseService?: IResumeDatabaseService;
}
