import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TranscriptionError, transcribeAudio } from "../services/sttService.js";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    OpenAI: class {
      audio = {
        transcriptions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe("Speech-to-Text Service (Speaches / Whisper)", () => {
  let tempDir: string;
  let sampleAudioPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stt-test-"));
    sampleAudioPath = path.join(tempDir, "sample.mp3");
    fs.writeFileSync(sampleAudioPath, Buffer.from("dummy-audio-content"));
  });

  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockImplementation(async (params) => {
      if (params?.file && typeof params.file.destroy === "function") {
        params.file.destroy();
      }
      return { text: "mock transcript" };
    });
  });

  afterAll(async () => {
    // Small microtask tick to let any pending stream descriptors close
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should return transcribed text when audio has speech", async () => {
    mockCreate.mockImplementationOnce(async (params) => {
      if (params?.file?.destroy) params.file.destroy();
      return { text: "  Hello, this is a clear audio transcription test.  " };
    });

    const result = await transcribeAudio(sampleAudioPath, {
      whisperUrl: "http://localhost:8000/v1",
    });

    expect(result).toBe("Hello, this is a clear audio transcription test.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
      }),
    );
  });

  it("should return empty string when transcription is empty or whitespace", async () => {
    mockCreate.mockImplementationOnce(async (params) => {
      if (params?.file?.destroy) params.file.destroy();
      return { text: "     " };
    });

    const result = await transcribeAudio(sampleAudioPath, {
      whisperUrl: "http://localhost:8000/v1",
    });

    expect(result).toBe("");
  });

  it("should propagate TranscriptionError on network rejection or server failure", async () => {
    mockCreate.mockImplementationOnce(async (params) => {
      if (params?.file?.destroy) params.file.destroy();
      throw new Error("ECONNREFUSED: Connection refused to speaches:8000");
    });

    await expect(
      transcribeAudio(sampleAudioPath, {
        whisperUrl: "http://localhost:8000/v1",
      }),
    ).rejects.toThrowError(TranscriptionError);
  });

  it("should throw TranscriptionError when audio file does not exist", async () => {
    await expect(transcribeAudio("/tmp/non-existent-audio-file-xyz.mp3")).rejects.toThrowError(TranscriptionError);
  });
});
