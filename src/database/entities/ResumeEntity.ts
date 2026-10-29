import { Column, Entity } from "typeorm";
import { ResumeStatus } from "#types/resume.js";
import { CoreEntity } from "./CoreEntity.js";

@Entity()
export class ResumeEntity extends CoreEntity {
  @Column({
    type: "text",
  })
  content!: string;

  @Column({
    enum: ResumeStatus,
    type: "simple-enum",
    default: ResumeStatus.InProgress,
  })
  status!: ResumeStatus;

  @Column({
    type: "text",
    name: "telegram_id",
    nullable: false,
  })
  telegramId!: string;
}
