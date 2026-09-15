import { NEXT_STATUSES } from '../types';
import type { Job, JobStatus } from '../types';
import { StatusBadge } from './StatusBadge';

interface JobTableProps {
  jobs: Job[];
  pendingIds: Set<string>;
  onUpdateStatus: (id: string, status: JobStatus) => void;
  onDelete: (id: string) => void;
}

const STATUS_ACTION_LABEL: Record<JobStatus, string> = {
  pending: 'Start',
  running: 'Mark running',
  completed: 'Mark completed',
  failed: 'Mark failed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function JobTable({ jobs, pendingIds, onUpdateStatus, onDelete }: JobTableProps) {
  if (jobs.length === 0) {
    return <p className="empty-state">No jobs match this filter yet.</p>;
  }

  return (
    <div className="job-table-wrapper">
      <table className="job-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const isBusy = pendingIds.has(job.id);
            const nextStatuses = NEXT_STATUSES[job.status];
            return (
              <tr key={job.id}>
                <td data-label="Title">{job.title}</td>
                <td data-label="Type">{job.type}</td>
                <td data-label="Status">
                  <StatusBadge status={job.status} />
                </td>
                <td data-label="Created">{formatDate(job.createdAt)}</td>
                <td data-label="Actions" className="actions-cell">
                  {nextStatuses.map((next) => (
                    <button
                      key={next}
                      type="button"
                      className={`action-button status-${next}`}
                      disabled={isBusy}
                      onClick={() => onUpdateStatus(job.id, next)}
                    >
                      {STATUS_ACTION_LABEL[next]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="action-button danger"
                    disabled={isBusy}
                    onClick={() => onDelete(job.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
