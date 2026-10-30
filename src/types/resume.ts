export enum ResumeStatus {
  Created = "created",
  InProgress = "in_progress",
  Processed = "processed",
  Sent = "sent",
  Failed = "failed",
}

export interface RawResumeEntity {
  id: number;

  telegram_id: string;

  video_url: string;

  status: ResumeStatus;

  has_audio?: boolean | null;

  transcription: string | null;

  content: string | null;

  error_message?: string | null;

  delivery_attempts: number;

  next_delivery_retry_at?: Date | null;

  delivered_at?: Date | null;

  locked_at?: Date | null;
}

export interface ResumeEntityDTO {
  id: number;

  telegramId: string;

  videoUrl: string;

  status: ResumeStatus;

  hasAudio?: boolean | null;

  transcription: string | null;

  content: string | null;

  errorMessage?: string | null;

  deliveryAttempts: number;

  nextDeliveryRetryAt?: Date | null;

  deliveredAt?: Date | null;

  lockedAt?: Date | null;
}
