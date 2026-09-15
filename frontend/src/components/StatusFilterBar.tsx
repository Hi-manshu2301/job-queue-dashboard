import { ALL_STATUSES } from '../types';
import type { JobStatus } from '../types';

interface StatusFilterBarProps {
  activeFilter: JobStatus | 'all';
  onChange: (filter: JobStatus | 'all') => void;
  counts: Record<JobStatus, number>;
  total: number;
}

export function StatusFilterBar({ activeFilter, onChange, counts, total }: StatusFilterBarProps) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter jobs by status">
      <FilterChip
        label="All"
        count={total}
        isActive={activeFilter === 'all'}
        onClick={() => onChange('all')}
      />
      {ALL_STATUSES.map((status) => (
        <FilterChip
          key={status}
          label={status}
          count={counts[status]}
          isActive={activeFilter === status}
          onClick={() => onChange(status)}
          statusClass={`status-${status}`}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  count,
  isActive,
  onClick,
  statusClass,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  statusClass?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`filter-chip ${statusClass ?? ''} ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="filter-chip-label">{label}</span>
      <span className="filter-chip-count">{count}</span>
    </button>
  );
}
