import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Job, JobStatus } from '../types';

interface UseJobsResult {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  /** ids currently mid-mutation (status change / delete), for per-row disabling */
  pendingIds: Set<string>;
  refresh: () => Promise<void>;
  createJob: (title: string, type: string) => Promise<boolean>;
  updateStatus: (id: string, status: JobStatus) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  dismissError: () => void;
}

export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const setPending = (id: string, isPending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createJob = useCallback(
    async (title: string, type: string): Promise<boolean> => {
      setError(null);
      try {
        const job = await api.createJob({ title, type });
        setJobs((prev) => [job, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to create job.');
        return false;
      }
    },
    [],
  );

  const updateStatus = useCallback(async (id: string, status: JobStatus) => {
    setError(null);
    setPending(id, true);
    try {
      const updated = await api.updateJobStatus(id, status);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    } catch (err) {
      // A 400 (invalid transition) or 409 (lost a race to another request/tab)
      // both mean our local copy of this job is stale. Re-sync the whole
      // list from the server so the UI reflects reality instead of silently
      // pretending the change happened.
      setError(err instanceof ApiError ? err.message : 'Failed to update job status.');
      await refresh();
    } finally {
      setPending(id, false);
    }
  }, [refresh]);

  const deleteJob = useCallback(async (id: string) => {
    setError(null);
    setPending(id, true);
    try {
      await api.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete job.');
      await refresh();
    } finally {
      setPending(id, false);
    }
  }, [refresh]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    jobs,
    isLoading,
    error,
    pendingIds,
    refresh,
    createJob,
    updateStatus,
    deleteJob,
    dismissError,
  };
}
