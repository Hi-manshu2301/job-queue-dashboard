import { Controller, Get } from '@nestjs/common';

/**
 * A GET / that says what this API is and where to look next. Not part of
 * the assignment's spec, but without it a bare visit to the deployed API
 * URL (which is exactly what a reviewer clicking the submitted link will
 * do) returns a bare 404 that looks like the deployment is broken rather
 * than just "there's no UI at this route, try /jobs".
 */
@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: 'Job Queue Dashboard API',
      status: 'ok',
      endpoints: {
        'GET /jobs': 'list all jobs (supports ?status=pending|running|completed|failed)',
        'GET /jobs/counts': 'job counts grouped by status',
        'GET /jobs/:id': 'get one job',
        'POST /jobs': 'create a job, body: { title, type }',
        'PATCH /jobs/:id/status': 'update job status, body: { status }',
        'DELETE /jobs/:id': 'delete a job',
      },
      repo: 'https://github.com/Hi-manshu2301/job-queue-dashboard',
    };
  }
}
