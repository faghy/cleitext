import { CSRF_HEADER, type ProblemDetails } from '@cleitext/shared';

/** Error returned by the API as RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
  }

  get status(): number {
    return this.problem.status;
  }

  /** Message for a given field, from validation errors. */
  fieldError(path: string): string | undefined {
    return this.problem.errors?.find((e) => e.path === path)?.message;
  }
}

let csrfToken: string | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  csrfToken = ((await res.json()) as { token: string }).token;
  return csrfToken;
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * JSON client for `/api/v1`. Sends the session cookie and, on state-changing
 * requests, the CSRF header (refreshing the token once if it was rejected).
 */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const send = async (token: string | null) =>
    fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' && token ? { [CSRF_HEADER]: token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let res = await send(method === 'GET' ? null : (csrfToken ?? (await fetchCsrf())));
  if (res.status === 403 && method !== 'GET') {
    const problem = (await res
      .clone()
      .json()
      .catch(() => null)) as ProblemDetails | null;
    if (problem?.detail?.includes('CSRF')) res = await send(await fetchCsrf());
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new ApiError(
      (data as ProblemDetails | null) ?? { title: res.statusText || 'Error', status: res.status },
    );
  }
  return data as T;
}

/**
 * Uploads a file to the media library (multipart, with the CSRF header).
 * `onProgress` receives the fraction sent, from 0 to 1 (RF-MED-01).
 */
export async function uploadFile<T>(
  file: File,
  options: { onProgress?: (fraction: number) => void } = {},
): Promise<T> {
  const send = (token: string) =>
    new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      // XMLHttpRequest, because fetch does not report upload progress.
      const request = new XMLHttpRequest();
      request.open('POST', '/api/v1/media');
      request.withCredentials = true;
      request.setRequestHeader(CSRF_HEADER, token);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
      };
      request.onload = () => {
        let data: unknown = null;
        try {
          data = JSON.parse(request.responseText);
        } catch {
          // Not JSON: a generic problem is reported below.
        }
        resolve({ status: request.status, data });
      };
      request.onerror = () => reject(new TypeError('Network error'));
      const form = new FormData();
      form.append('file', file);
      request.send(form);
    });
  let res = await send(csrfToken ?? (await fetchCsrf()));
  if (res.status === 403) res = await send(await fetchCsrf());
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(
      (res.data as ProblemDetails | null) ?? { title: 'Upload failed', status: res.status },
    );
  }
  options.onProgress?.(1);
  return res.data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Check your connection and try again.';
}

/** Client for a plugin's own endpoints, under `/api/v1/ext/<slug>`. */
export function pluginApi(slug: string) {
  return <T>(method: Method, path: string, body?: unknown): Promise<T> =>
    api<T>(method, `/ext/${slug}${path.startsWith('/') ? path : `/${path}`}`, body);
}
