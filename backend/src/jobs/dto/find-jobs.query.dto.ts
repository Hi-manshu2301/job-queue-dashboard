import { IsEnum, IsOptional } from 'class-validator';
import { JobStatus } from '../job-status.enum';

export class FindJobsQueryDto {
  @IsOptional()
  @IsEnum(JobStatus, {
    message: `status must be one of: ${Object.values(JobStatus).join(', ')}`,
  })
  status?: JobStatus;
}
