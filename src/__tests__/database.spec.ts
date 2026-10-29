import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import AppDataSource, { initializeDatabase } from "#database/appDataSource.js";
import { ResumeEntity } from "#database/entities/ResumeEntity.js";
import { ResumeStatus } from "../types/resume.js";

describe("Database Configuration & ResumeEntity Lifecycle (SQLite)", () => {
  beforeAll(async () => {
    await initializeDatabase();
    await AppDataSource.synchronize();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);
    await repository.clear();
  });

  it("should initialize the SQLite data source successfully", () => {
    expect(AppDataSource.isInitialized).toBe(true);
    expect(AppDataSource.options.type).toBe("sqlite");
  });

  it("should confirm WAL mode pragma is active on SQLite", async () => {
    const result = (await AppDataSource.query("PRAGMA journal_mode;")) as Array<{
      journal_mode: string;
    }>;

    expect(result).toBeDefined();
    expect(result[0]?.journal_mode.toLowerCase()).toBe("wal");
  });

  it("should insert a new ResumeEntity in in_progress state with required fields", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    const newJob = repository.create({
      telegramId: "tg-user-12345",
      videoUrl: "https://example.com/sample-video.mp4",
      status: ResumeStatus.InProgress,
    });

    const savedJob = await repository.save(newJob);

    expect(savedJob.id).toBeDefined();
    expect(savedJob.telegramId).toBe("tg-user-12345");
    expect(savedJob.videoUrl).toBe("https://example.com/sample-video.mp4");
    expect(savedJob.status).toBe(ResumeStatus.InProgress);
    expect(savedJob.hasAudio).toBe(false);
    expect(savedJob.transcription).toBeNull();
    expect(savedJob.content).toBeNull();
    expect(savedJob.errorMessage).toBeNull();
    expect(savedJob.deliveryAttempts).toBe(0);
    expect(savedJob.nextDeliveryRetryAt).toBeNull();
    expect(savedJob.deliveredAt).toBeNull();
    expect(savedJob.create_at).toBeInstanceOf(Date);
    expect(savedJob.updated_at).toBeInstanceOf(Date);
  });

  it("should transition entity status from in_progress to processed, then sent", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    const job = await repository.save(
      repository.create({
        telegramId: "tg-transition-test",
        videoUrl: "https://example.com/transition.mp4",
        status: ResumeStatus.InProgress,
      }),
    );

    expect(job.status).toBe(ResumeStatus.InProgress);

    // Transition to processed
    job.status = ResumeStatus.Processed;
    job.hasAudio = true;
    job.transcription = "Full transcribed text here";
    job.content = "Multi-modal summarized bullets";
    const processedJob = await repository.save(job);

    expect(processedJob.status).toBe(ResumeStatus.Processed);
    expect(processedJob.hasAudio).toBe(true);
    expect(processedJob.transcription).toBe("Full transcribed text here");
    expect(processedJob.content).toBe("Multi-modal summarized bullets");

    // Transition to sent
    processedJob.status = ResumeStatus.Sent;
    processedJob.deliveredAt = new Date();
    const sentJob = await repository.save(processedJob);

    expect(sentJob.status).toBe(ResumeStatus.Sent);
    expect(sentJob.deliveredAt).toBeInstanceOf(Date);
  });

  it("should transition entity status to failed and record errorMessage", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    const job = await repository.save(
      repository.create({
        telegramId: "tg-fail-test",
        videoUrl: "https://example.com/failed.mp4",
        status: ResumeStatus.InProgress,
      }),
    );

    job.status = ResumeStatus.Failed;
    job.errorMessage = "yt-dlp: video unavailable or private";
    const failedJob = await repository.save(job);

    expect(failedJob.status).toBe(ResumeStatus.Failed);
    expect(failedJob.errorMessage).toBe("yt-dlp: video unavailable or private");
  });

  it("should query pending jobs ordered by create_at ASC", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    // Insert 3 jobs with sequential timestamps
    const job1 = repository.create({
      telegramId: "user-1",
      videoUrl: "https://example.com/video1.mp4",
      status: ResumeStatus.InProgress,
      create_at: new Date(Date.now() - 3000),
    });
    const job2 = repository.create({
      telegramId: "user-2",
      videoUrl: "https://example.com/video2.mp4",
      status: ResumeStatus.InProgress,
      create_at: new Date(Date.now() - 2000),
    });
    const job3 = repository.create({
      telegramId: "user-3",
      videoUrl: "https://example.com/video3.mp4",
      status: ResumeStatus.InProgress,
      create_at: new Date(Date.now() - 1000),
    });

    await repository.save([job2, job3, job1]); // intentionally saved out of order

    const pendingJobs = await repository.find({
      where: { status: ResumeStatus.InProgress },
      order: { create_at: "ASC" },
    });

    expect(pendingJobs.length).toBe(3);
    expect(pendingJobs[0]?.telegramId).toBe("user-1");
    expect(pendingJobs[1]?.telegramId).toBe("user-2");
    expect(pendingJobs[2]?.telegramId).toBe("user-3");
  });
});
