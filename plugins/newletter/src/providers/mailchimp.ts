/**
 * Mailchimp Marketing API 3.0: https://mailchimp.com/developer/marketing/api/.
 * The key ends with the account's data center (`…-us21`), which names the
 * API's address; it is sent with HTTP Basic authentication. Double opt-in is
 * Mailchimp's own: a new member with the status `pending` gets its
 * confirmation email. Members are found by the MD5 of their lowercase email.
 */
import { createHash } from 'node:crypto';
import { arrayOf, fail, messageOf, requireKey, send, str } from './http';
import { ProviderError, type Http, type Provider, type ProviderField } from './types';

/** The API address of a key, from its data center. */
export function mailchimpBase(key: string): string {
  const k = requireKey(key);
  const dc = /-([a-z]{2,4}\d{1,3})$/i.exec(k)?.[1];
  if (!dc)
    throw new ProviderError(
      'invalid-key',
      'A Mailchimp API key ends with its data center, e.g. …-us21.',
    );
  return `https://${dc.toLowerCase()}.api.mailchimp.com/3.0`;
}

export const memberHash = (email: string): string =>
  createHash('md5').update(email.trim().toLowerCase()).digest('hex');

function fieldType(type: string): ProviderField['type'] {
  if (type === 'text' || type === 'phone' || type === 'url' || type === 'zip') return 'text';
  if (type === 'number') return 'number';
  if (type === 'date' || type === 'birthday') return 'date';
  return 'other';
}

export function mailchimp(http: Http): Provider {
  const auth = (key: string) => ({
    authorization: `Basic ${Buffer.from(`cleitext:${requireKey(key)}`).toString('base64')}`,
  });
  const listUrl = (key: string, listId: string) => {
    if (!/^[\w-]{1,40}$/.test(listId))
      throw new ProviderError('invalid-list', 'A Mailchimp audience id is not valid.');
    return `${mailchimpBase(key)}/lists/${listId}`;
  };

  async function addTags(key: string, url: string, tags: string[]) {
    if (tags.length === 0) return;
    const res = await send(http, {
      url: `${url}/tags`,
      method: 'POST',
      headers: auth(key),
      body: JSON.stringify({ tags: tags.map((name) => ({ name, status: 'active' })) }),
    });
    if (res.status !== 204 && res.status !== 200) fail(res, 'Mailchimp did not add the tags');
  }

  return {
    id: 'mailchimp',
    name: 'Mailchimp',
    tags: true,
    needsUrl: false,
    async verify({ key }) {
      const res = await send(http, {
        url: `${mailchimpBase(key)}/?fields=account_name,email`,
        method: 'GET',
        headers: auth(key),
      });
      if (res.status !== 200) fail(res, 'Mailchimp did not accept the key');
      return { name: str(res.data.account_name) || str(res.data.email) || 'Mailchimp' };
    },
    async lists({ key }) {
      const out = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const res = await send(http, {
          url: `${mailchimpBase(key)}/lists?count=100&offset=${offset}&fields=lists.id,lists.name,lists.stats.member_count,total_items`,
          method: 'GET',
          headers: auth(key),
        });
        if (res.status !== 200) fail(res, 'Mailchimp did not give the audiences');
        const page = arrayOf(res.data.lists);
        out.push(
          ...page.map((l) => {
            const stats = l.stats as { member_count?: unknown } | undefined;
            return {
              id: str(l.id),
              name: str(l.name),
              ...(typeof stats?.member_count === 'number' ? { count: stats.member_count } : {}),
            };
          }),
        );
        if (page.length < 100) break;
      }
      return out;
    },
    async fields({ key }, listId) {
      if (!listId) return [];
      const res = await send(http, {
        url: `${listUrl(key, listId)}/merge-fields?count=100`,
        method: 'GET',
        headers: auth(key),
      });
      if (res.status === 404) throw new ProviderError('invalid-list', 'Audience not found.', 404);
      if (res.status !== 200) fail(res, 'Mailchimp did not give the fields');
      return arrayOf(res.data.merge_fields)
        .filter((f) => str(f.tag))
        .map((f) => ({
          key: str(f.tag),
          label: str(f.name) || str(f.tag),
          type: fieldType(str(f.type)),
          required: f.required === true,
        }));
    },
    async subscribe({ key }, input) {
      if (input.listIds.length === 0)
        throw new ProviderError('invalid-list', 'Choose a Mailchimp audience.');
      const mergeFields: Record<string, string> = { ...input.fields };
      if (input.firstName && !('FNAME' in mergeFields)) mergeFields.FNAME = input.firstName;
      if (input.lastName && !('LNAME' in mergeFields)) mergeFields.LNAME = input.lastName;
      const hash = memberHash(input.email);
      const statuses: ('subscribed' | 'pending' | 'already')[] = [];

      for (const listId of input.listIds) {
        const member = `${listUrl(key, listId)}/members/${hash}`;
        const found = await send(http, {
          url: `${member}?fields=status`,
          method: 'GET',
          headers: auth(key),
        });
        if (found.status === 200) {
          const status = str(found.data.status);
          if (status === 'subscribed' || status === 'pending') {
            await addTags(key, member, input.tags);
            statuses.push(status === 'pending' ? 'pending' : 'already');
            continue;
          }
          // Unsubscribed or cleaned: only a confirmation brings them back.
          const res = await send(http, {
            url: member,
            method: 'PATCH',
            headers: auth(key),
            body: JSON.stringify({ status: 'pending', merge_fields: mergeFields }),
          });
          if (res.status !== 200) throw mailchimpError(res.status, res.data);
          await addTags(key, member, input.tags);
          statuses.push('pending');
          continue;
        }
        if (found.status !== 404) fail(found, 'Mailchimp did not answer');
        const res = await send(http, {
          url: `${listUrl(key, listId)}/members`,
          method: 'POST',
          headers: auth(key),
          body: JSON.stringify({
            email_address: input.email,
            status: input.doubleOptIn ? 'pending' : 'subscribed',
            ...(Object.keys(mergeFields).length ? { merge_fields: mergeFields } : {}),
            ...(input.tags.length ? { tags: input.tags } : {}),
            ...(input.ip ? { ip_signup: input.ip } : {}),
            ...(input.consent ? { timestamp_signup: input.consent.at } : {}),
            ...(input.locale ? { language: input.locale.slice(0, 2) } : {}),
          }),
        });
        if (res.status === 200) {
          statuses.push(str(res.data.status) === 'pending' ? 'pending' : 'subscribed');
          continue;
        }
        const error = mailchimpError(res.status, res.data);
        if (error.message === 'Member Exists') {
          statuses.push('already');
          continue;
        }
        throw error;
      }
      const status = statuses.includes('pending')
        ? 'pending'
        : statuses.includes('subscribed')
          ? 'subscribed'
          : 'already';
      return { status };
    },
  };
}

function mailchimpError(status: number, data: Record<string, unknown>): ProviderError {
  const title = str(data.title);
  const detail = str(data.detail) || messageOf(data);
  if (title === 'Member Exists') return new ProviderError('provider', 'Member Exists', status);
  if (status === 404)
    return new ProviderError('invalid-list', detail || 'Audience not found.', status);
  if (title === 'Invalid Resource' && /email|fake|valid/i.test(detail))
    return new ProviderError('invalid-email', detail, status);
  if (title === 'Forgotten Email Not Subscribed')
    return new ProviderError('invalid-email', detail || title, status);
  return new ProviderError(
    'provider',
    detail || title || `Mailchimp answered with an error (${status}).`,
    status,
  );
}
