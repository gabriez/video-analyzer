import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { DownloadOptions } from "../types/downloader.js";

const execFileAsync = promisify(execFile);

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

export class DownloadTimeoutError extends DownloadError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message, cause);
    this.name = "DownloadTimeoutError";
  }
}

export type { DownloadOptions } from "../types/downloader.js";

const DEFAULT_TIMEOUT_MS = 180_000; // 3 minutes max

/**
 * Downloads a video from a given URL (social media or direct link) using `yt-dlp`.
 * Enforces a maximum resolution of 720p and outputs an MP4 file to `${outputDir}/${jobId}/input.mp4`.
 *
 * @param url Source video URL
 * @param outputDir Base temporary scratch directory
 * @param jobId Unique identifier for the analysis job
 * @param options Configurable options such as timeout
 * @returns Path to the downloaded input.mp4 file
 * @throws DownloadTimeoutError if the process exceeds timeoutMs
 * @throws DownloadError on invalid URLs, unreachable hosts, or yt-dlp execution failures
 */
export async function downloadVideo(url: string, outputDir: string, jobId: string, options: DownloadOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const targetDir = path.join(outputDir, jobId);
  const targetPath = path.join(targetDir, "input.mp4");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const args = [
    "-f",
    "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    targetPath,
    url,
  ];

  try {
    await execFileAsync("yt-dlp", args, { timeout: timeoutMs });

    if (!fs.existsSync(targetPath)) {
      throw new DownloadError(`yt-dlp exited successfully but target file does not exist at ${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    if (stat.size === 0) {
      throw new DownloadError(`Downloaded video file is empty (0 bytes) at ${targetPath}`);
    }

    return targetPath;
  } catch (error: unknown) {
    const execErr = error as {
      killed?: boolean;
      signal?: string;
      code?: string | number;
      message?: string;
      stderr?: string;
    };

    if (execErr.killed || execErr.signal === "SIGTERM" || execErr.code === "ETIMEDOUT") {
      throw new DownloadTimeoutError(`Video download timed out after ${timeoutMs}ms for URL: ${url}`, error);
    }

    if (error instanceof DownloadError) {
      throw error;
    }

    const stderrDetails = execErr.stderr ? ` Stderr: ${execErr.stderr}` : "";
    throw new DownloadError(`Failed to download video from ${url}.${stderrDetails} Reason: ${execErr.message ?? String(error)}`, error);
  }
}
