import { Column, Entity } from "typeorm";
import { ResumeStatus } from "../../types/resume.js";
import { CoreEntity } from "./CoreEntity.js";

@Entity("resumes")
export class ResumeEntity extends CoreEntity {
  @Column({
    type: "text",
    name: "telegram_id",
    nullable: false,
  })
  telegramId!: string;

  @Column({
    type: "text",
    name: "video_url",
    nullable: false,
  })
  videoUrl!: string;

  @Column({
    enum: ResumeStatus,
    type: "simple-enum",
    default: ResumeStatus.Created,
  })
  status!: ResumeStatus;

  @Column({
    type: "boolean",
    name: "has_audio",
    nullable: true,
    default: false,
  })
  hasAudio!: boolean | null;

  @Column({
    type: "text",
    nullable: true,
  })
  transcription!: string | null;

  @Column({
    type: "text",
    nullable: true,
  })
  content!: string | null;

  @Column({
    type: "text",
    name: "error_message",
    nullable: true,
  })
  errorMessage!: string | null;

  @Column({
    type: "integer",
    name: "delivery_attempts",
    default: 0,
  })
  deliveryAttempts!: number;

  @Column({
    type: "datetime",
    name: "next_delivery_retry_at",
    nullable: true,
  })
  nextDeliveryRetryAt!: Date | null;

  @Column({
    type: "datetime",
    name: "delivered_at",
    nullable: true,
  })
  deliveredAt!: Date | null;

  @Column({
    type: "datetime",
    name: "locked_at",
    nullable: true,
  })
  lockedAt!: Date | null;
}
