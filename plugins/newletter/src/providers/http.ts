/** Requests to a service and the errors every adapter shares. */
import { ProviderError, type Http, type HttpRequest } from './types';

export interface JsonResponse {
  status: number;
  data: Record<string, unknown>;
}

function parse(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  } catch {
    return { text: text.slice(0, 500) };
  }
}

/** The service's own words for an error, short. */
export function messageOf(data: Record<string, unknown>): string {
  for (const key of ['message', 'detail', 'title', 'error', 'text']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300);
  }
  const errors = data.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as unknown;
    if (typeof first === 'string') return first.slice(0, 300);
    if (first && typeof first === 'object') {
      const m = messageOf(first as Record<string, unknown>);
      if (m) return m;
    }
  }
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const first = Object.values(errors as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0].slice(0, 300);
  }
  return '';
}

/**
 * Sends a request and reads its JSON answer. Network failures, a refused
 * key (401/403), too many requests (429) and the service's own failures
 * (5xx) throw; other statuses are returned for the adapter to read.
 */
export async function send(http: Http, request: HttpRequest): Promise<JsonResponse> {
  let status: number;
  let text: string;
  try {
    ({ status, text } = await http({
      ...request,
      headers: {
        accept: 'application/json',
        ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...request.headers,
      },
    }));
  } catch (error) {
    throw new ProviderError(
      'network',
      `The service could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const data = parse(text);
  if (status === 401 || status === 403)
    throw new ProviderError('invalid-key', messageOf(data) || 'The API key was refused.', status);
  if (status === 429)
    throw new ProviderError('rate-limit', 'The service is busy: try again later.', status);
  if (status >= 500)
    throw new ProviderError(
      'provider',
      messageOf(data) || `The service answered with an error (${status}).`,
      status,
    );
  return { status, data };
}

/** Throws the service's error for an unexpected status. */
export function fail(response: JsonResponse, fallback: string): never {
  throw new ProviderError(
    'provider',
    messageOf(response.data) || `${fallback} (${response.status}).`,
    response.status,
  );
}

export const arrayOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    : [];

export const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

export function requireKey(key: string): string {
  const k = key.trim();
  if (!k || /[\s\r\n]/.test(k)) throw new ProviderError('invalid-key', 'Enter a valid API key.');
  return k;
}
