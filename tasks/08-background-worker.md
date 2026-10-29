# Task 08: Concurrent Background Worker & Pool Dispatcher

## Objective

Implement `src/worker.ts` as an autonomous, multi-task concurrent orchestrator. The worker claims jobs from SQLite and dispatches them across a bounded pool of concurrent task runners using an Async Generator pipeline, preventing Head-of-Line blocking while guarding against CPU/RAM starvation.

## Architecture & Concurrency Model

```
       [ SQLite (in_progress jobs) ]
                     │
                     ▼
          [ Job Dispatcher Loop ]
         (Checks available slots:
      currentRunning < MAX_CONCURRENCY)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [ Worker 1 ]            [ Worker 2 ]  ... (Up to MAX_CONCURRENCY)
    - yt-dlp download       - yt-dlp download
    - ffprobe check         - ffprobe check
    - ffmpeg extract        - ffmpeg extract
    - Speaches STT          - Speaches STT
    - OpenRouter Vision     - OpenRouter Vision
    - n8n Webhook           - n8n Webhook
    - Cleanup temp dir      - Cleanup temp dir
         │                       │
         └───────────┬───────────┘
                     ▼
             [ Slot Freed ] ──► Triggers next claim
```

## Requirements

- `worker.ts`:
  - **Bounded Concurrency**: Configurable `MAX_CONCURRENT_JOBS` (default: 3, passed via env).
  - **Non-blocking Dispatcher**:
    - An Async Generator / Queue reader that yields newly claimed jobs as long as running tasks < `MAX_CONCURRENT_JOBS`.
    - Does NOT `await` the completion of Job 1 before inspecting and launching Job 2.
    - Uses atomic SQLite claiming (`UPDATE ... WHERE id = (SELECT id FROM ... LIMIT 1) RETURNING *`) so each running job is isolated.
  - **Per-Job Execution Pipeline**:
    1. Isolated folder: `/app/temp/<jobId>`.
    2. Download video with `downloader.ts`.
    3. Check audio with `mediaProbe.hasAudioStream`.
    4. If audio present:
       - Extract MP3 via `mediaExtractor.extractAudio`.
       - Transcribe via `sttService.transcribeAudio`.
       - Determine frame rate: if transcription valid (`length > 0`), `fps = 1/1.5`, else `fps = 1`.
    5. If no audio:
       - Skip STT, set `fps = 1`.
    6. Extract frames via `mediaExtractor.extractFrames`.
    7. Synthesize summary via `visionService.analyzeVideoContext`.
    8. Update entity status to `processed` and store `content` & `transcription`.
    9. Deliver summary via `webhookService.sendWebhookNotification`.
    10. Update entity status to `sent` and set `deliveredAt`.
  - **Error Boundary & Isolation**:
    - A failure in Job 1 (e.g. invalid URL, FFmpeg crash) MUST NOT reject, abort, or delay Job 2.
    - Each task handles its own errors independently, records `errorMessage`, updates status to `failed`.
  - **Guaranteed Cleanup**:
    - `finally` block in each individual job worker guarantees `/app/temp/<jobId>` is removed immediately upon completion or failure.

## Tests to Implement (`src/__tests__/worker.spec.ts`)

- [x] Concurrency check: Dispatches and processes two jobs simultaneously without blocking Job 2 behind Job 1.
- [x] Bounded capacity: Does not launch more than `MAX_CONCURRENT_JOBS` at the same time.
- [x] Fault isolation: Job 1 failure (corrupt video) does not impact Job 2's successful execution.
- [x] Atomic claim: Two concurrent worker dispatch loops never claim the exact same job twice.
- [x] Temp directory garbage collection: Cleans `/app/temp/<jobId>` individually per finished task.
