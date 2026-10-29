import type { DataSource } from "typeorm";
import type { downloadVideo } from "../services/downloader.js";
import type { extractAudio, extractFrames } from "../services/mediaExtractor.js";
import type { hasAudioStream } from "../services/mediaProbe.js";
import type { transcribeAudio } from "../services/sttService.js";
import type { analyzeVideoContext } from "../services/visionService.js";
import type { sendWebhookNotification } from "../services/webhookService.js";

export interface JobProcessorServices {
  downloadVideo: typeof downloadVideo;
  hasAudioStream: typeof hasAudioStream;
  extractAudio: typeof extractAudio;
  transcribeAudio: typeof transcribeAudio;
  extractFrames: typeof extractFrames;
  analyzeVideoContext: typeof analyzeVideoContext;
  sendWebhookNotification: typeof sendWebhookNotification;
}

export interface ProcessJobOptions {
  dataSource?: DataSource;
  tempDir?: string;
  services?: JobProcessorServices;
}

export interface WorkerDispatcherOptions {
  dataSource?: DataSource;
  maxConcurrency?: number;
  tempDir?: string;
  services?: JobProcessorServices;
  pollIntervalMs?: number;
}
