import type { DataSource, Repository } from "typeorm";

import AppDataSource from "../../database/appDataSource.js";
import { ResumeEntity } from "../../database/entities/ResumeEntity.js";
import type { CreateResumeData, IResumeDatabaseService, MarkProcessedData } from "../../types/database.js";
import { ResumeStatus } from "../../types/resume.js";

/**
 * Service handling all database operations for ResumeEntity.
 * Injected into controllers and workers to avoid multiple DataSource instances
 * and decouple business logic from TypeORM queries.
 */
export class ResumeDatabaseService implements IResumeDatabaseService {
  private readonly repository: Repository<ResumeEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(ResumeEntity);
  }

  /**
   * Persists a newly queued analysis job.
   */
  async createAndSave(data: CreateResumeData): Promise<ResumeEntity> {
    const entity = this.repository.create({
      telegramId: data.telegramId,
      videoUrl: data.videoUrl,
      status: ResumeStatus.InProgress,
    });
    return await this.repository.save(entity);
  }

  /**
   * Claims the next pending job atomically using lock logic.
   * NOTE (Gabriel): Skeleton left here for custom atomic locking implementation.
   */
  async claimNextPending(): Promise<ResumeEntity | null> {
    // TODO (Gabriel): Implement your custom lock logic here.
    // Example: queryRunner transaction, atomic UPDATE ... RETURNING, or custom SQLite mutex lock.
    throw new Error("claimNextPending() lock logic is not yet implemented by Gabriel.");
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
