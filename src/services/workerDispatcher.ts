import fs from "node:fs";
import path from "node:path";

import { getConfig } from "../config.js";
import type { ResumeEntity } from "../database/entities/ResumeEntity.js";
import type { AiClients } from "../types/ai.js";
import type { IResumeDatabaseService } from "../types/database.js";
import type { JobProcessorServices, ProcessJobOptions, WorkerDispatcherOptions } from "../types/worker.js";
import { getAiClients } from "./aiClients.js";
import { getResumeDatabaseService } from "./database/resumeDatabaseService.js";
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
 * Runs the end-to-end processing pipeline for a single video analysis job:
 * 1. Download video
 * 2. Probe for audio stream
 * 3. Extract audio and transcribe (reusing whisperClient)
 * 4. Extract visual frames (with adaptive fps)
 * 5. Multimodal vision synthesis (reusing visionClient)
 * 6. Webhook delivery
 * 7. State updates via injected database service
 * 8. Guaranteed per-job directory cleanup
 */
export async function processJob(job: ResumeEntity, options: ProcessJobOptions = {}): Promise<void> {
  const databaseService = options.databaseService ?? getResumeDatabaseService();
  const services = options.services ?? defaultJobProcessorServices;
  const aiClients = options.aiClients ?? getAiClients();

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

    let transcription: string | null = null;
    let fps = "1";

    // 3. Audio extraction & STT (reusing persistent whisperClient)
    if (audioPresent) {
      const audioPath = path.join(jobDir, "audio.mp3");
      await services.extractAudio(videoPath, audioPath);
      transcription = await services.transcribeAudio(audioPath, {
        client: aiClients.whisperClient,
      });

      if (transcription && transcription.trim().length > 0) {
        fps = "1/1.5";
      } else {
        fps = "1";
      }
    } else {
      transcription = null;
      fps = "1";
    }

    // 4. Extract frames
    const framesDir = path.join(jobDir, "frames");
    const framePaths = await services.extractFrames(videoPath, framesDir, fps);

    // 5. Vision analysis (reusing persistent visionClient)
    const summary = await services.analyzeVideoContext({
      transcription,
      framePaths,
      client: aiClients.visionClient,
    });

    // 6. Update database state to Processed
    await databaseService.markProcessed(job.id, {
      content: summary,
      transcription,
      hasAudio: audioPresent,
    });

    // 7. Deliver webhook notification
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
      await databaseService.markSent(job.id, new Date());
    } catch (_webhookErr) {
      // Non-fatal to analysis: record retry metadata via database service
      await databaseService.recordDeliveryFailure(job.id, new Date(Date.now() + 60_000));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await databaseService.markFailed(job.id, errorMessage);
  } finally {
    // 8. Guaranteed individual job directory garbage collection
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

  private readonly databaseService: IResumeDatabaseService;
  private readonly aiClients: AiClients;
  private readonly maxConcurrency: number;
  private readonly tempDir: string;
  private readonly services: JobProcessorServices;
  private readonly pollIntervalMs: number;

  constructor(options: WorkerDispatcherOptions = {}) {
    this.databaseService = options.databaseService ?? getResumeDatabaseService();
    this.aiClients = options.aiClients ?? getAiClients();
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

          const job = await this.databaseService.claimNextPending();
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
      databaseService: this.databaseService,
      aiClients: this.aiClients,
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
