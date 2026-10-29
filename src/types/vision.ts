export interface VisionAnalysisOptions {
  transcription: string | null;
  framePaths: string[];
  apiKey?: string;
  model?: string;
}
