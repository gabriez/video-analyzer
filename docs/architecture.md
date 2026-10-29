# Architecture & System Design: Video Analyzer Pipeline

## 1. System Overview & Constraints

The **Video Analyzer** service receives video analysis requests from internal LAN clients (e.g., a Telegram bot backend), extracts multimodal context using a dual audio-vision strategy, synthesizes a structured summary with OpenRouter (Gemini Multimodal), and delivers the result asynchronously to a specified webhook with exponential backoff retries.

### Key Operational Constraints:

- **Zero Cloud Exposure**: The service runs entirely on a private local area network (LAN).
- **Process Isolation**: Under no circumstances is video processing executed within the HTTP request lifecycle or event loop.
- **Fail-Fast Audio Strategy**: Inspect container audio streams before attempting extraction via `ffprobe`.
- **Database Engine**: SQLite managed through TypeORM with Write-Ahead Logging (`WAL`) enabled for concurrent access across `app` and `worker`.
- **Delivery Guarantee**: Webhook delivery must implement exponential backoff with retry tracking stored in SQLite.
- **LLM Multimodal Provider**: OpenRouter API (`https://openrouter.ai/api/v1`) using OpenAI-compatible SDK for Gemini Flash vision inference.
- **Local STT Engine**: Speaches (`faster-whisper` CTranslate2) running on LAN Docker network (`http://speaches:8000/v1`).

---

## 2. Infrastructure & Topology Diagram

```
[ LAN Client / Telegram Bot ]
             │
             │ POST /api/v1/analyze
             │ Headers: Authorization: Bearer <TOKEN>
             │ Payload: { telegramId, url, webhookUrl }
             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Docker Host (Private LAN)                 │
│                                                              │
│  ┌─────────────────────────┐     ┌────────────────────────┐  │
│  │   video-analyzer-api    │     │  video-analyzer-worker │  │
│  │     (src/index.ts)      │     │     (src/worker.ts)    │  │
│  │                         │     │                        │  │
│  │  - Validates DTO & Auth │     │  - Polls PENDING jobs  │  │
│  │  - Creates PENDING job  │     │  - yt-dlp download     │  │
│  │  - Returns 202 Accepted │     │  - ffprobe / ffmpeg    │  │
│  │                         │     │  - Speaches & OpenRouter│ │
│  └───────────┬─────────────┘     └───────────▲────────────┘  │
│              │                               │               │
│              │        app-data (Volume)      │               │
│              └──────► [ SQLite DB (WAL) ] ◄──┘               │
│                                              │               │
│                                              │ HTTP          │
│                                              ▼               │
│                                  ┌────────────────────────┐  │
│                                  │        speaches        │  │
│                                  │ (faster-whisper / STT) │  │
│                                  └────────────────────────┘  │
└──────────────────────────────────────────────┬───────────────┘
                                               │
                                               │ POST <webhookUrl> (Retry + Backoff)
                                               ▼
                                      [ Target Webhook ]
                                      ├─ Stores video in user's Outline
                                      └─ Sends Telegram response to user
```

---

## 3. Analysis Pipeline (Audio-Vision Dual Strategy)

```
                  [ Video File Downloaded (yt-dlp) ]
                                 │
                                 ▼
                  [ ffprobe: Check Audio Stream ]
      ffprobe -i video.mp4 -show_streams -select_streams a -loglevel error
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
           Stream detected?             No audio stream?
                  │                             │
                  │ SÍ                          │ NO
                  ▼                             │
          [ ffmpeg: Extract Audio ]             │
          -vn -acodec libmp3lame                │
          -ar 16000 -ac 1 audio.mp3             │
                  │                             │
                  ▼                             │
          [ Speaches / Whisper STT ]            │
                  │                             │
          Transcription valid?                  │
            ├─ YES ──► Sampling: 1 frame / 1.5s │
            └─ NO  ──► Sampling: 1 frame / 1.0s │
                  │                             │
                  └──────────────┬──────────────┘
                                 ▼
                     [ ffmpeg: Extract Frames ]
                     -vf "fps=${sampleRate}" frames_%04d.jpg
                                 │
                                 ▼
                  [ OpenRouter Multimodal Call ]
                  Model: google/gemini-2.5-flash
                  Prompt: Audio transcription (if present)
                        + Base64 JPEG Frame Samples
                                 │
                                 ▼
                       [ Generated Summary ]
                                 │
                                 ▼
                   [ Webhook Delivery Pipeline ]
```

---

## 4. SQLite Concurrency & Storage Strategy

Because SQLite will be accessed concurrently by two processes (`video-analyzer-api` and `video-analyzer-worker`), the database initialization sets:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

- **`WAL` (Write-Ahead Logging)**: Allows concurrent readers while a write is occurring.
- **`busy_timeout = 5000`**: Ensures queries wait up to 5 seconds if a lock is briefly held instead of throwing `SQLITE_BUSY`.

---

## 5. Repository & Module Organization

The codebase is structured cleanly without redundant boilerplate:

```plaintext
src/
├── __tests__/             # Unit and integration tests (Vitest)
├── config.ts              # Strongly-typed environment configuration (Zod)
├── database/
│   ├── appDataSource.ts   # DataSource factory with SQLite WAL pragmas
│   ├── databaseConfig.ts  # Base TypeORM configuration
│   └── entities/
│       ├── CoreEntity.ts  # Base abstract entity (id, timestamps)
│       └── ResumeEntity.ts# Video analysis job entity
├── services/
│   ├── downloader.ts      # Video retrieval via ytdlp-nodejs / axios
│   ├── mediaProbe.ts      # ffprobe audio stream detection
│   ├── mediaExtractor.ts  # ffmpeg audio and frame extraction
│   ├── sttService.ts      # Speaches (Whisper) transcription client
│   ├── visionService.ts   # OpenRouter (Gemini Multimodal) client
│   └── webhookService.ts  # Webhook delivery with exponential backoff
├── middleware/
│   └── auth.ts            # Bearer token validation middleware
├── controllers/
│   └── analyzeController.ts # HTTP 202 submission handler
├── routes/
│   └── analyzeRoutes.ts   # Express route definitions
├── index.ts               # HTTP API server entry point
└── worker.ts              # Autonomous background queue worker entry point
```

---

## 6. Job State Machine & Lifecycle

```typescript
export enum ResumeStatus {
  InProgress = "in_progress",
  Processed = "processed",
  Sent = "sent",
  Failed = "failed",
}
```

---

## 7. Webhook Delivery & Exponential Backoff

### Algorithm

For failed webhook requests (HTTP non-2xx, network timeouts, or DNS errors):

$$\text{delay} = \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempts}}) + \text{jitter}$$

- **`baseDelay`**: 2 seconds.
- **`maxDelay`**: 300 seconds (5 minutes).
- **`maxAttempts`**: 5 attempts.
- **`jitter`**: Random value between 0 and 1000ms.
