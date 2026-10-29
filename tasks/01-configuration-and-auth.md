# Task 01: Configuration & Static Bearer Authentication

## Objective

Implement a robust, strongly-typed environment configuration module using Zod and a lightweight Express authentication middleware validating the static `Authorization: Bearer <token>` against the environment.

## Requirements

- Define Zod schema validating:
  - `PORT`: Server port (default: 3000).
  - `DB_DATABASE`: SQLite path (default: `database.sqlite`).
  - `DB_LOGGING`: Boolean flag (default: false).
  - `DB_SYNCHRONIZE`: Boolean flag (default: false).
  - `API_BEARER_TOKEN`: Required secret token string for incoming LAN requests.
  - `WHISPER_URL`: Speaches base URL (default: `http://speaches:8000/v1`).
  - `OPENROUTER_API_KEY`: OpenRouter secret key.
  - `OPENROUTER_MODEL`: Model ID (default: `google/gemini-2.5-flash`).
  - `WEBHOOK_URL`: Target webhook endpoint for n8n.
  - `WEBHOOK_AUTH_HEADER`: Header name for webhook auth (e.g. `X-N8N-Webhook-Token`).
  - `WEBHOOK_AUTH_TOKEN`: Secret token passed to n8n webhook.
  - `TEMP_DIR`: Scratchpad directory for temporary video files (default: `/tmp/video-analyzer`).
- Auth Middleware:
  - Extract `Authorization` header.
  - Verify format `Bearer <token>`.
  - Validate against `API_BEARER_TOKEN`.
  - Return `401 Unauthorized` with `{ error: "Unauthorized" }` on missing/invalid token.

## Tests to Implement (`src/__tests__/auth.spec.ts`)

- [ ] Returns `401` when `Authorization` header is missing.
- [ ] Returns `401` when token format is not Bearer (e.g. `Basic abc`).
- [ ] Returns `401` when token string does not match `API_BEARER_TOKEN`.
- [ ] Calls `next()` when valid Bearer token is provided.
