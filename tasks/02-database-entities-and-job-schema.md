# Task 02: Database Entities & Job State Schema

## Objective

Enhance and finalize the TypeORM `ResumeEntity` schema to support the complete video analysis lifecycle, including video URL, transcription, multimodal summary, and webhook delivery retry metadata.

## Requirements

- Update `ResumeEntity` with strict fields:
  - `id`: Primary key (autoincrement or UUID).
  - `telegramId`: string (user correlation ID).
  - `videoUrl`: string (video source link).
  - `status`: Enum (`in_progress`, `processed`, `sent`, `failed`).
  - `hasAudio`: boolean (nullable or default false).
  - `transcription`: text (nullable).
  - `content`: text (generated summary from Gemini/OpenRouter, nullable initially).
  - `errorMessage`: text (nullable, records reason if failed).
  - `deliveryAttempts`: integer (default: 0).
  - `nextDeliveryRetryAt`: Date (nullable, tracks exponential backoff schedule).
  - `deliveredAt`: Date (nullable, tracks webhook confirmation).
  - `create_at` & `updated_at`: inherited from `CoreEntity`.
- Ensure `appDataSource.ts` registers `ResumeEntity` in `entities` array.
- Validate SQLite WAL mode pragmas execution on initialization.

## Tests to Implement (`src/__tests__/database.spec.ts`)

- [ ] Initialize DataSource and confirm WAL mode pragma active (`PRAGMA journal_mode;` returns `wal`).
- [ ] Insert a new `ResumeEntity` in `in_progress` state with required fields.
- [ ] Transition entity status from `in_progress` to `processed`, then `sent`.
- [ ] Query pending jobs ordered by `create_at ASC`.
