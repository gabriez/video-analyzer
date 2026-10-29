import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { createConfig } from "../config.js";

describe("Configuration Module (Zod)", () => {
  const minimalValidEnv: Record<string, string> = {
    API_BEARER_TOKEN: "super-secret-token",
    OPENROUTER_API_KEY: "sk-or-v1-dummy-key",
  };

  it("should parse minimal valid configuration with sensible defaults", () => {
    const config = createConfig(minimalValidEnv);

    expect(config.PORT).toBe(3000);
    expect(config.DB_DATABASE).toBe("database.sqlite");
    expect(config.DB_LOGGING).toBe(false);
    expect(config.DB_SYNCHRONIZE).toBe(false);
    expect(config.API_BEARER_TOKEN).toBe("super-secret-token");
    expect(config.WHISPER_URL).toBe("http://speaches:8000/v1");
    expect(config.OPENROUTER_API_KEY).toBe("sk-or-v1-dummy-key");
    expect(config.OPENROUTER_MODEL).toBe("google/gemini-2.5-flash");
    expect(config.WEBHOOK_URL).toBeUndefined();
    expect(config.WEBHOOK_AUTH_HEADER).toBe("X-N8N-Webhook-Token");
    expect(config.WEBHOOK_AUTH_TOKEN).toBeUndefined();
    expect(config.TEMP_DIR).toBe("/tmp/video-analyzer");
  });

  it("should parse custom environment variables with proper coercion", () => {
    const customEnv: Record<string, string> = {
      ...minimalValidEnv,
      PORT: "8080",
      DB_DATABASE: "custom.sqlite",
      DB_LOGGING: "true",
      DB_SYNCHRONIZE: "1",
      WHISPER_URL: "https://custom-whisper.lan/v1",
      OPENROUTER_MODEL: "anthropic/claude-3.5-sonnet",
      WEBHOOK_URL: "https://n8n.internal.net/webhook/video",
      WEBHOOK_AUTH_HEADER: "X-Custom-Auth",
      WEBHOOK_AUTH_TOKEN: "n8n-secret-999",
      TEMP_DIR: "/var/tmp/analyzer",
    };

    const config = createConfig(customEnv);

    expect(config.PORT).toBe(8080);
    expect(config.DB_DATABASE).toBe("custom.sqlite");
    expect(config.DB_LOGGING).toBe(true);
    expect(config.DB_SYNCHRONIZE).toBe(true);
    expect(config.WHISPER_URL).toBe("https://custom-whisper.lan/v1");
    expect(config.OPENROUTER_MODEL).toBe("anthropic/claude-3.5-sonnet");
    expect(config.WEBHOOK_URL).toBe("https://n8n.internal.net/webhook/video");
    expect(config.WEBHOOK_AUTH_HEADER).toBe("X-Custom-Auth");
    expect(config.WEBHOOK_AUTH_TOKEN).toBe("n8n-secret-999");
    expect(config.TEMP_DIR).toBe("/var/tmp/analyzer");
  });

  it("should correctly handle boolean edge cases (case-insensitive, falsy strings)", () => {
    const falsyEnv = {
      ...minimalValidEnv,
      DB_LOGGING: "FALSE",
      DB_SYNCHRONIZE: "0",
    };
    const parsedFalsy = createConfig(falsyEnv);
    expect(parsedFalsy.DB_LOGGING).toBe(false);
    expect(parsedFalsy.DB_SYNCHRONIZE).toBe(false);

    const truthyEnv = {
      ...minimalValidEnv,
      DB_LOGGING: "TRUE",
      DB_SYNCHRONIZE: "true",
    };
    const parsedTruthy = createConfig(truthyEnv);
    expect(parsedTruthy.DB_LOGGING).toBe(true);
    expect(parsedTruthy.DB_SYNCHRONIZE).toBe(true);
  });

  it("should treat empty string for optional fields as undefined", () => {
    const envWithEmptyOptionals = {
      ...minimalValidEnv,
      WEBHOOK_URL: "",
      WEBHOOK_AUTH_TOKEN: "",
    };

    const config = createConfig(envWithEmptyOptionals);
    expect(config.WEBHOOK_URL).toBeUndefined();
    expect(config.WEBHOOK_AUTH_TOKEN).toBeUndefined();
  });

  it("should fail when API_BEARER_TOKEN is missing", () => {
    const env = { OPENROUTER_API_KEY: "key" };
    expect(() => createConfig(env)).toThrowError(ZodError);
  });

  it("should fail when OPENROUTER_API_KEY is missing", () => {
    const env = { API_BEARER_TOKEN: "token" };
    expect(() => createConfig(env)).toThrowError(ZodError);
  });

  it("should fail when PORT is invalid", () => {
    expect(() => createConfig({ ...minimalValidEnv, PORT: "-1" })).toThrowError(ZodError);
    expect(() => createConfig({ ...minimalValidEnv, PORT: "abc" })).toThrowError(ZodError);
    expect(() => createConfig({ ...minimalValidEnv, PORT: "0" })).toThrowError(ZodError);
  });

  it("should fail when URLs are invalid", () => {
    expect(() => createConfig({ ...minimalValidEnv, WHISPER_URL: "not-a-valid-url" })).toThrowError(ZodError);

    expect(() => createConfig({ ...minimalValidEnv, WEBHOOK_URL: "invalid-url-string" })).toThrowError(ZodError);
  });
});
