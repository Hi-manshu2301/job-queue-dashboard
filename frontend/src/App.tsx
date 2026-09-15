import { useMemo, useState } from 'react';
import './App.css';
import { ErrorBanner } from './components/ErrorBanner';
import { JobForm } from './components/JobForm';
import { JobTable } from './components/JobTable';
import { StatusFilterBar } from './components/StatusFilterBar';
import { useJobs } from './hooks/useJobs';
import { ALL_STATUSES } from './types';
import type { JobStatus } from './types';

function App() {
  const { jobs, isLoading, error, pendingIds, createJob, updateStatus, deleteJob, dismissError } =
    useJobs();
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');

  // The full job list is already in memory, so filtering and counting are
  // done client-side (derived state) rather than round-tripping to the
  // server on every filter click. The API also supports `GET /jobs?status=`
  // for consumers that don't want to hold the whole list - see README.
  const counts = useMemo(() => {
    const initial: Record<JobStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const job of jobs) initial[job.status]++;
    return initial;
  }, [jobs]);

  const visibleJobs = useMemo(
    () => (filter === 'all' ? jobs : jobs.filter((j) => j.status === filter)),
    [jobs, filter],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Job Queue Dashboard</h1>
        <p className="subtitle">Create, track, and manage background jobs.</p>
      </header>

      {error && <ErrorBanner message={error} onDismiss={dismissError} />}

      <section className="card">
        <h2>New job</h2>
        <JobForm onCreate={createJob} />
      </section>

      <section className="card">
        <h2>Jobs</h2>
        <StatusFilterBar
          activeFilter={filter}
          onChange={setFilter}
          counts={counts}
          total={jobs.length}
        />

        {isLoading ? (
          <p className="loading-state">Loading jobs…</p>
        ) : (
          <JobTable
            jobs={visibleJobs}
            pendingIds={pendingIds}
            onUpdateStatus={updateStatus}
            onDelete={deleteJob}
          />
        )}
      </section>

      <footer className="app-footer">
        <p>
          Statuses: {ALL_STATUSES.join(' → ')} (pending → running → completed, or running →
          failed)
        </p>
      </footer>
    </div>
  );
}

export default App;
