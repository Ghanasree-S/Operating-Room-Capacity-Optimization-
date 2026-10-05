import {
  PlanRequest,
  PlanResponse,
  PlannerDefaults,
  CsvInspection,
  CsvProcessResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export class PlannerApiError extends Error {
  /** True when the backend could not be reached at all, as opposed to
   *  returning an error response — the UI shows start-up instructions for
   *  this case rather than a generic failure message. */
  readonly isConnectionError: boolean;

  constructor(message: string, isConnectionError = false) {
    super(message);
    this.name = 'PlannerApiError';
    this.isConnectionError = isConnectionError;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PlannerApiError(
      'Cannot reach the planner API. Is the Python backend running?',
      true
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new PlannerApiError(
      `Planner API returned ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchDefaults(): Promise<PlannerDefaults> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/defaults`);
  } catch {
    throw new PlannerApiError(
      'Cannot reach the planner API. Is the Python backend running?',
      true
    );
  }
  if (!response.ok) {
    throw new PlannerApiError(`Planner API returned ${response.status}`);
  }
  return response.json() as Promise<PlannerDefaults>;
}

export function requestPlan(request: PlanRequest): Promise<PlanResponse> {
  return postJson<PlanResponse>('/api/plan', request);
}

/** Multipart POST. Content-Type is deliberately left unset so the browser
 *  adds the multipart boundary itself. */
async function postForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form });
  } catch {
    throw new PlannerApiError(
      'Cannot reach the planner API. Is the Python backend running?',
      true
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new PlannerApiError(detail || `Upload failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function inspectCsv(file: File): Promise<CsvInspection> {
  const form = new FormData();
  form.append('file', file);
  return postForm<CsvInspection>('/api/upload/inspect', form);
}

export function processCsv(
  file: File,
  mapping: Record<string, string | null>,
  weeksCovered: number | null
): Promise<CsvProcessResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('mapping', JSON.stringify(mapping));
  if (weeksCovered !== null && !Number.isNaN(weeksCovered)) {
    form.append('weeks_covered', String(weeksCovered));
  }
  return postForm<CsvProcessResult>('/api/upload/process', form);
}
