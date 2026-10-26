/**
 * Brevo (formerly Sendinblue), API v3: https://developers.brevo.com/reference.
 * The key goes in the `api-key` header. Double opt-in uses Brevo's own
 * flow: a DOI template (its id) and the page the confirmation link leads to.
 * Brevo has no tags on contacts.
 */
import { arrayOf, fail, requireKey, send, str } from './http';
import { ProviderError, type Http, type Provider, type ProviderField } from './types';

const BASE = 'https://api.brevo.com/v3';

const listIds = (ids: string[]): number[] => {
  const out = ids.map((id) => Number(id.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (out.length !== ids.length)
    throw new ProviderError('invalid-list', 'A Brevo list id is not valid.');
  return out;
};

function fieldType(type: string): ProviderField['type'] {
  if (type === 'text') return 'text';
  if (type === 'float') return 'number';
  if (type === 'date') return 'date';
  return 'other';
}

export function brevo(http: Http): Provider {
  const headers = (key: string) => ({ 'api-key': requireKey(key) });
  return {
    id: 'brevo',
    name: 'Brevo',
    tags: false,
    needsUrl: false,
    async verify({ key }) {
      const res = await send(http, {
        url: `${BASE}/account`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'Brevo did not accept the key');
      const company = str(res.data.companyName);
      return { name: company || str(res.data.email) || 'Brevo' };
    },
    async lists({ key }) {
      const out = [];
      for (let offset = 0; offset < 1000; offset += 50) {
        const res = await send(http, {
          url: `${BASE}/contacts/lists?limit=50&offset=${offset}&sort=desc`,
          method: 'GET',
          headers: headers(key),
        });
        if (res.status !== 200) fail(res, 'Brevo did not give the lists');
        const page = arrayOf(res.data.lists);
        out.push(
          ...page.map((l) => ({
            id: str(l.id),
            name: str(l.name),
            ...(typeof l.totalSubscribers === 'number' ? { count: l.totalSubscribers } : {}),
          })),
        );
        if (page.length < 50) break;
      }
      return out;
    },
    async fields({ key }) {
      const res = await send(http, {
        url: `${BASE}/contacts/attributes`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'Brevo did not give the fields');
      return arrayOf(res.data.attributes)
        .filter((a) => a.category === 'normal' && str(a.name))
        .map((a) => ({ key: str(a.name), label: str(a.name), type: fieldType(str(a.type)) }));
    },
    async subscribe({ key }, input) {
      const ids = listIds(input.listIds);
      if (ids.length === 0) throw new ProviderError('invalid-list', 'Choose a Brevo list.');
      const attributes: Record<string, string> = { ...input.fields };
      if (input.firstName && !('FIRSTNAME' in attributes)) attributes.FIRSTNAME = input.firstName;
      if (input.lastName && !('LASTNAME' in attributes)) attributes.LASTNAME = input.lastName;
      const notes = input.tags.length ? ['Brevo has no tags: they were not sent.'] : [];
      const email = input.email;

      // Already on every list (and not unsubscribed): nothing to do.
      const found = await send(http, {
        url: `${BASE}/contacts/${encodeURIComponent(email)}`,
        method: 'GET',
        headers: headers(key),
      });
      if (found.status === 200) {
        const on = new Set(
          (Array.isArray(found.data.listIds) ? found.data.listIds : []).map(Number),
        );
        if (found.data.emailBlacklisted !== true && ids.every((id) => on.has(id)))
          return { status: 'already', notes };
      }

      if (input.doubleOptIn) {
        const templateId = Number(input.doi?.templateId);
        const redirectionUrl = input.doi?.redirectUrl ?? '';
        if (!Number.isInteger(templateId) || templateId <= 0 || !/^https:\/\//.test(redirectionUrl))
          throw new ProviderError(
            'config',
            'Brevo double opt-in needs the id of a DOI template and the https address of the confirmation page.',
          );
        const res = await send(http, {
          url: `${BASE}/contacts/doubleOptinConfirmation`,
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify({
            email,
            attributes,
            includeListIds: ids,
            templateId,
            redirectionUrl,
          }),
        });
        if (res.status === 201 || res.status === 204) return { status: 'pending', notes };
        throw brevoError(res.status, res.data);
      }

      const res = await send(http, {
        url: `${BASE}/contacts`,
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({ email, attributes, listIds: ids, updateEnabled: true }),
      });
      if (res.status === 201) return { status: 'subscribed', notes };
      // 204: the contact existed and was updated, now on the lists.
      if (res.status === 204)
        return { status: found.status === 200 ? 'already' : 'subscribed', notes };
      throw brevoError(res.status, res.data);
    },
  };
}

function brevoError(status: number, data: Record<string, unknown>): ProviderError {
  const message = str(data.message) || `Brevo answered with an error (${status}).`;
  if (/email/i.test(message) && /invalid|valid/i.test(message))
    return new ProviderError('invalid-email', message, status);
  if (/list/i.test(message)) return new ProviderError('invalid-list', message, status);
  if (/template|redirection/i.test(message)) return new ProviderError('config', message, status);
  return new ProviderError('provider', message, status);
}
