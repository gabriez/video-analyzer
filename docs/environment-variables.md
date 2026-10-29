# Environment Variables Guide

This document explains every environment variable used across the Video Analyzer HTTP API server, autonomous background worker, and database layer.

The configuration is strictly validated on startup using **Zod** (`src/config.ts`).

---

## Variable Reference Table

| Variable              | Required? | Default Value             | Description                                                                                                                                                                      |
| :-------------------- | :-------: | :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                |    No     | `3000`                    | HTTP port on which the Express REST API listens.                                                                                                                                 |
| `DB_DATABASE`         |    No     | `database.sqlite`         | Absolute or relative path to the SQLite database file. In Docker Compose, this maps to `/app/data/database.sqlite`.                                                              |
| `DB_LOGGING`          |    No     | `false`                   | Enables TypeORM SQL query logging. Accepts boolean string (`true`, `false`, `1`, `0`).                                                                                           |
| `DB_SYNCHRONIZE`      |    No     | `false`                   | Automatically creates missing tables and columns on startup. Recommended `false` in production.                                                                                  |
| `API_BEARER_TOKEN`    |  **Yes**  | —                         | Static secret token required for HTTP authentication (`Authorization: Bearer <token>`) on protected endpoints like `POST /api/v1/analyze`.                                       |
| `WHISPER_URL`         |    No     | `http://speaches:8000/v1` | Base URL for the OpenAI-compatible Speech-to-Text service (e.g. local Speaches container). Must be a valid URL.                                                                  |
| `OPENROUTER_API_KEY`  |  **Yes**  | —                         | Secret API key used to authenticate multimodal analysis requests against OpenRouter (`https://openrouter.ai/api/v1`).                                                            |
| `OPENROUTER_MODEL`    |    No     | `google/gemini-2.5-flash` | Multimodal Vision model ID hosted on OpenRouter responsible for frame analysis and summary synthesis.                                                                            |
| `WEBHOOK_URL`         |    No     | —                         | Target URL where the background worker posts the completed video summary. If omitted or empty string, webhook dispatch is skipped.                                               |
| `WEBHOOK_AUTH_HEADER` |    No     | `X-N8N-Webhook-Token`     | Custom HTTP header name injected during webhook delivery (e.g. for n8n webhook authentication).                                                                                  |
| `WEBHOOK_AUTH_TOKEN`  |    No     | —                         | Secret token value associated with `WEBHOOK_AUTH_HEADER`. Omitted from headers if undefined or empty.                                                                            |
| `TEMP_DIR`            |    No     | `/tmp/video-analyzer`     | Scratchpad directory where downloaded videos, extracted audio (`.mp3`), and frame sequences (`.jpg`) are stored during processing. Cleaned up immediately after task completion. |
| `MAX_CONCURRENT_JOBS` |    No     | `3`                       | Maximum number of video analysis jobs processed simultaneously by the background worker pool to avoid CPU/RAM saturation.                                                        |

---

## Detailed Variable Specifications

### 1. HTTP Server & Security

#### `PORT`

- **Type**: `integer` (> 0)
- **Default**: `3000`
- **Usage**: Sets the port for the incoming REST API. Inside Docker, this stays `3000` while the compose file maps it to the host port via `${APP_PORT:-3001}:3000`.

#### `API_BEARER_TOKEN`

- **Type**: `string` (min 1 character)
- **Mandatory**: Yes. The application fails fast on startup if missing.
- **Security**: Validated using constant-time comparison (`crypto.timingSafeEqual`) to mitigate timing side-channel attacks. Requests without this exact Bearer token receive `401 Unauthorized`.

---

### 2. Database & SQLite Storage

#### `DB_DATABASE`

- **Type**: `string`
- **Default**: `database.sqlite`
- **Usage**: Specifies SQLite storage location. In multi-container Docker environments, this points to the shared volume `/app/data/database.sqlite` operating under SQLite WAL mode (`PRAGMA journal_mode = WAL`).

#### `DB_LOGGING`

- **Type**: `boolean` (`true` / `false` / `1` / `0`)
- **Default**: `false`
- **Usage**: Set to `true` during local development or debugging to inspect raw SQL queries and WAL lock transactions.

#### `DB_SYNCHRONIZE`

- **Type**: `boolean`
- **Default**: `false`
- **Usage**: When set to `true`, TypeORM synchronizes database schema with the entity models on boot. Note that `appDataSource.ts` also safely auto-provisions the `resumes` table if the SQLite database is fresh/empty.

---

### 3. AI & Speech-to-Text Services

#### `WHISPER_URL`

- **Type**: `string` (valid URL)
- **Default**: `http://speaches:8000/v1`
- **Usage**: Target endpoint for audio transcription. Defaults to the local `speaches` container service defined in `docker-compose.yml`.

#### `OPENROUTER_API_KEY`

- **Type**: `string`
- **Mandatory**: Yes. Required for generating multimodal video summaries.
- **Usage**: Authenticates against OpenRouter (`https://openrouter.ai/api/v1`).

#### `OPENROUTER_MODEL`

- **Type**: `string`
- **Default**: `google/gemini-2.5-flash`
- **Usage**: Model identifier for multimodal processing. Receives extracted sequential image frames (`data:image/jpeg;base64,...`) and the transcribed audio to produce structured Spanish markdown summaries.

---

### 4. n8n Webhook Dispatcher

#### `WEBHOOK_URL`

- **Type**: `string` (valid URL, optional)
- **Default**: `undefined`
- **Usage**: Endpoint to receive the final JSON payload containing `jobId`, `telegramId`, `videoUrl`, `transcription`, and `summary`.

#### `WEBHOOK_AUTH_HEADER` & `WEBHOOK_AUTH_TOKEN`

- **Defaults**: `X-N8N-Webhook-Token`, `undefined`
- **Usage**: Custom header pair injected into outgoing webhook HTTP POST requests to authenticate the payload against n8n workflow triggers.

---

### 5. Worker Concurrency & Scratchpad

#### `TEMP_DIR`

- **Type**: `string`
- **Default**: `/tmp/video-analyzer` (or `/app/temp` in Docker)
- **Usage**: Root path for temporary per-job workspace directories (`${TEMP_DIR}/${jobId}`). Every job directory is strictly removed inside a `finally` block once completed or failed.

#### `MAX_CONCURRENT_JOBS`

- **Type**: `integer` (> 0)
- **Default**: `3`
- **Usage**: Bounded concurrency ceiling. Controls how many active download/probe/extract/summarize pipelines can run simultaneously without saturating host memory or CPU during heavy FFmpeg or `yt-dlp` operations.
