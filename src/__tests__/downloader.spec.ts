import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DownloadError, DownloadTimeoutError, downloadVideo } from "../services/downloader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Video Downloader Service (yt-dlp)", () => {
  let server: http.Server | undefined;
  let serverPort: number;
  let baseUrl: string;
  let tempBaseDir: string;
  let sampleVideoPath: string;

  beforeAll(async () => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "downloader-fixtures-"));
    sampleVideoPath = path.resolve(__dirname, "fixtures/video_with_audio.mp4");

    // Start a deterministic mock HTTP server for video delivery and edge cases
    const localServer = http.createServer((req, res) => {
      const url = req.url ?? "";

      if (url === "/valid-video.mp4") {
        const stat = fs.statSync(sampleVideoPath);
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": stat.size,
        });
        fs.createReadStream(sampleVideoPath).pipe(res);
        return;
      }

      if (url === "/slow-video.mp4") {
        // Delay response to trigger timeout error deterministically
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { "Content-Type": "video/mp4" });
            res.end("delayed-data");
          }
        }, 3000);
        return;
      }

      if (url === "/not-found.mp4") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    });
    server = localServer;

    await new Promise<void>((resolve) => {
      localServer.listen(0, "127.0.0.1", () => {
        const address = localServer.address();
        if (address && typeof address === "object") {
          serverPort = address.port;
          baseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  }, 20000);

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve) => {
        activeServer.close(() => resolve());
      });
    }
    if (tempBaseDir && fs.existsSync(tempBaseDir)) {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  it("should successfully download video to outputDir/jobId/input.mp4", async () => {
    const jobId = "job-success-100";
    const downloadUrl = `${baseUrl}/valid-video.mp4`;

    const downloadedPath = await downloadVideo(downloadUrl, tempBaseDir, jobId);

    const expectedPath = path.join(tempBaseDir, jobId, "input.mp4");
    expect(downloadedPath).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);

    const stats = fs.statSync(expectedPath);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it("should ensure downloaded video does not exceed 720p height", async () => {
    const jobId = "job-resolution-check";
    const downloadUrl = `${baseUrl}/valid-video.mp4`;

    const downloadedPath = await downloadVideo(downloadUrl, tempBaseDir, jobId);

    // Verify video stream height with ffprobe
    const probeOutput = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=height -of json "${downloadedPath}"`).toString();
    const parsed = JSON.parse(probeOutput);
    const height = parsed.streams?.[0]?.height;

    expect(height).toBeDefined();
    expect(height).toBeLessThanOrEqual(720);
  });

  it("should throw DownloadError when URL returns 404 or host is unreachable", async () => {
    const jobId = "job-404";
    const invalidUrl = `${baseUrl}/not-found.mp4`;

    await expect(downloadVideo(invalidUrl, tempBaseDir, jobId)).rejects.toThrowError(DownloadError);

    await expect(downloadVideo("http://127.0.0.1:59999/unreachable.mp4", tempBaseDir, jobId)).rejects.toThrowError(DownloadError);
  });

  it("should throw DownloadTimeoutError when download exceeds timeout threshold", async () => {
    const jobId = "job-timeout";
    const slowUrl = `${baseUrl}/slow-video.mp4`;

    await expect(downloadVideo(slowUrl, tempBaseDir, jobId, { timeoutMs: 500 })).rejects.toThrowError(DownloadTimeoutError);
  });
});
