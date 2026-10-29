# Task 04: Video Downloader Service (yt-dlp)

## Objective

Implement a resilient video downloader using `yt-dlp` to fetch videos from social platforms or direct HTTP URLs, bounded to <= 720p resolution with execution timeout guardrails.

## Requirements

- `downloader.ts`:
  - `downloadVideo(url: string, outputDir: string, jobId: string): Promise<string>`
  - Format selection flag: `-f "bestvideo[height<=720]+bestaudio/best[height<=720]/best"` (prevents downloading 1080p/4K streams).
  - Merged output format: `--merge-output-format mp4`.
  - Enforce max execution timeout (e.g. 180 seconds).
  - Output file path: `${outputDir}/${jobId}/input.mp4`.
  - Validate that downloaded file exists and has size > 0.
  - Throw typed `DownloadError` with detailed stderr on failure (e.g. 404, invalid URL, rate limited).

## Tests to Implement (`src/__tests__/downloader.spec.ts`)

- [ ] Successfully downloads direct HTTP MP4 sample or valid URL to destination.
- [ ] Throws `DownloadError` when URL is invalid or host is unreachable.
- [ ] Throws `DownloadTimeoutError` when download exceeds timeout threshold.
- [ ] Ensures downloaded video does not exceed 720p height.
