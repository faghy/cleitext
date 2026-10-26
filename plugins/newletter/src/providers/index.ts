/** The services, by id, and the HTTP client they use on a site. */
import type { ProviderId } from '../model/types';
import { activeCampaign } from './activecampaign';
import { brevo } from './brevo';
import { kit } from './kit';
import { mailchimp } from './mailchimp';
import { mailerlite } from './mailerlite';
import type { Http, HttpRequest, Provider } from './types';

export const PROVIDER_IDS: ProviderId[] = [
  'brevo',
  'mailchimp',
  'mailerlite',
  'kit',
  'activecampaign',
];

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);

export function providerOf(id: ProviderId, http: Http): Provider {
  switch (id) {
    case 'brevo':
      return brevo(http);
    case 'mailchimp':
      return mailchimp(http);
    case 'mailerlite':
      return mailerlite(http);
    case 'kit':
      return kit(http);
    case 'activecampaign':
      return activeCampaign(http);
  }
}

/**
 * A local test endpoint, when the environment names one (tests only): http
 * on the loopback address, nothing else.
 */
export function testEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** The request as the test endpoint gets it: `<base>/<host><path>`. */
export function redirectToTest(base: string, request: HttpRequest): HttpRequest {
  const url = new URL(request.url);
  return { ...request, url: `${base}/${url.host}${url.pathname}${url.search}` };
}

/**
 * An `Http` over the core's `ctx.http` (public https only), or straight to
 * the test endpoint with `fetch`.
 */
export function siteHttp(
  send: (request: {
    url: string;
    method: HttpRequest['method'];
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }) => Promise<{ status: number; text: string }>,
  testBase: string | null,
): Http {
  if (testBase)
    return async (request) => {
      const r = redirectToTest(testBase, request);
      const res = await fetch(r.url, {
        method: r.method,
        headers: r.headers,
        ...(r.body !== undefined ? { body: r.body } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      return { status: res.status, text: await res.text() };
    };
  return async (request) => {
    const res = await send({ ...request, timeoutMs: 15_000 });
    return { status: res.status, text: res.text };
  };
}
