import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto } from './dto/find-jobs.query.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Job } from './job.entity';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.jobsService.create(dto);
  }

  // GET /jobs            -> all jobs
  // GET /jobs?status=... -> jobs filtered by status (server-side filter,
  // provided so any API consumer can filter without pulling the whole
  // table; the bundled dashboard filters client-side for a snappier UI
  // since it already holds the full list in memory - see README).
  @Get()
  findAll(@Query() query: FindJobsQueryDto): Promise<Job[]> {
    return this.jobsService.findAll(query.status);
  }

  @Get('counts')
  counts() {
    return this.jobsService.countsByStatus();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Job> {
    return this.jobsService.findOneOrFail(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<Job> {
    return this.jobsService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.jobsService.remove(id);
  }
}
