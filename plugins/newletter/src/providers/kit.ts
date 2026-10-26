/**
 * Kit (formerly ConvertKit), API v4: https://developers.kit.com/v4. The key
 * goes in the `X-Kit-Api-Key` header. Lists are Kit's forms: a subscriber
 * added to a form gets that form's emails, and its confirmation email when
 * the form asks for double opt-in (a setting of the form in Kit). Tags are
 * found by name, and made when missing.
 */
import { arrayOf, fail, messageOf, requireKey, send, str } from './http';
import { ProviderError, type Http, type Provider } from './types';

const BASE = 'https://api.kit.com/v4';

export function kit(http: Http): Provider {
  const headers = (key: string) => ({ 'x-kit-api-key': requireKey(key) });

  async function tagIds(key: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const res = await send(http, {
      url: `${BASE}/tags?per_page=1000`,
      method: 'GET',
      headers: headers(key),
    });
    if (res.status !== 200) fail(res, 'Kit did not give the tags');
    const known = new Map(
      arrayOf(res.data.tags).map((t) => [str(t.name).toLowerCase(), str(t.id)] as const),
    );
    const ids: string[] = [];
    for (const name of names) {
      const id = known.get(name.toLowerCase());
      if (id) {
        ids.push(id);
        continue;
      }
      const made = await send(http, {
        url: `${BASE}/tags`,
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({ name }),
      });
      if (made.status !== 200 && made.status !== 201) fail(made, 'Kit did not make the tag');
      const tag = (made.data.tag ?? {}) as Record<string, unknown>;
      if (str(tag.id)) ids.push(str(tag.id));
    }
    return ids;
  }

  return {
    id: 'kit',
    name: 'Kit',
    tags: true,
    needsUrl: false,
    async verify({ key }) {
      const res = await send(http, {
        url: `${BASE}/account`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'Kit did not accept the key');
      const account = (res.data.account ?? {}) as Record<string, unknown>;
      const user = (res.data.user ?? {}) as Record<string, unknown>;
      return { name: str(account.name) || str(user.email) || 'Kit' };
    },
    async lists({ key }) {
      const out = [];
      let after = '';
      for (let page = 0; page < 20; page++) {
        const res = await send(http, {
          url: `${BASE}/forms?status=active&per_page=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
          method: 'GET',
          headers: headers(key),
        });
        if (res.status !== 200) fail(res, 'Kit did not give the forms');
        out.push(...arrayOf(res.data.forms).map((f) => ({ id: str(f.id), name: str(f.name) })));
        const pagination = (res.data.pagination ?? {}) as Record<string, unknown>;
        if (pagination.has_next_page !== true || !str(pagination.end_cursor)) break;
        after = str(pagination.end_cursor);
      }
      return out;
    },
    async fields({ key }) {
      const res = await send(http, {
        url: `${BASE}/custom_fields?per_page=100`,
        method: 'GET',
        headers: headers(key),
      });
      if (res.status !== 200) fail(res, 'Kit did not give the fields');
      return arrayOf(res.data.custom_fields)
        .filter((f) => str(f.key))
        .map((f) => ({
          key: str(f.key),
          label: str(f.label) || str(f.key),
          type: 'text' as const,
        }));
    },
    async subscribe({ key }, input) {
      for (const id of input.listIds)
        if (!/^\d{1,30}$/.test(id))
          throw new ProviderError('invalid-list', 'A Kit form id is not valid.');
      const notes: string[] = [];
      if (input.lastName && Object.keys(input.fields).length === 0)
        notes.push('Kit has no last name: map it to a custom field to keep it.');
      const res = await send(http, {
        url: `${BASE}/subscribers`,
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          email_address: input.email,
          ...(input.firstName ? { first_name: input.firstName } : {}),
          state: input.doubleOptIn ? 'inactive' : 'active',
          ...(Object.keys(input.fields).length ? { fields: input.fields } : {}),
        }),
      });
      if (res.status === 422)
        throw new ProviderError(
          /email/i.test(messageOf(res.data)) ? 'invalid-email' : 'provider',
          messageOf(res.data) || 'Kit refused the subscriber.',
          422,
        );
      if (res.status !== 200 && res.status !== 201) fail(res, 'Kit did not add the subscriber');
      const subscriber = (res.data.subscriber ?? {}) as Record<string, unknown>;
      const existed = res.status === 200 && str(subscriber.state) === 'active';

      for (const id of input.listIds) {
        const added = await send(http, {
          url: `${BASE}/forms/${id}/subscribers`,
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify({ email_address: input.email }),
        });
        if (added.status === 404)
          throw new ProviderError('invalid-list', 'Kit form not found.', 404);
        if (added.status !== 200 && added.status !== 201)
          fail(added, 'Kit did not add to the form');
      }
      for (const id of await tagIds(key, input.tags)) {
        const tagged = await send(http, {
          url: `${BASE}/tags/${id}/subscribers`,
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify({ email_address: input.email }),
        });
        if (tagged.status !== 200 && tagged.status !== 201) fail(tagged, 'Kit did not tag');
      }
      if (existed) return { status: 'already', notes };
      return { status: input.doubleOptIn ? 'pending' : 'subscribed', notes };
    },
  };
}
