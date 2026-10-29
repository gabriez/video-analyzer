import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class MediaExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MediaExtractionError";
  }
}

/**
 * Extracts and downmixes the audio stream from a video into a mono 16kHz MP3 file.
 *
 * @param videoPath Absolute or relative path to the input video
 * @param outputPath Absolute or relative path for the target MP3 file
 * @returns Resolves with the outputPath on success
 * @throws MediaExtractionError if ffmpeg fails
 */
export async function extractAudio(videoPath: string, outputPath: string): Promise<string> {
  if (!fs.existsSync(videoPath)) {
    throw new MediaExtractionError(`Input video file does not exist at: ${videoPath}`);
  }

  const outputDirectory = path.dirname(outputPath);
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  const args = ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", outputPath];

  try {
    await execFileAsync("ffmpeg", args);
    return outputPath;
  } catch (error) {
    throw new MediaExtractionError(`Failed to extract audio from ${videoPath}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}

/**
 * Extracts frames dynamically from a video using the requested fps filter.
 *
 * @param videoPath Absolute or relative path to the input video
 * @param outputDir Target directory to store extracted frames
 * @param fps Frame rate expression, e.g. "1" (1 frame/sec) or "1/1.5" (1 frame every 1.5s)
 * @returns Sorted array of paths to the extracted image files
 * @throws MediaExtractionError if ffmpeg fails
 */
export async function extractFrames(videoPath: string, outputDir: string, fps: string): Promise<string[]> {
  if (!fs.existsSync(videoPath)) {
    throw new MediaExtractionError(`Input video file does not exist at: ${videoPath}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPattern = path.join(outputDir, "frames_%04d.jpg");
  const args = ["-y", "-i", videoPath, "-vf", `fps=${fps}`, outputPattern];

  try {
    await execFileAsync("ffmpeg", args);

    const generatedFiles = fs
      .readdirSync(outputDir)
      .filter((file) => /^frames_\d{4}\.jpg$/.test(file))
      .sort()
      .map((file) => path.join(outputDir, file));

    return generatedFiles;
  } catch (error) {
    throw new MediaExtractionError(
      `Failed to extract frames from ${videoPath} with fps=${fps}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
