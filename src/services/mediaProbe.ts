import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class MediaProbeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MediaProbeError";
  }
}

/**
 * Checks whether a video/media file contains at least one audio stream
 * using native `ffprobe`.
 *
 * @param filePath Path to the media file
 * @returns true if an audio stream is detected, false otherwise
 * @throws MediaProbeError if the file does not exist, is unreadable, or corrupted
 */
export async function hasAudioStream(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    throw new MediaProbeError(`Media file does not exist at path: ${filePath}`);
  }

  const args = ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", filePath];

  try {
    const { stdout, stderr } = await execFileAsync("ffprobe", args);

    if (stderr && stderr.trim().length > 0) {
      throw new Error(`ffprobe error output: ${stderr}`);
    }

    const output = stdout.trim();
    return output.includes("audio");
  } catch (error) {
    if (error instanceof MediaProbeError) {
      throw error;
    }
    throw new MediaProbeError(`Failed to probe media file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}
