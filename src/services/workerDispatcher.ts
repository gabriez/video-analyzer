import fs from "node:fs";
import path from "node:path";

import { getConfig } from "../config.js";
import { logger as defaultLogger } from "../logger.js";
import type { AiClients } from "../types/ai.js";
import type { IResumeDatabaseService } from "../types/database.js";
import type { Logger } from "../types/logger.js";
import type { ResumeEntityDTO } from "../types/resume.js";
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
export async function processJob(job: ResumeEntityDTO, options: ProcessJobOptions = {}): Promise<void> {
  const databaseService = options.databaseService ?? getResumeDatabaseService();
  const services = options.services ?? defaultJobProcessorServices;
  const aiClients = options.aiClients ?? getAiClients();
  const jobLogger = (options.logger ?? defaultLogger).child({ context: "Worker", jobId: job.id });

  let tempDir = options.tempDir;
  if (!tempDir) {
    try {
      tempDir = getConfig().TEMP_DIR;
    } catch {
      tempDir = "/tmp/video-analyzer";
    }
  }

  const jobDir = path.join(tempDir, String(job.id));
  const jobStartTime = Date.now();

  jobLogger.info(
    {
      telegramId: job.telegramId,
      videoUrl: job.videoUrl,
    },
    "Starting video analysis pipeline",
  );

  try {
    // 1. Download video
    jobLogger.info({ url: job.videoUrl }, "[1/7] Downloading video via yt-dlp...");
    const downloadStart = Date.now();
    const videoPath = await services.downloadVideo(job.videoUrl, tempDir, String(job.id));
    const downloadDuration = Date.now() - downloadStart;
    const sizeBytes = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    jobLogger.info(
      {
        videoPath,
        sizeBytes,
        durationMs: downloadDuration,
      },
      `[1/7] Video downloaded successfully in ${downloadDuration}ms (${sizeMB} MB)`,
    );

    // 2. Check for audio stream
    jobLogger.info("[2/7] Probing media stream for audio track...");
    const probeStart = Date.now();
    const audioPresent = await services.hasAudioStream(videoPath);
    const probeDuration = Date.now() - probeStart;
    jobLogger.info(
      {
        hasAudio: audioPresent,
        durationMs: probeDuration,
      },
      `[2/7] Audio stream probe completed in ${probeDuration}ms (hasAudio: ${audioPresent})`,
    );

    let transcription: string | null = null;
    let fps = "1";

    // 3. Audio extraction & STT (reusing persistent whisperClient)
    if (audioPresent) {
      const audioPath = path.join(jobDir, "audio.mp3");
      jobLogger.info("[3/7] Extracting audio track to MP3 (16kHz mono)...");
      const audioStart = Date.now();
      await services.extractAudio(videoPath, audioPath);
      jobLogger.info(`[3/7] Audio track extracted in ${Date.now() - audioStart}ms`);

      jobLogger.info("[3/7] Transcribing audio with Whisper...");
      const sttStart = Date.now();
      transcription = await services.transcribeAudio(audioPath, {
        client: aiClients.whisperClient,
      });
      const sttDuration = Date.now() - sttStart;
      jobLogger.info(
        {
          charsLength: transcription?.length ?? 0,
          durationMs: sttDuration,
        },
        `[3/7] Audio transcribed in ${sttDuration}ms (${transcription?.length ?? 0} chars)`,
      );

      if (transcription && transcription.trim().length > 0) {
        fps = "1/1.5";
      } else {
        fps = "1";
      }
      jobLogger.info(`[3/7] Adaptive sampling set to ${fps} fps (${fps === "1/1.5" ? "speech detected" : "inaudible audio"})`);
    } else {
      jobLogger.info("[3/7] No audio stream detected; skipping audio extraction and STT. Setting sampling to 1 fps");
      transcription = null;
      fps = "1";
    }

    // 4. Extract frames
    const framesDir = path.join(jobDir, "frames");
    jobLogger.info(`[4/7] Extracting video frames at ${fps} fps...`);
    const framesStart = Date.now();
    const framePaths = await services.extractFrames(videoPath, framesDir, fps);
    const framesDuration = Date.now() - framesStart;
    jobLogger.info(
      {
        frameCount: framePaths.length,
        fps,
        durationMs: framesDuration,
      },
      `[4/7] Extracted ${framePaths.length} video frames in ${framesDuration}ms`,
    );

    // 5. Vision analysis (reusing persistent visionClient)
    jobLogger.info(
      {
        frameCount: framePaths.length,
        hasTranscription: Boolean(transcription && transcription.length > 0),
      },
      `[5/7] Analyzing ${framePaths.length} visual frames with multimodal LLM...`,
    );
    const visionStart = Date.now();
    const summary = await services.analyzeVideoContext({
      transcription,
      framePaths,
      client: aiClients.visionClient,
    });
    const visionDuration = Date.now() - visionStart;
    jobLogger.info(
      {
        summaryLength: summary.length,
        durationMs: visionDuration,
      },
      `[5/7] Vision analysis completed in ${visionDuration}ms (${summary.length} chars)`,
    );

    // 6. Update database state to Processed
    jobLogger.info("[6/7] Updating job status to Processed in database...");
    const dbStart = Date.now();
    await databaseService.markProcessed(job.id, {
      content: summary,
      transcription,
      hasAudio: audioPresent,
    });
    jobLogger.info(`[6/7] Database updated to Processed in ${Date.now() - dbStart}ms`);

    // 7. Deliver webhook notification
    try {
      jobLogger.info("[7/7] Delivering webhook notification...");
      const webhookStart = Date.now();
      const webhookResult = await services.sendWebhookNotification({
        jobId: String(job.id),
        telegramId: job.telegramId,
        videoUrl: job.videoUrl,
        hasTranscription: Boolean(transcription && transcription.length > 0),
        transcription: transcription ?? null,
        summary,
        completedAt: new Date().toISOString(),
      });
      await databaseService.markSent(job.id, new Date());
      jobLogger.info(
        `[7/7] Webhook delivered successfully in ${Date.now() - webhookStart}ms (attempts: ${webhookResult?.attempts ?? 1}). Job status marked as Sent.`,
      );
    } catch (webhookErr) {
      // Non-fatal to analysis: record retry metadata via database service
      jobLogger.warn(`[7/7] Webhook delivery failed: ${webhookErr instanceof Error ? webhookErr.message : String(webhookErr)}. Scheduling retry.`);
      await databaseService.recordDeliveryFailure(job.id, new Date(Date.now() + 60_000));
    }

    const totalJobDuration = Date.now() - jobStartTime;
    jobLogger.info(
      {
        totalDurationMs: totalJobDuration,
      },
      `Job #${job.id} completed successfully in ${totalJobDuration}ms`,
    );
  } catch (error) {
    const totalJobDuration = Date.now() - jobStartTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobLogger.error(
      {
        err: error,
        totalDurationMs: totalJobDuration,
        errorMessage,
      },
      `Job #${job.id} FAILED after ${totalJobDuration}ms: ${errorMessage}`,
    );
    await databaseService.markFailed(job.id, errorMessage);
  } finally {
    // 8. Guaranteed individual job directory garbage collection
    if (fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
        jobLogger.debug(`Scratchpad directory cleaned up: ${jobDir}`);
      } catch (rmErr) {
        jobLogger.error({ err: rmErr }, `Failed to clean up job scratchpad at ${jobDir}`);
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
  private readonly logger: Logger;

  constructor(options: WorkerDispatcherOptions = {}) {
    this.databaseService = options.databaseService ?? getResumeDatabaseService();
    this.aiClients = options.aiClients ?? getAiClients();
    this.services = options.services ?? defaultJobProcessorServices;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.logger = (options.logger ?? defaultLogger).child({ context: "Dispatcher" });

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
    this.logger.info(
      {
        maxConcurrency: this.maxConcurrency,
        pollIntervalMs: this.pollIntervalMs,
      },
      "WorkerDispatcher pool started",
    );
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info(
      {
        activeJobs: this.runningJobs.size,
      },
      "WorkerDispatcher stopping, awaiting in-flight jobs...",
    );
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    // Await any remaining in-flight tasks before shutting down
    if (this.runningJobs.size > 0) {
      await Promise.allSettled(Array.from(this.runningJobs));
    }
    this.logger.info("WorkerDispatcher stopped cleanly.");
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
            this.logger.info(
              {
                jobId: job.id,
                telegramId: job.telegramId,
                videoUrl: job.videoUrl,
                activePoolSize: this.runningJobs.size + 1,
                maxConcurrency: this.maxConcurrency,
              },
              `Claimed job #${job.id} for processing`,
            );
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

  private dispatchJob(job: ResumeEntityDTO): void {
    const jobPromise: Promise<void> = processJob(job, {
      databaseService: this.databaseService,
      aiClients: this.aiClients,
      tempDir: this.tempDir,
      services: this.services,
      logger: this.logger,
    }).finally(() => {
      this.runningJobs.delete(jobPromise);
      this.logger.debug(
        {
          jobId: job.id,
          remainingActive: this.runningJobs.size,
          maxConcurrency: this.maxConcurrency,
        },
        `Job #${job.id} released from dispatcher pool`,
      );
    });

    this.runningJobs.add(jobPromise);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
