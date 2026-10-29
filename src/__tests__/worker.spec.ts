import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import AppDataSource, { initializeDatabase } from "../database/appDataSource.js";
import { ResumeEntity } from "../database/entities/ResumeEntity.js";
import * as downloader from "../services/downloader.js";
import { claimNextPendingJob, type JobProcessorServices, processJob, WorkerDispatcher } from "../services/workerDispatcher.js";
import { ResumeStatus } from "../types/resume.js";

describe("Background Worker & Pool Dispatcher Concurrency", () => {
  let tempBaseDir: string;

  beforeAll(async () => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-"));
    await initializeDatabase();
    await AppDataSource.synchronize();
  });

  afterAll(async () => {
    if (tempBaseDir && fs.existsSync(tempBaseDir)) {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);
    await repository.clear();
    vi.restoreAllMocks();
  });

  it("should claim next pending job atomically and prevent duplicate claims", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);
    const job = await repository.save(
      repository.create({
        telegramId: "user-atomic",
        videoUrl: "https://example.com/atomic.mp4",
        status: ResumeStatus.InProgress,
      }),
    );

    // Two parallel claim attempts
    const [claim1, claim2] = await Promise.all([claimNextPendingJob(AppDataSource), claimNextPendingJob(AppDataSource)]);

    // Exactly one worker must claim the job, the second gets null
    const claimedJob = claim1 ?? claim2;
    const missedJob = claim1 ? claim2 : claim1;

    expect(claimedJob).toBeDefined();
    expect(claimedJob?.id).toBe(job.id);
    expect(claimedJob?.lockedAt).toBeDefined();
    expect(missedJob).toBeNull();
  });

  it("should run jobs concurrently without blocking Job 2 behind Job 1", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    const [job1, job2] = await repository.save([
      repository.create({
        telegramId: "user-1",
        videoUrl: "https://example.com/job1.mp4",
        status: ResumeStatus.InProgress,
      }),
      repository.create({
        telegramId: "user-2",
        videoUrl: "https://example.com/job2.mp4",
        status: ResumeStatus.InProgress,
      }),
    ]);

    let resolveJob1Download!: () => void;
    const job1DownloadPromise = new Promise<void>((resolve) => {
      resolveJob1Download = resolve;
    });

    const activeJobIds: string[] = [];

    const mockServices: JobProcessorServices = {
      downloadVideo: vi.fn().mockImplementation(async (_url, _dir, jobId) => {
        activeJobIds.push(jobId);
        if (jobId === String(job1.id)) {
          await job1DownloadPromise;
        }
        return path.join(tempBaseDir, jobId, "input.mp4");
      }),
      hasAudioStream: vi.fn().mockResolvedValue(true),
      extractAudio: vi.fn().mockResolvedValue("/path/audio.mp3"),
      transcribeAudio: vi.fn().mockResolvedValue("Transcribed text"),
      extractFrames: vi.fn().mockResolvedValue(["/path/frame_0001.jpg"]),
      analyzeVideoContext: vi.fn().mockResolvedValue("Video summary markdown"),
      sendWebhookNotification: vi.fn().mockResolvedValue({ success: true, attempts: 1 }),
    };

    const dispatcher = new WorkerDispatcher({
      dataSource: AppDataSource,
      maxConcurrency: 2,
      tempDir: tempBaseDir,
      services: mockServices,
      pollIntervalMs: 50,
    });

    dispatcher.start();

    // Wait until both jobs are simultaneously active
    await vi.waitFor(
      () => {
        expect(activeJobIds).toContain(String(job1.id));
        expect(activeJobIds).toContain(String(job2.id));
      },
      { timeout: 3000, interval: 50 },
    );

    // Release Job 1
    resolveJob1Download();

    await vi.waitFor(
      async () => {
        const updated1 = await repository.findOneBy({ id: job1.id });
        const updated2 = await repository.findOneBy({ id: job2.id });
        expect(updated1?.status).toBe(ResumeStatus.Sent);
        expect(updated2?.status).toBe(ResumeStatus.Sent);
      },
      { timeout: 3000, interval: 50 },
    );

    await dispatcher.stop();
  });

  it("should enforce bounded capacity and never exceed MAX_CONCURRENT_JOBS", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    // Create 4 pending jobs
    await repository.save([
      repository.create({ telegramId: "u1", videoUrl: "https://example.com/1.mp4", status: ResumeStatus.InProgress }),
      repository.create({ telegramId: "u2", videoUrl: "https://example.com/2.mp4", status: ResumeStatus.InProgress }),
      repository.create({ telegramId: "u3", videoUrl: "https://example.com/3.mp4", status: ResumeStatus.InProgress }),
      repository.create({ telegramId: "u4", videoUrl: "https://example.com/4.mp4", status: ResumeStatus.InProgress }),
    ]);

    let currentlyRunning = 0;
    let maxObservedRunning = 0;

    const mockServices: JobProcessorServices = {
      downloadVideo: vi.fn().mockImplementation(async () => {
        currentlyRunning++;
        if (currentlyRunning > maxObservedRunning) {
          maxObservedRunning = currentlyRunning;
        }
        await new Promise((r) => setTimeout(r, 100));
        currentlyRunning--;
        return "/tmp/input.mp4";
      }),
      hasAudioStream: vi.fn().mockResolvedValue(false),
      extractAudio: vi.fn().mockResolvedValue("/tmp/audio.mp3"),
      transcribeAudio: vi.fn().mockResolvedValue(""),
      extractFrames: vi.fn().mockResolvedValue(["/tmp/frame.jpg"]),
      analyzeVideoContext: vi.fn().mockResolvedValue("summary"),
      sendWebhookNotification: vi.fn().mockResolvedValue({ success: true, attempts: 1 }),
    };

    const dispatcher = new WorkerDispatcher({
      dataSource: AppDataSource,
      maxConcurrency: 2, // Hard limit of 2 concurrent jobs
      tempDir: tempBaseDir,
      services: mockServices,
      pollIntervalMs: 20,
    });

    dispatcher.start();

    await vi.waitFor(
      async () => {
        const remaining = await repository.countBy({ status: ResumeStatus.InProgress });
        expect(remaining).toBe(0);
      },
      { timeout: 4000, interval: 50 },
    );

    await dispatcher.stop();

    expect(maxObservedRunning).toBeLessThanOrEqual(2);
    expect(maxObservedRunning).toBeGreaterThanOrEqual(1);
  });

  it("should isolate faults: Job 1 failure does not crash or abort Job 2", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);

    const [jobFail, jobSuccess] = await repository.save([
      repository.create({
        telegramId: "fail-user",
        videoUrl: "https://example.com/corrupt.mp4",
        status: ResumeStatus.InProgress,
      }),
      repository.create({
        telegramId: "success-user",
        videoUrl: "https://example.com/valid.mp4",
        status: ResumeStatus.InProgress,
      }),
    ]);

    const mockServices: JobProcessorServices = {
      downloadVideo: vi.fn().mockImplementation(async (_url, _dir, jobId) => {
        if (jobId === String(jobFail.id)) {
          throw new downloader.DownloadError("Simulated video download corrupt error");
        }
        return "/tmp/valid.mp4";
      }),
      hasAudioStream: vi.fn().mockResolvedValue(true),
      extractAudio: vi.fn().mockResolvedValue("/tmp/audio.mp3"),
      transcribeAudio: vi.fn().mockResolvedValue("Text"),
      extractFrames: vi.fn().mockResolvedValue(["/tmp/frame.jpg"]),
      analyzeVideoContext: vi.fn().mockResolvedValue("Success summary"),
      sendWebhookNotification: vi.fn().mockResolvedValue({ success: true, attempts: 1 }),
    };

    const dispatcher = new WorkerDispatcher({
      dataSource: AppDataSource,
      maxConcurrency: 2,
      tempDir: tempBaseDir,
      services: mockServices,
      pollIntervalMs: 20,
    });

    dispatcher.start();

    await vi.waitFor(
      async () => {
        const failedResult = await repository.findOneBy({ id: jobFail.id });
        const successResult = await repository.findOneBy({ id: jobSuccess.id });

        expect(failedResult?.status).toBe(ResumeStatus.Failed);
        expect(failedResult?.errorMessage).toContain("Simulated video download corrupt error");

        expect(successResult?.status).toBe(ResumeStatus.Sent);
        expect(successResult?.content).toBe("Success summary");
      },
      { timeout: 3000, interval: 50 },
    );

    await dispatcher.stop();
  });

  it("should guarantee temp directory garbage collection per finished task", async () => {
    const repository = AppDataSource.getRepository(ResumeEntity);
    const job = await repository.save(
      repository.create({
        telegramId: "gc-user",
        videoUrl: "https://example.com/gc.mp4",
        status: ResumeStatus.InProgress,
      }),
    );

    const expectedJobDir = path.join(tempBaseDir, String(job.id));

    const mockServices: JobProcessorServices = {
      downloadVideo: vi.fn().mockImplementation(async () => {
        fs.mkdirSync(expectedJobDir, { recursive: true });
        fs.writeFileSync(path.join(expectedJobDir, "input.mp4"), "fake-bytes");
        return path.join(expectedJobDir, "input.mp4");
      }),
      hasAudioStream: vi.fn().mockResolvedValue(false),
      extractAudio: vi.fn().mockResolvedValue("/tmp/audio.mp3"),
      transcribeAudio: vi.fn().mockResolvedValue(""),
      extractFrames: vi.fn().mockResolvedValue([]),
      analyzeVideoContext: vi.fn().mockResolvedValue("Summary"),
      sendWebhookNotification: vi.fn().mockResolvedValue({ success: true, attempts: 1 }),
    };

    await processJob(job, {
      dataSource: AppDataSource,
      tempDir: tempBaseDir,
      services: mockServices,
    });

    expect(fs.existsSync(expectedJobDir)).toBe(false);

    const updated = await repository.findOneBy({ id: job.id });
    expect(updated?.status).toBe(ResumeStatus.Sent);
  });
});
