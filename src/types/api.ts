export interface AnalyzeRequest {
  telegramId: string;
  url: string;
  originalPrompt?: string;
  analysisPrompt?: string;
  storagePrompt?: string;
}
