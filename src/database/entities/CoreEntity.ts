import { BaseEntity, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export abstract class CoreEntity extends BaseEntity {
  @CreateDateColumn()
  create_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date | null;

  @PrimaryGeneratedColumn()
  id!: number;

  @UpdateDateColumn()
  updated_at!: Date;
}
