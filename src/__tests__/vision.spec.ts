import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeVideoContext, VisionAnalysisError } from "../services/visionService.js";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    OpenAI: class {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe("Vision Multimodal Service (OpenRouter / Gemini Flash)", () => {
  let tempDir: string;
  let frame1Path: string;
  let frame2Path: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vision-test-"));
    frame1Path = path.join(tempDir, "frame_0001.jpg");
    frame2Path = path.join(tempDir, "frame_0002.jpg");

    fs.writeFileSync(frame1Path, Buffer.from("fake-jpg-data-1"));
    fs.writeFileSync(frame2Path, Buffer.from("fake-jpg-data-2"));
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should format image frames correctly as base64 image_url parts and include transcription", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "## Video Summary\n- Point 1\n- Point 2",
          },
        },
      ],
    });

    const result = await analyzeVideoContext({
      transcription: "This is a video tutorial about baking cookies.",
      framePaths: [frame1Path, frame2Path],
      apiKey: "sk-or-test-key",
      model: "google/gemini-2.5-flash",
    });

    expect(result).toBe("## Video Summary\n- Point 1\n- Point 2");
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("google/gemini-2.5-flash");

    // Inspect user content message
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(Array.isArray(userMessage.content)).toBe(true);

    const textPart = userMessage.content.find((p: { type: string }) => p.type === "text");
    expect(textPart.text).toContain("This is a video tutorial about baking cookies.");

    const imageParts = userMessage.content.filter((p: { type: string }) => p.type === "image_url");
    expect(imageParts.length).toBe(2);
    expect(imageParts[0].image_url.url).toContain("data:image/jpeg;base64,");
  });

  it("should adapt prompt when transcription is null (silent video)", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Visual summary of silent video.",
          },
        },
      ],
    });

    const result = await analyzeVideoContext({
      transcription: null,
      framePaths: [frame1Path],
      apiKey: "sk-or-test-key",
      model: "google/gemini-2.5-flash",
    });

    expect(result).toBe("Visual summary of silent video.");

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    const textPart = userMessage.content.find((p: { type: string }) => p.type === "text");
    expect(textPart.text.toLowerCase()).toContain("no audio");
  });

  it("should throw VisionAnalysisError when OpenRouter returns 429 or 5xx", async () => {
    mockCreate.mockRejectedValueOnce(new Error("429 Too Many Requests: Rate limit exceeded"));

    await expect(
      analyzeVideoContext({
        transcription: "some text",
        framePaths: [frame1Path],
        apiKey: "sk-or-test-key",
      }),
    ).rejects.toThrowError(VisionAnalysisError);
  });

  it("should throw VisionAnalysisError when response choices are empty", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [],
    });

    await expect(
      analyzeVideoContext({
        transcription: "some text",
        framePaths: [frame1Path],
        apiKey: "sk-or-test-key",
      }),
    ).rejects.toThrowError(VisionAnalysisError);
  });
});
