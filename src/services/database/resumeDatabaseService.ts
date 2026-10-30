import type { DataSource, Repository } from "typeorm";

import AppDataSource from "../../database/appDataSource.js";
import { ResumeEntity } from "../../database/entities/ResumeEntity.js";
import type { CreateResumeData, IResumeDatabaseService, MarkProcessedData } from "../../types/database.js";
import { type RawResumeEntity, type ResumeEntityDTO, ResumeStatus } from "../../types/resume.js";

/**
 * Service handling all database operations for ResumeEntity.
 * Injected into controllers and workers to avoid multiple DataSource instances
 * and decouple business logic from TypeORM queries.
 */
export class ResumeDatabaseService implements IResumeDatabaseService {
  private readonly repository: Repository<ResumeEntity>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(ResumeEntity);
    this.dataSource = dataSource;
  }

  /**
   * Persists a newly queued analysis job.
   */
  async createAndSave(data: CreateResumeData): Promise<ResumeEntity> {
    const entity = this.repository.create({
      telegramId: data.telegramId,
      videoUrl: data.videoUrl,
      status: ResumeStatus.Created,
    });
    return await this.repository.save(entity);
  }

  /**
   * Claims the next pending job atomically using lock logic.
   * NOTE (Gabriel): Skeleton left here for custom atomic locking implementation.
   */
  async claimNextPending(): Promise<ResumeEntityDTO | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    // En SQLite WAL mode, BEGIN IMMEDIATE bloquea escrituras concurrentes de inmediato
    await queryRunner.query("BEGIN IMMEDIATE;");
    try {
      const rows = (await queryRunner.query("SELECT * FROM resumes WHERE status = 'created' ORDER BY create_at ASC LIMIT 1;")) as RawResumeEntity[];

      if (!rows || rows.length === 0) {
        await queryRunner.query("COMMIT;");
        return null;
      }

      const row = rows[0];
      if (!row) {
        await queryRunner.query("COMMIT;");
        return null;
      }

      await queryRunner.query("UPDATE resumes SET status = 'in_progress', locked_at = CURRENT_TIMESTAMP WHERE id = ?;", [row.id]);
      await queryRunner.query("COMMIT;");

      return toResumeDTO({
        ...row,
        status: ResumeStatus.InProgress,
        locked_at: new Date(),
      });
    } catch (err) {
      await queryRunner.query("ROLLBACK;");
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Updates job after media processing and AI vision synthesis are complete.
   */
  async markProcessed(id: number, data: MarkProcessedData): Promise<ResumeEntity> {
    const job = await this.findById(id);
    if (!job) {
      throw new Error(`ResumeEntity with id ${id} not found`);
    }

    job.content = data.content;
    job.transcription = data.transcription;
    job.hasAudio = data.hasAudio;
    job.status = ResumeStatus.Processed;

    return await this.repository.save(job);
  }

  /**
   * Updates job to sent status when webhook delivery succeeds.
   */
  async markSent(id: number, deliveredAt: Date): Promise<ResumeEntity> {
    const job = await this.findById(id);
    if (!job) {
      throw new Error(`ResumeEntity with id ${id} not found`);
    }

    job.status = ResumeStatus.Sent;
    job.deliveredAt = deliveredAt;

    return await this.repository.save(job);
  }

  /**
   * Updates job to failed status and stores the error message.
   */
  async markFailed(id: number, errorMessage: string): Promise<ResumeEntity> {
    const job = await this.findById(id);
    if (!job) {
      throw new Error(`ResumeEntity with id ${id} not found`);
    }

    job.status = ResumeStatus.Failed;
    job.errorMessage = errorMessage;

    return await this.repository.save(job);
  }

  /**
   * Records a webhook delivery failure and sets the next scheduled retry date.
   */
  async recordDeliveryFailure(id: number, nextRetryAt: Date): Promise<ResumeEntity> {
    const job = await this.findById(id);
    if (!job) {
      throw new Error(`ResumeEntity with id ${id} not found`);
    }

    job.deliveryAttempts = (job.deliveryAttempts ?? 0) + 1;
    job.nextDeliveryRetryAt = nextRetryAt;

    return await this.repository.save(job);
  }

  /**
   * Finds a job by its primary key ID.
   */
  async findById(id: number): Promise<ResumeEntity | null> {
    return await this.repository.findOneBy({ id });
  }

  /**
   * Counts currently pending (in_progress) jobs.
   */
  async countPending(): Promise<number> {
    return await this.repository.countBy({ status: ResumeStatus.InProgress });
  }

  /**
   * Clears the resumes table (used in test fixtures).
   */
  async clear(): Promise<void> {
    await this.repository.clear();
  }
}

let defaultResumeDatabaseService: ResumeDatabaseService | null = null;

export function getResumeDatabaseService(dataSource: DataSource = AppDataSource): ResumeDatabaseService {
  if (!defaultResumeDatabaseService) {
    defaultResumeDatabaseService = new ResumeDatabaseService(dataSource);
  }
  return defaultResumeDatabaseService;
}

export function toResumeDTO(entity: ResumeEntity | RawResumeEntity): ResumeEntityDTO {
  const e = entity as unknown as Record<string, unknown>;
  return {
    id: Number(e.id),
    content: (e.content as string | null) ?? null,
    deliveryAttempts: Number(e.deliveryAttempts ?? e.delivery_attempts ?? 0),
    status: e.status as ResumeStatus,
    telegramId: String(e.telegramId ?? e.telegram_id ?? ""),
    transcription: (e.transcription as string | null) ?? null,
    videoUrl: String(e.videoUrl ?? e.video_url ?? ""),
    deliveredAt: (e.deliveredAt as Date | null) ?? (e.delivered_at as Date | null) ?? null,
    errorMessage: (e.errorMessage as string | null) ?? (e.error_message as string | null) ?? null,
    hasAudio: (e.hasAudio as boolean | null) ?? (e.has_audio as boolean | null) ?? false,
    lockedAt: (e.lockedAt as Date | null) ?? (e.locked_at as Date | null) ?? null,
    nextDeliveryRetryAt: (e.nextDeliveryRetryAt as Date | null) ?? (e.next_delivery_retry_at as Date | null) ?? null,
  };
}

export const fromSqlToEntity = toResumeDTO;
