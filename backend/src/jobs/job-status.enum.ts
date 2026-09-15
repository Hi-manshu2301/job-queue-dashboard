export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Allowed forward transitions for a job's lifecycle:
 *
 *   pending -> running -> completed
 *                      \-> failed
 *
 * completed and failed are terminal: nothing can leave them, and in
 * particular a completed/failed job can never go back to running.
 * This map is the single source of truth for the state machine and is
 * enforced server-side in JobsService, independent of anything the UI does.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.RUNNING],
  [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [],
};

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
