import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { JobStatus } from './job-status.enum';

@Entity({ name: 'jobs' })
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: JobStatus.PENDING,
  })
  status: JobStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Optimistic-locking version column, bumped by TypeORM on every UPDATE.
   * Not required by the primary concurrency fix (the conditional UPDATE in
   * JobsService already makes status transitions atomic and race-free on
   * its own), but it gives a second, independent guard for any future code
   * path that updates a job's row without going through that helper.
   */
  @VersionColumn()
  version: number;
}
