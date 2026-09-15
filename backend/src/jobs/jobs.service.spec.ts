import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './job.entity';
import { JobStatus } from './job-status.enum';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        // Fresh in-memory SQLite database per test, isolated from the
        // real dev/prod database.
        TypeOrmModule.forRoot({
          type: 'sqljs',
          autoSave: false,
          entities: [Job],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Job]),
      ],
      providers: [JobsService],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('creates a job with pending status', async () => {
    const job = await service.create({ title: 'Send emails', type: 'email' });
    expect(job.status).toBe(JobStatus.PENDING);
    expect(job.id).toBeDefined();
    expect(job.createdAt).toBeInstanceOf(Date);
  });

  it('allows the happy path pending -> running -> completed', async () => {
    const job = await service.create({ title: 'Resize images', type: 'image' });
    const running = await service.updateStatus(job.id, JobStatus.RUNNING);
    expect(running.status).toBe(JobStatus.RUNNING);
    const completed = await service.updateStatus(job.id, JobStatus.COMPLETED);
    expect(completed.status).toBe(JobStatus.COMPLETED);
  });

  it('allows running -> failed', async () => {
    const job = await service.create({ title: 'Import CSV', type: 'import' });
    await service.updateStatus(job.id, JobStatus.RUNNING);
    const failed = await service.updateStatus(job.id, JobStatus.FAILED);
    expect(failed.status).toBe(JobStatus.FAILED);
  });

  it('rejects skipping straight from pending to completed', async () => {
    const job = await service.create({ title: 'Skip step', type: 'test' });
    await expect(service.updateStatus(job.id, JobStatus.COMPLETED)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects reviving a completed job back to running', async () => {
    const job = await service.create({ title: 'Finished job', type: 'test' });
    await service.updateStatus(job.id, JobStatus.RUNNING);
    await service.updateStatus(job.id, JobStatus.COMPLETED);

    await expect(service.updateStatus(job.id, JobStatus.RUNNING)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects reviving a failed job back to running', async () => {
    const job = await service.create({ title: 'Failed job', type: 'test' });
    await service.updateStatus(job.id, JobStatus.RUNNING);
    await service.updateStatus(job.id, JobStatus.FAILED);

    await expect(service.updateStatus(job.id, JobStatus.RUNNING)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException for an unknown job id', async () => {
    await expect(
      service.updateStatus('00000000-0000-0000-0000-000000000000', JobStatus.RUNNING),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a job', async () => {
    const job = await service.create({ title: 'Delete me', type: 'test' });
    await service.remove(job.id);
    await expect(service.findOneOrFail(job.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports per-status counts', async () => {
    const a = await service.create({ title: 'A', type: 'test' });
    await service.create({ title: 'B', type: 'test' });
    await service.updateStatus(a.id, JobStatus.RUNNING);

    const counts = await service.countsByStatus();
    expect(counts[JobStatus.PENDING]).toBe(1);
    expect(counts[JobStatus.RUNNING]).toBe(1);
    expect(counts[JobStatus.COMPLETED]).toBe(0);
    expect(counts[JobStatus.FAILED]).toBe(0);
  });

  /**
   * The scenario from the assignment: two browser tabs both see the job as
   * `pending` and both fire `PATCH /jobs/:id/status` with `running` at
   * "almost the same time". Exactly one of the two requests should win;
   * the other must fail loudly (409 Conflict) instead of silently
   * "succeeding" and leaving the job double-started.
   */
  it('lets only one of two concurrent pending->running requests win', async () => {
    const job = await service.create({ title: 'Race me', type: 'test' });

    const [first, second] = await Promise.allSettled([
      service.updateStatus(job.id, JobStatus.RUNNING),
      service.updateStatus(job.id, JobStatus.RUNNING),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === 'fulfilled');
    const rejected = [first, second].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const finalJob = await service.findOneOrFail(job.id);
    expect(finalJob.status).toBe(JobStatus.RUNNING);
  });
});
