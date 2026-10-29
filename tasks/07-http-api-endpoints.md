# Task 07: HTTP API Endpoints & Job Ingestion

## Objective

Implement the Express router, controller, and DTO validation for the public endpoint `POST /api/v1/analyze`, accepting requests from LAN clients and responding with `HTTP 202 Accepted`.

## Requirements

- `analyzeController.ts` & `analyzeRoutes.ts`:
  - Route: `POST /api/v1/analyze`.
  - Apply `authMiddleware`.
  - Body validation with Zod:

    ```typescript
    const AnalyzeRequestSchema = z.object({
      telegramId: z.string().min(1, "telegramId is required"),
      url: z.string().url("A valid video URL is required"),
    });
    ```
  - Persist new record in SQLite:
    - `telegramId`: input telegramId.
    - `videoUrl`: input url.
    - `status`: `ResumeStatus.InProgress`.
  - Response:
    - Status: `202 Accepted`.
    - Body:

      ```json
      {
        "jobId": "<uuid>",
        "status": "in_progress",
        "message": "Video queued for analysis"
      }
      ```

## Tests to Implement (`src/__tests__/api.spec.ts`)

- [ ] Returns `202 Accepted` and creates database record when payload and Bearer token are valid.
- [ ] Returns `400 Bad Request` with structured errors when `url` is missing or not a valid URL.
- [ ] Returns `400 Bad Request` when `telegramId` is missing or empty.
- [ ] Returns `401 Unauthorized` when Bearer token is omitted or invalid.
