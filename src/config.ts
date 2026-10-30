import { z } from "zod";
import type { Config } from "./types/config.js";

const booleanEnvSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const normalized = val.trim().toLowerCase();
      return normalized === "true" || normalized === "1";
    }
    return false;
  });

const optionalUrlSchema = z
  .string()
  .optional()
  .transform((val) => {
    const trimmed = val?.trim();
    return trimmed === "" ? undefined : trimmed;
  })
  .pipe(z.url().optional());

const optionalStringSchema = z
  .string()
  .optional()
  .transform((val) => {
    const trimmed = val?.trim();
    return trimmed === "" ? undefined : trimmed;
  });

export const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DB_DATABASE: z.string().min(1).default("database.sqlite"),
  DB_LOGGING: booleanEnvSchema.default(false),
  DB_SYNCHRONIZE: booleanEnvSchema.default(false),
  API_BEARER_TOKEN: z.string().min(1, "API_BEARER_TOKEN is required"),
  WHISPER_URL: z.url().default("https://openrouter.ai/api/v1"),
  WHISPER_MODEL: z.string().min(1).default("openai/whisper-large-v3"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().min(1).default("google/gemini-2.5-flash"),
  WEBHOOK_URL: optionalUrlSchema,
  WEBHOOK_AUTH_HEADER: z.string().min(1).default("X-N8N-Webhook-Token"),
  WEBHOOK_AUTH_TOKEN: optionalStringSchema,
  TEMP_DIR: z.string().min(1).default("/tmp/video-analyzer"),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(3),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  LOG_FORMAT: z.enum(["text", "json"]).default("text"),
});

export type { Config } from "./types/config.js";

export function createConfig(env: Record<string, string | undefined> = process.env): Config {
  return configSchema.parse(env);
}

let activeConfig: Config | null = null;

export function getConfig(): Config {
  if (!activeConfig) {
    activeConfig = createConfig(process.env);
  }
  return activeConfig;
}
