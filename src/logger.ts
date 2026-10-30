import pino, { type DestinationStream, type Logger as PinoLogger, type LoggerOptions as PinoOptions } from "pino";
import pretty from "pino-pretty";

export type { Logger } from "./types/logger.js";

const DEFAULT_REDACT_PATHS = [
  "token",
  "apiKey",
  "password",
  "authorization",
  "*.token",
  "*.apiKey",
  "*.password",
  "*.authorization",
  "bearerToken",
  "openRouterApiKey",
  "*.bearerToken",
  "*.openRouterApiKey",
];

export function createLogger(options: PinoOptions = {}, destination?: DestinationStream): PinoLogger {
  const level = options.level || process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" || process.env.VITEST ? "silent" : "info");

  const isJsonFormat = process.env.LOG_FORMAT === "json";

  const pinoConfig: PinoOptions = {
    level,
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      censor: "[REDACTED]",
    },
    ...options,
  };

  if (destination) {
    return pino(pinoConfig, destination);
  }

  if (isJsonFormat || (process.env.NODE_ENV === "production" && process.env.LOG_FORMAT !== "text")) {
    return pino(pinoConfig);
  }

  const prettyStream = pretty({
    colorize: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  });

  return pino(pinoConfig, prettyStream);
}

export const logger = createLogger();
export default logger;
