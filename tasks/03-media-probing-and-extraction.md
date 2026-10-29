# Task 03: Media Probing & Extraction (FFprobe & FFmpeg)

## Objective

Implement zero-mock media inspection and extraction services using real native `ffprobe` and `ffmpeg` CLI subproccesses with synthetic 5-second video fixtures.

## Requirements

- `mediaProbe.ts`:
  - `hasAudioStream(filePath: string): Promise<boolean>`
  - Executes `ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 <file>`.
  - Returns `true` if audio stream detected, `false` if empty.
  - Throws typed `MediaProbeError` on corrupt or unreadable files.
- `mediaExtractor.ts`:
  - `extractAudio(videoPath: string, outputPath: string): Promise<string>`
    - Downmix to mono 16kHz MP3 (`-vn -acodec libmp3lame -ar 16000 -ac 1`).
  - `extractFrames(videoPath: string, outputDir: string, fps: string): Promise<string[]>`
    - Dynamic frame extraction (`-vf "fps=${fps}" frames_%04d.jpg`).
    - Returns ordered list of generated image file paths.
  - Proper error handling: throws `MediaExtractionError` with stderr details when FFmpeg fails.

## Tests to Implement (`src/__tests__/media.spec.ts`)

- Fixtures generated before tests using `ffmpeg` synthetic generation:
  - `video_with_audio_5s.mp4` (sine wave audio + testsrc video).
  - `video_silent_5s.mp4` (testsrc video only, no audio stream).
  - `corrupt_video.mp4` (truncated dummy bytes).
- [ ] `hasAudioStream` returns `true` for `video_with_audio_5s.mp4`.
- [ ] `hasAudioStream` returns `false` for `video_silent_5s.mp4`.
- [ ] `hasAudioStream` throws `MediaProbeError` for `corrupt_video.mp4`.
- [ ] `extractAudio` generates playable mono MP3 file from video with audio.
- [ ] `extractFrames` with `fps = "1/1.5"` generates 3 to 4 JPEG files.
- [ ] `extractFrames` with `fps = "1"` generates 5 JPEG files.
- [ ] Extraction on corrupt file throws error without leaving unmanaged orphan processes.
