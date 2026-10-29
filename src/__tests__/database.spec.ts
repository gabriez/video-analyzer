import { afterAll, beforeAll, describe, expect, it } from "vitest";

import AppDataSource from "#database/appDataSource.js";

describe("Database Configuration (SQLite)", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it("should initialize the SQLite data source successfully", () => {
    expect(AppDataSource.isInitialized).toBe(true);
    expect(AppDataSource.options.type).toBe("sqlite");
  });
});
