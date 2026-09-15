import type { Job, JobStatus } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface BackendErrorBody {
  statusCode?: number;
  message?: string | string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Could not reach the server. Check your connection and that the API is running.',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? ((await response.json()) as BackendErrorBody & T) : null;

  if (!response.ok) {
    const message = body?.message;
    const text = Array.isArray(message) ? message.join(', ') : (message ?? response.statusText);
    throw new ApiError(text, response.status);
  }

  return body as T;
}

export const api = {
  listJobs: () => request<Job[]>('/jobs'),

  createJob: (data: { title: string; type: string }) =>
    request<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),

  updateJobStatus: (id: string, status: JobStatus) =>
    request<Job>(`/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteJob: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
};
