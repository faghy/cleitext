/**
 * ActiveCampaign, API v3: https://developers.activecampaign.com/reference.
 * Each account has its own API address (Settings → Developer in
 * ActiveCampaign), given with the key, which goes in the `Api-Token`
 * header. Custom fields are sent by their id. ActiveCampaign's API cannot
 * start its double opt-in (that belongs to its own forms): contacts are
 * subscribed at once, and the log says so.
 */
import { arrayOf, fail, messageOf, requireKey, send, str } from './http';
import {
  ProviderError,
  type Credentials,
  type Http,
  type Provider,
  type ProviderField,
} from './types';

/** The API's address of an account (`https://acme.api-us1.com`). */
export function activeCampaignBase(url: string | undefined): string {
  const clean = (url ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/3$/, '');
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/i.test(clean))
    throw new ProviderError(
      'config',
      'Enter the API address of your ActiveCampaign account, e.g. https://acme.api-us1.com.',
    );
  return `${clean.toLowerCase()}/api/3`;
}

function fieldType(type: string): ProviderField['type'] {
  if (type === 'text' || type === 'textarea' || type === 'hidden') return 'text';
  if (type === 'date' || type === 'datetime') return 'date';
  return 'other';
}

export function activeCampaign(http: Http): Provider {
  const call = (c: Credentials, method: 'GET' | 'POST', path: string, body?: unknown) =>
    send(http, {
      url: `${activeCampaignBase(c.url)}${path}`,
      method,
      headers: { 'api-token': requireKey(c.key) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  async function tagId(c: Credentials, name: string): Promise<string> {
    const found = await call(c, 'GET', `/tags?search=${encodeURIComponent(name)}`);
    if (found.status !== 200) fail(found, 'ActiveCampaign did not give the tags');
    const same = arrayOf(found.data.tags).find(
      (t) => str(t.tag).toLowerCase() === name.toLowerCase(),
    );
    if (same) return str(same.id);
    const made = await call(c, 'POST', '/tags', { tag: { tag: name, tagType: 'contact' } });
    if (made.status !== 200 && made.status !== 201)
      fail(made, 'ActiveCampaign did not make the tag');
    return str((made.data.tag as Record<string, unknown> | undefined)?.id);
  }

  return {
    id: 'activecampaign',
    name: 'ActiveCampaign',
    tags: true,
    needsUrl: true,
    async verify(c) {
      const res = await call(c, 'GET', '/users/me');
      if (res.status !== 200) fail(res, 'ActiveCampaign did not accept the key');
      const user = (res.data.user ?? {}) as Record<string, unknown>;
      return { name: str(user.email) || str(user.username) || 'ActiveCampaign' };
    },
    async lists(c) {
      const out = [];
      for (let offset = 0; offset < 2000; offset += 100) {
        const res = await call(c, 'GET', `/lists?limit=100&offset=${offset}`);
        if (res.status !== 200) fail(res, 'ActiveCampaign did not give the lists');
        const page = arrayOf(res.data.lists);
        out.push(...page.map((l) => ({ id: str(l.id), name: str(l.name) })));
        if (page.length < 100) break;
      }
      return out;
    },
    async fields(c) {
      const res = await call(c, 'GET', '/fields?limit=100');
      if (res.status !== 200) fail(res, 'ActiveCampaign did not give the fields');
      return arrayOf(res.data.fields)
        .filter((f) => str(f.id))
        .map((f) => ({
          key: str(f.id),
          label: str(f.title) || str(f.perstag),
          type: fieldType(str(f.type)),
        }));
    },
    async subscribe(c, input) {
      if (input.listIds.length === 0)
        throw new ProviderError('invalid-list', 'Choose an ActiveCampaign list.');
      for (const id of input.listIds)
        if (!/^\d{1,20}$/.test(id))
          throw new ProviderError('invalid-list', 'An ActiveCampaign list id is not valid.');
      const notes = input.doubleOptIn
        ? ['ActiveCampaign cannot send its confirmation through the API: subscribed at once.']
        : [];

      // Already active on every list?
      const found = await call(c, 'GET', `/contacts?email=${encodeURIComponent(input.email)}`);
      if (found.status !== 200) fail(found, 'ActiveCampaign did not answer');
      const existing = arrayOf(found.data.contacts)[0];
      if (existing) {
        const lists = await call(c, 'GET', `/contacts/${str(existing.id)}/contactLists`);
        if (lists.status === 200) {
          const active = new Set(
            arrayOf(lists.data.contactLists)
              .filter((l) => str(l.status) === '1')
              .map((l) => str(l.list)),
          );
          if (input.listIds.every((id) => active.has(id)) && input.tags.length === 0)
            return { status: 'already', notes };
        }
      }

      const synced = await call(c, 'POST', '/contact/sync', {
        contact: {
          email: input.email,
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(Object.keys(input.fields).length
            ? {
                fieldValues: Object.entries(input.fields).map(([field, value]) => ({
                  field,
                  value,
                })),
              }
            : {}),
        },
      });
      if (synced.status === 422)
        throw new ProviderError(
          'invalid-email',
          messageOf(synced.data) || 'ActiveCampaign refused the email address.',
          422,
        );
      if (synced.status !== 200 && synced.status !== 201)
        fail(synced, 'ActiveCampaign did not save the contact');
      const contact = str((synced.data.contact as Record<string, unknown> | undefined)?.id);
      for (const list of input.listIds) {
        const res = await call(c, 'POST', '/contactLists', {
          contactList: { list, contact, status: 1 },
        });
        if (res.status === 404 || res.status === 422)
          throw new ProviderError(
            'invalid-list',
            messageOf(res.data) || 'List not found.',
            res.status,
          );
        if (res.status !== 200 && res.status !== 201)
          fail(res, 'ActiveCampaign did not add to the list');
      }
      for (const name of input.tags) {
        const tag = await tagId(c, name);
        const res = await call(c, 'POST', '/contactTags', { contactTag: { contact, tag } });
        if (res.status !== 200 && res.status !== 201) fail(res, 'ActiveCampaign did not tag');
      }
      return { status: existing ? 'already' : 'subscribed', notes };
    },
  };
}
