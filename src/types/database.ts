import type { ResumeEntity } from "../database/entities/ResumeEntity.js";

export interface CreateResumeData {
  telegramId: string;
  videoUrl: string;
}

export interface MarkProcessedData {
  content: string;
  transcription: string | null;
  hasAudio: boolean;
}

export interface IResumeDatabaseService {
  createAndSave(data: CreateResumeData): Promise<ResumeEntity>;
  claimNextPending(): Promise<ResumeEntity | null>;
  markProcessed(id: number, data: MarkProcessedData): Promise<ResumeEntity>;
  markSent(id: number, deliveredAt: Date): Promise<ResumeEntity>;
  markFailed(id: number, errorMessage: string): Promise<ResumeEntity>;
  recordDeliveryFailure(id: number, nextRetryAt: Date): Promise<ResumeEntity>;
  findById(id: number): Promise<ResumeEntity | null>;
  countPending(): Promise<number>;
  clear(): Promise<void>;
}
