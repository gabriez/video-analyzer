import fs from "node:fs";
import path from "node:path";
import type { DataSource } from "typeorm";

import { getConfig } from "../config.js";
import AppDataSource from "../database/appDataSource.js";
import { ResumeEntity } from "../database/entities/ResumeEntity.js";
import { ResumeStatus } from "../types/resume.js";
import type { JobProcessorServices, ProcessJobOptions, WorkerDispatcherOptions } from "../types/worker.js";
import { downloadVideo } from "./downloader.js";
import { extractAudio, extractFrames } from "./mediaExtractor.js";
import { hasAudioStream } from "./mediaProbe.js";
import { transcribeAudio } from "./sttService.js";
import { analyzeVideoContext } from "./visionService.js";
import { sendWebhookNotification } from "./webhookService.js";

export type {
  JobProcessorServices,
  ProcessJobOptions,
  WorkerDispatcherOptions,
} from "../types/worker.js";

export const defaultJobProcessorServices: JobProcessorServices = {
  downloadVideo,
  hasAudioStream,
  extractAudio,
  transcribeAudio,
  extractFrames,
  analyzeVideoContext,
  sendWebhookNotification,
};

/**
 * Claims the next pending job atomically using SQLite WAL transaction semantics.
 * Sets locked_at timestamp so no concurrent runner can claim the same job twice.
 */
export async function claimNextPendingJob(dataSource: DataSource = AppDataSource): Promise<ResumeEntity | null> {
  const driver = (
    dataSource as unknown as {
      driver?: {
        databaseConnection?: {
          all: (sql: string, params: unknown[], callback: (err: unknown, rows: Array<{ id: number | string }>) => void) => void;
        };
      };
    }
  ).driver;

  const db = driver?.databaseConnection;

  if (db && typeof db.all === "function") {
    const rawRows = await new Promise<Array<{ id: number | string }>>((resolve, reject) => {
      db.all(
        `UPDATE resumes
         SET locked_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT id FROM resumes
           WHERE status = 'in_progress' AND locked_at IS NULL
           ORDER BY create_at ASC
           LIMIT 1
         )
         RETURNING id;`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        },
      );
    });

    const claimedId = rawRows?.[0]?.id;
    if (!claimedId) {
      return null;
    }

    const repository = dataSource.getRepository(ResumeEntity);
    return await repository.findOneBy({ id: Number(claimedId) });
  }

  // Safe fallback if direct native sqlite3 connection object is wrapped or different
  const rows = (await dataSource.query(
    "SELECT id FROM resumes WHERE status = 'in_progress' AND locked_at IS NULL ORDER BY create_at ASC LIMIT 1;",
  )) as Array<{ id: number | string }>;

  const fallbackId = rows?.[0]?.id;
  if (!fallbackId) {
    return null;
  }

  await dataSource.query("UPDATE resumes SET locked_at = CURRENT_TIMESTAMP WHERE id = ?;", [fallbackId]);

  const repository = dataSource.getRepository(ResumeEntity);
  return await repository.findOneBy({ id: Number(fallbackId) });
}

/**
 * Runs the end-to-end processing pipeline for a single video analysis job:
 * 1. Download video
 * 2. Probe for audio stream
 * 3. Extract audio and transcribe (if present)
 * 4. Extract visual frames (with adaptive fps)
 * 5. Multimodal vision synthesis
 * 6. Webhook delivery
 * 7. Guaranteed per-job directory cleanup
 */
export async function processJob(job: ResumeEntity, options: ProcessJobOptions = {}): Promise<void> {
  const dataSource = options.dataSource ?? AppDataSource;
  const services = options.services ?? defaultJobProcessorServices;
  const repository = dataSource.getRepository(ResumeEntity);

  let tempDir = options.tempDir;
  if (!tempDir) {
    try {
      tempDir = getConfig().TEMP_DIR;
    } catch {
      tempDir = "/tmp/video-analyzer";
    }
  }

  const jobDir = path.join(tempDir, String(job.id));

  try {
    // 1. Download video
    const videoPath = await services.downloadVideo(job.videoUrl, tempDir, String(job.id));

    // 2. Check for audio stream
    const audioPresent = await services.hasAudioStream(videoPath);
    job.hasAudio = audioPresent;

    let transcription: string | null = null;
    let fps = "1";

    // 3. Audio extraction & STT
    if (audioPresent) {
      const audioPath = path.join(jobDir, "audio.mp3");
      await services.extractAudio(videoPath, audioPath);
      transcription = await services.transcribeAudio(audioPath);
      job.transcription = transcription;

      if (transcription && transcription.trim().length > 0) {
        fps = "1/1.5";
      } else {
        fps = "1";
      }
    } else {
      job.transcription = null;
      fps = "1";
    }

    // 4. Extract frames
    const framesDir = path.join(jobDir, "frames");
    const framePaths = await services.extractFrames(videoPath, framesDir, fps);

    // 5. Vision analysis
    const summary = await services.analyzeVideoContext({
      transcription,
      framePaths,
    });
    job.content = summary;
    job.status = ResumeStatus.Processed;
    await repository.save(job);

    // 6. Deliver webhook notification
    try {
      await services.sendWebhookNotification({
        jobId: String(job.id),
        telegramId: job.telegramId,
        videoUrl: job.videoUrl,
        hasTranscription: Boolean(transcription && transcription.length > 0),
        transcription: transcription ?? null,
        summary,
        completedAt: new Date().toISOString(),
      });
      job.status = ResumeStatus.Sent;
      job.deliveredAt = new Date();
      await repository.save(job);
    } catch (_webhookErr) {
      // Non-fatal to analysis: record retry metadata
      job.deliveryAttempts = (job.deliveryAttempts ?? 0) + 1;
      job.nextDeliveryRetryAt = new Date(Date.now() + 60_000);
      await repository.save(job);
    }
  } catch (error) {
    job.status = ResumeStatus.Failed;
    job.errorMessage = error instanceof Error ? error.message : String(error);
    await repository.save(job);
  } finally {
    // 7. Guaranteed individual job directory garbage collection
    if (fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.error(`Failed to clean up job scratchpad at ${jobDir}:`, rmErr);
      }
    }
  }
}

/**
 * Autonomous background pool dispatcher.
 * Dispatches claimed jobs across a bounded concurrency pool without blocking Job N behind Job 1.
 */
export class WorkerDispatcher {
  private isRunning = false;
  private loopPromise: Promise<void> | null = null;
  private runningJobs = new Set<Promise<void>>();

  private readonly dataSource: DataSource;
  private readonly maxConcurrency: number;
  private readonly tempDir: string;
  private readonly services: JobProcessorServices;
  private readonly pollIntervalMs: number;

  constructor(options: WorkerDispatcherOptions = {}) {
    this.dataSource = options.dataSource ?? AppDataSource;
    this.services = options.services ?? defaultJobProcessorServices;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;

    let defaultMaxConcurrency = 3;
    let defaultTempDir = "/tmp/video-analyzer";

    try {
      const config = getConfig();
      defaultMaxConcurrency = config.MAX_CONCURRENT_JOBS;
      defaultTempDir = config.TEMP_DIR;
    } catch {
      // Fallback defaults
    }

    this.maxConcurrency = options.maxConcurrency ?? defaultMaxConcurrency;
    this.tempDir = options.tempDir ?? defaultTempDir;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    // Await any remaining in-flight tasks before shutting down
    if (this.runningJobs.size > 0) {
      await Promise.allSettled(Array.from(this.runningJobs));
    }
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      const availableSlots = this.maxConcurrency - this.runningJobs.size;

      if (availableSlots > 0) {
        let jobClaimed = false;

        for (let i = 0; i < availableSlots; i++) {
          if (!this.isRunning) break;

          const job = await claimNextPendingJob(this.dataSource);
          if (job) {
            jobClaimed = true;
            this.dispatchJob(job);
          } else {
            // No more pending jobs currently available
            break;
          }
        }

        // If no jobs were available to claim, poll after interval
        if (!jobClaimed && this.isRunning) {
          await this.sleep(this.pollIntervalMs);
        }
      } else {
        // Pool is at max capacity; wait for at least one slot to be freed
        await Promise.race([...Array.from(this.runningJobs), this.sleep(this.pollIntervalMs)]);
      }
    }
  }

  private dispatchJob(job: ResumeEntity): void {
    const jobPromise: Promise<void> = processJob(job, {
      dataSource: this.dataSource,
      tempDir: this.tempDir,
      services: this.services,
    }).finally(() => {
      this.runningJobs.delete(jobPromise);
    });

    this.runningJobs.add(jobPromise);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
