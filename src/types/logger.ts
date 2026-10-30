import type { Logger as PinoLogger } from "pino";

export type Logger = PinoLogger;
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type LogFormat = "text" | "json";
