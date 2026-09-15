export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  version: number;
}

export const ALL_STATUSES: JobStatus[] = ['pending', 'running', 'completed', 'failed'];

/**
 * Mirrors the backend's state machine (see backend/src/jobs/job-status.enum.ts)
 * so the UI only offers buttons for transitions the API will actually accept.
 * This is a UX nicety, not the enforcement point - the server re-validates
 * every transition regardless of what the client sends.
 */
export const NEXT_STATUSES: Record<JobStatus, JobStatus[]> = {
  pending: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};
