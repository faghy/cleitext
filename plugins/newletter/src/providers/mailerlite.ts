/**
 * MailerLite (the current API, connect.mailerlite.com):
 * https://developers.mailerlite.com/docs/. The key is a Bearer token. Lists
 * are MailerLite's groups. Double opt-in: the subscriber is created
 * `unconfirmed`, and MailerLite sends its confirmation email. MailerLite has
 * no tags apart from groups.
 */
import { arrayOf, fail, messageOf, requireKey, send, str } from './http';
import { ProviderError, type Http, type Provider, type ProviderField } from './types';

const BASE = 'https://connect.mailerlite.com/api';

function fieldType(type: string): ProviderField['type'] {
  if (type === 'text') return 'text';
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  return 'other';
}

export function mailerlite(http: Http): Provider {
  const headers = (key: string) => ({ authorization: `Bearer ${requireKey(key)}` });
  return {
    id: 'mailerlite',
    name: 'MailerLite',
    tags: false,
    needsUrl: false,
    async verify({ key }) {
      const res = await send(http, {
        url: `${BASE}/groups?limit=1`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'MailerLite did not accept the key');
      return { name: 'MailerLite' };
    },
    async lists({ key }) {
      const out = [];
      for (let page = 1; page <= 20; page++) {
        const res = await send(http, {
          url: `${BASE}/groups?limit=100&page=${page}&sort=name`,
          method: 'GET',
          headers: headers(key),
        });
        if (res.status !== 200) fail(res, 'MailerLite did not give the groups');
        const data = arrayOf(res.data.data);
        out.push(
          ...data.map((g) => ({
            id: str(g.id),
            name: str(g.name),
            ...(typeof g.active_count === 'number' ? { count: g.active_count } : {}),
          })),
        );
        const meta = res.data.meta as { last_page?: unknown } | undefined;
        if (data.length < 100 || Number(meta?.last_page ?? page) <= page) break;
      }
      return out;
    },
    async fields({ key }) {
      const res = await send(http, {
        url: `${BASE}/fields?limit=100`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'MailerLite did not give the fields');
      return arrayOf(res.data.data)
        .filter((f) => str(f.key) && str(f.key) !== 'email')
        .map((f) => ({
          key: str(f.key),
          label: str(f.name) || str(f.key),
          type: fieldType(str(f.type)),
        }));
    },
    async subscribe({ key }, input) {
      const groups = input.listIds.filter(Boolean);
      for (const id of groups)
        if (!/^\d{1,30}$/.test(id))
          throw new ProviderError('invalid-list', 'A MailerLite group id is not valid.');
      const fields: Record<string, string> = { ...input.fields };
      if (input.firstName && !('name' in fields)) fields.name = input.firstName;
      if (input.lastName && !('last_name' in fields)) fields.last_name = input.lastName;
      const notes = input.tags.length ? ['MailerLite has no tags: they were not sent.'] : [];

      const found = await send(http, {
        url: `${BASE}/subscribers/${encodeURIComponent(input.email)}`,
        method: 'GET',
        headers: headers(key),
      });
      let existing: string | null = null;
      if (found.status === 200) {
        const data = (found.data.data ?? {}) as Record<string, unknown>;
        existing = str(data.status);
        const inGroups = new Set(arrayOf(data.groups).map((g) => str(g.id)));
        if (
          (existing === 'active' || existing === 'unconfirmed') &&
          groups.every((g) => inGroups.has(g))
        )
          return { status: existing === 'unconfirmed' ? 'pending' : 'already', notes };
      } else if (found.status !== 404) fail(found, 'MailerLite did not answer');

      const status =
        existing === 'active' ? 'active' : input.doubleOptIn ? 'unconfirmed' : 'active';
      const res = await send(http, {
        url: `${BASE}/subscribers`,
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          email: input.email,
          ...(Object.keys(fields).length ? { fields } : {}),
          ...(groups.length ? { groups } : {}),
          status,
          ...(input.ip ? { ip_address: input.ip, optin_ip: input.ip } : {}),
          ...(input.consent
            ? { opted_in_at: input.consent.at.replace('T', ' ').slice(0, 19) }
            : {}),
        }),
      });
      if (res.status === 200 || res.status === 201) {
        if (existing === 'active') return { status: 'already', notes };
        return { status: status === 'unconfirmed' ? 'pending' : 'subscribed', notes };
      }
      const message = messageOf(res.data) || `MailerLite answered with an error (${res.status}).`;
      const errors = (res.data.errors ?? {}) as Record<string, unknown>;
      if (res.status === 422 && 'email' in errors)
        throw new ProviderError('invalid-email', message, res.status);
      if (res.status === 422 && Object.keys(errors).some((k) => k.startsWith('groups')))
        throw new ProviderError('invalid-list', message, res.status);
      throw new ProviderError('provider', message, res.status);
    },
  };
}
