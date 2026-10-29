# Task 05: AI Services (Speaches STT & OpenRouter Multimodal)

## Objective

Implement clients for local Speech-to-Text via Speaches (`faster-whisper`) and remote multimodal video analysis via OpenRouter (Gemini Flash), using the unified `openai` SDK.

## Requirements

- `sttService.ts`:
  - `transcribeAudio(audioPath: string): Promise<string>`
  - Uses OpenAI client configured with `baseURL = config.whisperUrl`.
  - Sends `fs.createReadStream(audioPath)` to `audio.transcriptions.create`.
  - Returns trimmed transcription text, or empty string `""` if silent/inaudible.
  - Throws `TranscriptionError` if service is unreachable.
- `visionService.ts`:
  - `analyzeVideoContext(options: { transcription: string | null; framePaths: string[] }): Promise<string>`
  - Uses OpenAI client configured with `baseURL = "https://openrouter.ai/api/v1"` and `apiKey = config.openRouterApiKey`.
  - Reads image files, converts them to Base64 data URIs (`data:image/jpeg;base64,...`).
  - Constructs system and user messages containing transcription context + sequence of image frames.
  - Sends request to OpenRouter model (`config.openRouterModel`).
  - Returns generated structured markdown summary.
  - Throws `VisionAnalysisError` on API errors or rate limits.

## Tests to Implement (`src/__tests__/stt.spec.ts` & `src/__tests__/vision.spec.ts`)

- [ ] STT returns transcribed text when audio has speech.
- [ ] STT returns empty string `""` when transcription is whitespace or empty.
- [ ] STT propagates `TranscriptionError` on network rejection.
- [ ] Vision service formats image frames correctly as `image_url` parts.
- [ ] Vision service adapts prompt when transcription is null (silent video).
- [ ] Vision service throws `VisionAnalysisError` when OpenRouter returns 429 or 5xx.
