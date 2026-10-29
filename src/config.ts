export class Config {
  port: string;
  whisper_url: string;
  dbDatabase: string;
  constructor() {
    this.port = process.env.PORT ?? "3000";
    this.whisper_url = process.env.WHISPER_URL ?? "speaches:8000/v1/";
    this.dbDatabase = process.env.DB_DATABASE ?? "database.sqlite";
  }

  requireEnv(name: string): string {
    const envVar = process.env[name];
    if (envVar === undefined || envVar === "") {
      throw new Error(`Missing enviroment var ${envVar}`);
    }
    return envVar;
  }
}
