import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { Job } from './job.entity';
import { JobStatus, isValidTransition } from './job-status.enum';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobsRepository.create({
      title: dto.title.trim(),
      type: dto.type.trim(),
      status: JobStatus.PENDING,
    });
    return this.jobsRepository.save(job);
  }

  async findAll(status?: JobStatus): Promise<Job[]> {
    return this.jobsRepository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOneOrFail(id: string): Promise<Job> {
    const job = await this.jobsRepository.findOneBy({ id });
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  /**
   * Updates a job's status, enforcing the pending -> running -> completed|failed
   * state machine and staying correct under concurrent requests.
   *
   * Concurrency strategy
   * ---------------------
   * The naive approach - "read the job, check the transition is legal in
   * application code, then write the new status" - has a race: two requests
   * (e.g. two browser tabs) can both read the job as `pending`, both decide
   * `pending -> running` is legal, and both write `running`. Nothing is
   * corrupted, but the "job started twice" bug is exactly the kind of
   * invalid/inconsistent state this exercise asks us to prevent, and it's
   * invisible to a naive test because both requests "succeed".
   *
   * The fix is to make the state check part of the same atomic operation as
   * the write, instead of two separate steps with a gap in between. We issue
   * a single conditional UPDATE:
   *
   *   UPDATE jobs SET status = :next WHERE id = :id AND status = :expected
   *
   * A relational database guarantees this single statement is atomic: even
   * if two of these run at the same instant against the same row, the
   * database serializes them internally. Whichever one runs first flips the
   * row's status; the second one's WHERE clause no longer matches (status is
   * no longer :expected), so it updates zero rows. We only have to check
   * `affected === 0` afterwards to know we lost the race - no explicit
   * row-level locking, transactions, or app-level mutex required, and this
   * holds for every process/pod talking to the same database, not just
   * within one Node process. It works the same way on SQLite and Postgres.
   *
   * This also directly answers "what if someone bypasses the React app and
   * calls the API directly?" - the rule lives here, in the service, not in
   * the UI, so it's enforced no matter what client makes the request.
   */
  async updateStatus(id: string, nextStatus: JobStatus): Promise<Job> {
    const job = await this.findOneOrFail(id);

    if (!isValidTransition(job.status, nextStatus)) {
      throw new BadRequestException(
        `Cannot transition job from '${job.status}' to '${nextStatus}'. ` +
          `Allowed path: pending -> running -> completed|failed.`,
      );
    }

    const result = await this.jobsRepository.update(
      { id: job.id, status: job.status },
      { status: nextStatus },
    );

    if (result.affected === 0) {
      // The status we validated against no longer holds - another request
      // changed it between our read and our write. Rather than silently
      // overwrite, surface this as a conflict so the client can refetch and
      // decide what to do (usually: reload the job and let the user retry).
      throw new ConflictException(
        `Job ${id} was modified by another request. Refresh and try again.`,
      );
    }

    return this.findOneOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.jobsRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Job ${id} not found`);
    }
  }

  async countsByStatus(): Promise<Record<JobStatus, number>> {
    const rows = await this.jobsRepository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany<{ status: JobStatus; count: string }>();

    const counts: Record<JobStatus, number> = {
      [JobStatus.PENDING]: 0,
      [JobStatus.RUNNING]: 0,
      [JobStatus.COMPLETED]: 0,
      [JobStatus.FAILED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }
}
