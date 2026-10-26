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
let pendingCsrf: Promise<string> | null = null;

/**
 * The CSRF token, asked once even when several requests start together:
 * concurrent asks used to set different cookies, failing all but the last.
 */
function fetchCsrf(): Promise<string> {
  pendingCsrf ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
    .then(async (res) => {
      csrfToken = ((await res.json()) as { token: string }).token;
      return csrfToken;
    })
    .finally(() => {
      pendingCsrf = null;
    });
  return pendingCsrf;
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * JSON client for `/api/v1`. Sends the session cookie and, on state-changing
 * requests, the CSRF header (refreshing the token once if it was rejected).
 */
export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: { text?: boolean } = {},
): Promise<T> {
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
  // Pages (e.g. a theme preview) come back as text.
  if (options.text && res.ok) return (await res.text()) as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new ApiError(
      (data as ProblemDetails | null) ?? { title: res.statusText || 'Error', status: res.status },
    );
  }
  return data as T;
}

/**
 * POST whose answer is a stream of JSON lines (such as the admin chat):
 * each line is passed to `onLine` as soon as it arrives.
 */
export async function apiStream<T>(
  path: string,
  body: unknown,
  onLine: (line: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const send = (token: string) =>
    fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: token },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  let res = await send(csrfToken ?? (await fetchCsrf()));
  if (res.status === 403) res = await send(await fetchCsrf());
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as ProblemDetails | null;
    throw new ApiError(data ?? { title: res.statusText || 'Error', status: res.status });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) onLine(JSON.parse(line) as T);
    }
  }
  if (buffer.trim()) onLine(JSON.parse(buffer) as T);
}

/**
 * Uploads a file to the media library (multipart, with the CSRF header), or
 * to another upload endpoint given as `path` (under `/api/v1`).
 * `onProgress` receives the fraction sent, from 0 to 1 (RF-MED-01).
 * `fields` are text fields sent with the file (plugin routes read them as
 * `file.fields`, plugin API 1.56).
 */
export async function uploadFile<T>(
  file: File,
  options: {
    onProgress?: (fraction: number) => void;
    path?: string;
    fields?: Record<string, string>;
  } = {},
): Promise<T> {
  const send = (token: string) =>
    new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      // XMLHttpRequest, because fetch does not report upload progress.
      const request = new XMLHttpRequest();
      request.open('POST', `/api/v1${options.path ?? '/media'}`);
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
      for (const [name, value] of Object.entries(options.fields ?? {})) form.append(name, value);
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
