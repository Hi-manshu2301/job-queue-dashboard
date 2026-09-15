import type { JobStatus } from '../types';

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}
