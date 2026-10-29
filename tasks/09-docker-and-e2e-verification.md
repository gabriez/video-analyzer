# Task 09: Docker Compose & End-to-End Verification

## Objective

Verify the multi-container topology (`app`, `worker`, `speaches`), file sharing volumes, environment propagation, and end-to-end integration under real runtime conditions.

## Requirements

- [x] Build containers with `docker compose build`.
- [x] Verify services startup with `docker compose up -d`.
- [x] Validate network resolution between containers:
  - `app` and `worker` reach `speaches:8000`.
  - `app` and `worker` share `/app/data` (SQLite database) and `/app/temp`.
- [x] Verify SQLite WAL files (`database.sqlite`, `database.sqlite-wal`, `database.sqlite-shm`) function without lock errors under concurrent access.
- [x] Execute sanity healthcheck request:

  ```bash
  curl -X POST http://localhost:3000/api/v1/analyze \
    -H "Authorization: Bearer <API_BEARER_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"telegramId":"test-user","url":"https://example.com/test.mp4"}'
  ```
- [x] Confirm worker picks up the job and dispatches webhook.
