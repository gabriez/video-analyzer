# Task Breakdown: Video Analyzer Implementation

This plan outlines the complete development roadmap broken into cohesive, test-driven work units following `RULES.md` and `docs/architecture.md`.

---

## Task Matrix Overview

| Task File                                        | Module / Area     | Description                                                                                                          |
| :----------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------------------- |
| `tasks/01-configuration-and-auth.md`             | Config & Security | Strongly-typed environment configuration (Zod) and static Bearer token authentication middleware.                    |
| `tasks/02-database-entities-and-job-schema.md`   | Data Layer        | TypeORM entity (`ResumeEntity`) schema enhancements, migration, and SQLite WAL query runner initialization.          |
| `tasks/03-media-probing-and-extraction.md`       | Media Services    | Real FFmpeg/FFprobe fixtures, fail-fast audio detection (`hasAudioStream`), and dynamic frame/audio extraction.      |
| `tasks/04-video-downloader.md`                   | Video Ingestion   | `yt-dlp` integration with bounded resolution (<=720p), timeout guardrails, and direct HTTP fallback.                 |
| `tasks/05-ai-services-whisper-and-openrouter.md` | AI Providers      | Local Speaches client for audio transcription (Whisper) and OpenRouter multimodal Gemini Vision synthesis.           |
| `tasks/06-webhook-delivery-and-backoff.md`       | Integration       | Resilient webhook delivery for n8n with auth headers, exponential backoff, jitter, and error recording.              |
| `tasks/07-http-api-endpoints.md`                 | HTTP Transport    | Express controller `POST /api/v1/analyze`, Zod payload validation, and HTTP 202 async response.                      |
| `tasks/08-background-worker.md`                  | Worker Process    | Standalone `src/worker.ts` queue loop, pipeline orchestration, error boundary handling, and temp garbage collection. |
| `tasks/09-docker-and-e2e-verification.md`        | Infrastructure    | Multi-container Docker Compose end-to-end verification and production deployment checks.                             |
