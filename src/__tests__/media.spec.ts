import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractAudio, extractFrames, MediaExtractionError } from "../services/mediaExtractor.js";
import { hasAudioStream, MediaProbeError } from "../services/mediaProbe.js";

describe("Media Probing and Extraction Services (FFprobe & FFmpeg)", () => {
  let fixturesDir: string;
  let videoWithAudioPath: string;
  let videoSilentPath: string;
  let corruptVideoPath: string;
  let outputDir: string;

  beforeAll(() => {
    fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-fixtures-"));
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-output-"));

    videoWithAudioPath = path.join(fixturesDir, "video_with_audio_5s.mp4");
    videoSilentPath = path.join(fixturesDir, "video_silent_5s.mp4");
    corruptVideoPath = path.join(fixturesDir, "corrupt_video.mp4");

    // 1. Synthetic 5-second video with testsrc + 1000Hz sine wave audio
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=5:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=5 -c:v libx264 -pix_fmt yuv420p -c:a aac "${videoWithAudioPath}"`,
      { stdio: "ignore" },
    );

    // 2. Synthetic 5-second video with testsrc only (no audio stream)
    execSync(`ffmpeg -y -f lavfi -i testsrc=duration=5:size=320x240:rate=30 -c:v libx264 -pix_fmt yuv420p "${videoSilentPath}"`, { stdio: "ignore" });

    // 3. Corrupt dummy file
    fs.writeFileSync(corruptVideoPath, Buffer.from("THIS_IS_DEFINITELY_NOT_A_VALID_MP4_FILE_BYTES"));
  });

  afterAll(() => {
    if (fixturesDir && fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
    if (outputDir && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  describe("mediaProbe (hasAudioStream)", () => {
    it("should return true for video with an audio stream", async () => {
      const result = await hasAudioStream(videoWithAudioPath);
      expect(result).toBe(true);
    });

    it("should return false for video without an audio stream", async () => {
      const result = await hasAudioStream(videoSilentPath);
      expect(result).toBe(false);
    });

    it("should throw MediaProbeError when probing a corrupt video file", async () => {
      await expect(hasAudioStream(corruptVideoPath)).rejects.toThrowError(MediaProbeError);
    });

    it("should throw MediaProbeError when probing a non-existent file", async () => {
      await expect(hasAudioStream("/tmp/non-existent-video-file.mp4")).rejects.toThrowError(MediaProbeError);
    });
  });

  describe("mediaExtractor (extractAudio & extractFrames)", () => {
    it("should extract playable mono 16kHz MP3 audio from video with audio", async () => {
      const targetAudioPath = path.join(outputDir, "extracted.mp3");

      const generatedAudioPath = await extractAudio(videoWithAudioPath, targetAudioPath);

      expect(generatedAudioPath).toBe(targetAudioPath);
      expect(fs.existsSync(targetAudioPath)).toBe(true);

      const stats = fs.statSync(targetAudioPath);
      expect(stats.size).toBeGreaterThan(1000);

      // Verify with ffprobe that extracted file is mono audio
      const audioProbe = execSync(
        `ffprobe -v error -select_streams a -show_entries stream=codec_name,channels,sample_rate -of json "${targetAudioPath}"`,
      ).toString();
      const parsed = JSON.parse(audioProbe);
      expect(parsed.streams?.[0]?.codec_name).toBe("mp3");
      expect(parsed.streams?.[0]?.channels).toBe(1);
      expect(parsed.streams?.[0]?.sample_rate).toBe("16000");
    });

    it("should extract 3 to 4 JPEG frames when fps = '1/1.5'", async () => {
      const framesDir = path.join(outputDir, "frames_1_5");
      fs.mkdirSync(framesDir, { recursive: true });

      const frames = await extractFrames(videoWithAudioPath, framesDir, "1/1.5");

      expect(frames.length).toBeGreaterThanOrEqual(3);
      expect(frames.length).toBeLessThanOrEqual(4);

      for (const framePath of frames) {
        expect(fs.existsSync(framePath)).toBe(true);
        expect(framePath.endsWith(".jpg")).toBe(true);
        expect(fs.statSync(framePath).size).toBeGreaterThan(0);
      }
    });

    it("should extract exactly 5 JPEG frames when fps = '1'", async () => {
      const framesDir = path.join(outputDir, "frames_1");
      fs.mkdirSync(framesDir, { recursive: true });

      const frames = await extractFrames(videoWithAudioPath, framesDir, "1");

      expect(frames.length).toBe(5);

      for (const framePath of frames) {
        expect(fs.existsSync(framePath)).toBe(true);
        expect(framePath.endsWith(".jpg")).toBe(true);
        expect(fs.statSync(framePath).size).toBeGreaterThan(0);
      }
    });

    it("should throw MediaExtractionError when extracting audio from corrupt video", async () => {
      const targetAudioPath = path.join(outputDir, "corrupt_extracted.mp3");

      await expect(extractAudio(corruptVideoPath, targetAudioPath)).rejects.toThrowError(MediaExtractionError);
    });

    it("should throw MediaExtractionError when extracting frames from corrupt video", async () => {
      const framesDir = path.join(outputDir, "corrupt_frames");
      fs.mkdirSync(framesDir, { recursive: true });

      await expect(extractFrames(corruptVideoPath, framesDir, "1")).rejects.toThrowError(MediaExtractionError);
    });
  });
});
