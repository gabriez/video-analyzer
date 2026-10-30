import type { MigrationInterface, QueryRunner } from "typeorm";

export class CoreSchema1793339353588 implements MigrationInterface {
  name = "CoreSchema1793339353588";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "resumes" (
                "create_at" datetime NOT NULL DEFAULT (datetime('now')),
                "deleted_at" datetime,
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
                "telegram_id" text NOT NULL,
                "video_url" text NOT NULL,
                "status" varchar CHECK(
                    "status" IN (
                        'created',
                        'in_progress',
                        'processed',
                        'sent',
                        'failed'
                    )
                ) NOT NULL DEFAULT ('created'),
                "has_audio" boolean DEFAULT (0),
                "transcription" text,
                "content" text,
                "error_message" text,
                "delivery_attempts" integer NOT NULL DEFAULT (0),
                "next_delivery_retry_at" datetime,
                "delivered_at" datetime,
                "locked_at" datetime
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "resumes"
        `);
  }
}
