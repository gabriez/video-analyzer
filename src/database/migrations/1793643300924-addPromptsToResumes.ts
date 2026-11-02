import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromptsToResumes1793643300924 implements MigrationInterface {
  name = "AddPromptsToResumes1793643300924";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resumes" ADD COLUMN "original_prompt" text;`);
    await queryRunner.query(`ALTER TABLE "resumes" ADD COLUMN "analysis_prompt" text;`);
    await queryRunner.query(`ALTER TABLE "resumes" ADD COLUMN "storage_prompt" text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resumes" DROP COLUMN "storage_prompt";`);
    await queryRunner.query(`ALTER TABLE "resumes" DROP COLUMN "analysis_prompt";`);
    await queryRunner.query(`ALTER TABLE "resumes" DROP COLUMN "original_prompt";`);
  }
}
