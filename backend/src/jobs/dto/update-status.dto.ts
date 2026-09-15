import { IsEnum } from 'class-validator';
import { JobStatus } from '../job-status.enum';

export class UpdateStatusDto {
  @IsEnum(JobStatus, {
    message: `status must be one of: ${Object.values(JobStatus).join(', ')}`,
  })
  status: JobStatus;
}
