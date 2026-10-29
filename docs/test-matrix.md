# Test Suite & Quality Assurance Plan: Video Analyzer

## 1. Authentication & API Contract Strategy

- **Static Bearer Token**: The API validates the incoming `Authorization: Bearer <token>` header against an environment variable `API_BEARER_TOKEN`. No complex DB-backed token validation is needed for this stage.
- **Fixed Webhook Target**: The destination webhook is statically configured in environment variables (`WEBHOOK_URL`), along with any required webhook authentication headers/tokens (`WEBHOOK_AUTH_HEADER` / `WEBHOOK_AUTH_TOKEN`, e.g., for n8n webhook authentication). The incoming client request only provides `{ telegramId, url }`.

---

## 2. Testing Methodology: Unit vs. Real Media vs. Mocks

- **Media Processing (FFprobe & FFmpeg)**:
  - We do **NOT** mock FFmpeg or FFprobe. We generate or include a real deterministic test video fixture (e.g. a 5-second synthesized MP4 generated via `ffmpeg -f lavfi ...` with a sine wave audio track, and another video without audio).
  - Tests verify actual file generation in temp directories, correct frame counts, and proper OS subprocess exit codes.
- **External AI Providers (OpenRouter / Gemini)**:
  - **Mocked** via Vitest. Unit tests must not consume paid API tokens or depend on outbound internet access.
- **Speech-to-Text (Speaches / Whisper)**:
  - Unit tests mock the OpenAI audio transcription client. Real end-to-end integration can run inside devContainers or Docker Compose.
- **Webhook Target (n8n)**:
  - Tested using local mock HTTP servers (e.g. `msw` or `http.createServer`) to verify exponential backoff retries, header transmission, and failure thresholds.

---

## 3. Detailed Test Matrix

### A. API Suite (`src/__tests__/api.spec.ts`)

| ID        | Test Scenario                   | Input / Setup                                                                  | Expected Outcome                                                                                                     |
| :-------- | :------------------------------ | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **API-1** | Successful job ingestion        | Valid `Authorization: Bearer <API_BEARER_TOKEN>` + valid `{ telegramId, url }` | Returns `202 Accepted` with `{ jobId, status: "in_progress" }`. Job is persisted in SQLite with status `InProgress`. |
| **API-2** | Missing or invalid Bearer token | Missing header, malformed header (`Basic ...`), or mismatched token            | Returns `401 Unauthorized` with `{ error: "Unauthorized" }`. Zero DB writes.                                         |
| **API-3** | Payload validation failure      | Missing `url`, non-string `telegramId`, or invalid URL schema                  | Returns `400 Bad Request` with structured Zod validation errors.                                                     |

---

### B. Media Probing & Extraction Suite (`src/__tests__/media.spec.ts`)

Using real 5-second test video fixtures created with FFmpeg:
- `video_with_audio_5s.mp4`: 5 seconds duration, H.264 video + AAC audio sine wave.
- `video_silent_5s.mp4`: 5 seconds duration, H.264 video, no audio stream.
- `corrupt_video.mp4`: Truncated / malformed byte file.

| ID            | Test Scenario                             | Input / Setup                              | Expected Outcome                                                    |
| :------------ | :---------------------------------------- | :----------------------------------------- | :------------------------------------------------------------------ |
| **PROBE-1**   | Detect audio stream presence              | `video_with_audio_5s.mp4`                  | `hasAudioStream(file)` resolves to `true`.                          |
| **PROBE-2**   | Detect silent video (no audio stream)     | `video_silent_5s.mp4`                      | `hasAudioStream(file)` resolves to `false`.                         |
| **PROBE-3**   | Probe corrupt or invalid file             | `corrupt_video.mp4`                        | `hasAudioStream(file)` throws descriptive `MediaProbeError`.        |
| **EXTRACT-1** | Extract audio to MP3                      | `video_with_audio_5s.mp4`                  | Generates valid mono 16kHz `audio.mp3` file on disk.                |
| **EXTRACT-2** | Dynamic frame extraction (1 frame / 1.5s) | `video_with_audio_5s.mp4`, `fps = "1/1.5"` | Extracts exactly 3 to 4 JPEG frame files in output dir.             |
| **EXTRACT-3** | Dynamic frame extraction (1 frame / 1.0s) | `video_with_audio_5s.mp4`, `fps = "1"`     | Extracts exactly 5 JPEG frame files in output dir.                  |
| **EXTRACT-4** | Extraction on corrupt/truncated file      | `corrupt_video.mp4`                        | Throws `MediaExtractionError`, does not hang, cleans partial files. |
| **EXTRACT-5** | Extraction when input file does not exist | `/non/existent/path.mp4`                   | Throws `FileNotFoundError` immediately before spawning process.     |

---

### C. Speech-to-Text & Vision Unit Suites (`src/__tests__/stt.spec.ts`, `src/__tests__/vision.spec.ts`)

| ID           | Test Scenario                                   | Input / Setup                                                                | Expected Outcome                                                            |
| :----------- | :---------------------------------------------- | :--------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **STT-1**    | Audio transcribed successfully                  | Mock OpenAI `audio.transcriptions.create` returning `{ text: "Hola mundo" }` | Returns `"Hola mundo"`.                                                     |
| **STT-2**    | Empty / silent transcription                    | Mock OpenAI returning `{ text: "" }` or `{ text: "   " }`                    | Returns `""` (empty string). Caller interprets as no usable speech.         |
| **STT-3**    | Speaches connection failure                     | Mock OpenAI throwing network `ECONNREFUSED`                                  | Throws `TranscriptionServiceError`.                                         |
| **VISION-1** | Multimodal analysis with transcription + frames | Mock OpenRouter client + sample text + base64 frames                         | Dispatches formatted `image_url` parts, returns generated markdown summary. |
| **VISION-2** | Multimodal analysis vision-only                 | Mock OpenRouter client + empty transcription + frames                        | Dispatches prompt adapted for silent video analysis.                        |
| **VISION-3** | OpenRouter Rate Limit / API Error               | Mock OpenRouter returning HTTP 429 or 500                                    | Throws `VisionServiceError` with upstream status details.                   |

---

### D. Webhook & Exponential Backoff Suite (`src/__tests__/webhook.spec.ts`)

| ID         | Test Scenario                             | Input / Setup                                              | Expected Outcome                                                                                |
| :--------- | :---------------------------------------- | :--------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **HOOK-1** | First-try successful delivery             | Mock HTTP server returning `200 OK`                        | Sends payload + n8n auth header; resolves with `{ success: true, attempts: 1 }`.                |
| **HOOK-2** | Network failure followed by recovery      | Mock server returns `503` on attempt 1, `200` on attempt 2 | Executes retry with exponential delay, succeeds on attempt 2.                                   |
| **HOOK-3** | Persistent server error (exhaust retries) | Mock server returns `500` on all attempts                  | Retries up to max configured attempts (e.g. 3 in test), throws `WebhookDeliveryExhaustedError`. |
| **HOOK-4** | Webhook timeout                           | Mock server hangs without responding                       | Aborts request after configured timeout (e.g. 5s), triggers retry.                              |

---

### E. Worker End-to-End & Error Breakdown Suite (`src/__tests__/worker.spec.ts`)

Tests the entire pipeline lifecycle and every critical breaking point:

| ID               | Test Scenario                     | Failure Point / Setup                                    | Expected Outcome & System State                                                                             |
| :--------------- | :-------------------------------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **WORKER-1**     | Happy Path: Full Video with Audio | Valid video, mocked STT, mocked Vision, mocked Webhook   | Job transitions `InProgress` ➔ `Processed` ➔ `Sent`. DB stores summary and transcription. Temp dir deleted. |
| **WORKER-2**     | Happy Path: Silent Video          | Silent video, mocked Vision, mocked Webhook              | Audio step skipped. Frames extracted at 1 fps. Job transitions to `Sent`. Temp dir deleted.                 |
| **WORKER-ERR-1** | Video Download Fails              | `yt-dlp` fails (URL 404, private video, network timeout) | Job marked `Failed` in DB with `error` message. Temp dir cleaned. Process does not crash.                   |
| **WORKER-ERR-2** | Video Corrupt During Extraction   | File corrupted during download                           | Extraction fails, job marked `Failed`, temp dir cleaned, worker moves to next job.                          |
| **WORKER-ERR-3** | STT Service Unreachable           | Speaches container down/failing                          | Worker catches error, updates job status to `Failed`, cleans temp dir.                                      |
| **WORKER-ERR-4** | OpenRouter API Fails              | OpenRouter returns 500 / invalid key                     | Worker records failure in DB, cleans temp dir.                                                              |
| **WORKER-ERR-5** | Webhook Unreachable After Retries | Webhook server down permanently                          | Job processed successfully but delivery fails: status marked `Failed` (or `DeliveryFailed`) with error log. |
| **WORKER-ERR-6** | Temp Directory Garbage Collection | Any failure anywhere in the pipeline                     | `finally` block guarantees all temporary files for that `jobId` are removed from disk.                      |
