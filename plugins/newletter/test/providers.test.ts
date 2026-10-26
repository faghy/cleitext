import { describe, expect, it } from 'vitest';
import { activeCampaign, activeCampaignBase } from '../src/providers/activecampaign';
import { brevo } from '../src/providers/brevo';
import { messageOf, send } from '../src/providers/http';
import { isProviderId, providerOf, redirectToTest, siteHttp, testEndpoint } from '../src/providers';
import { kit } from '../src/providers/kit';
import { mailchimp, mailchimpBase, memberHash } from '../src/providers/mailchimp';
import { mailerlite } from '../src/providers/mailerlite';
import { ProviderError, type SubscribeInput } from '../src/providers/types';
import { fakeHttp, unauthorized } from './fake-http';

const base: SubscribeInput = {
  email: 'ada@example.com',
  fields: {},
  firstName: 'Ada',
  lastName: 'Lovelace',
  tags: [],
  listIds: ['7'],
  doubleOptIn: false,
  consent: { at: '2030-01-01T10:00:00.000Z', text: 'I agree' },
  ip: '203.0.113.9',
  locale: 'it',
};

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'none';
  } catch (error) {
    return error instanceof ProviderError ? error.code : 'other';
  }
}

describe('Brevo', () => {
  const key = { key: 'xkeysib-abc' };

  it('verifies the key and lists lists and fields', async () => {
    const { http, calls } = fakeHttp({
      'GET api.brevo.com/v3/account': () => ({ status: 200, body: { companyName: 'Acme' } }),
      'GET api.brevo.com/v3/contacts/lists': () => ({
        status: 200,
        body: { lists: [{ id: 7, name: 'News', totalSubscribers: 3 }] },
      }),
      'GET api.brevo.com/v3/contacts/attributes': () => ({
        status: 200,
        body: {
          attributes: [
            { name: 'FIRSTNAME', category: 'normal', type: 'text' },
            { name: 'AGE', category: 'normal', type: 'float' },
            { name: 'SMS', category: 'normal', type: 'boolean' },
            { name: 'ORDER', category: 'transactional', type: 'id' },
          ],
        },
      }),
    });
    const p = brevo(http);
    expect(await p.verify(key)).toEqual({ name: 'Acme' });
    expect(calls[0]!.headers['api-key']).toBe('xkeysib-abc');
    expect(await p.lists(key)).toEqual([{ id: '7', name: 'News', count: 3 }]);
    expect(await p.fields(key)).toEqual([
      { key: 'FIRSTNAME', label: 'FIRSTNAME', type: 'text' },
      { key: 'AGE', label: 'AGE', type: 'number' },
      { key: 'SMS', label: 'SMS', type: 'other' },
    ]);
  });

  it('subscribes a new contact to the lists', async () => {
    const { http, calls } = fakeHttp({
      'GET api.brevo.com/v3/contacts/*': () => ({
        status: 404,
        body: { code: 'document_not_found' },
      }),
      'POST api.brevo.com/v3/contacts': () => ({ status: 201, body: { id: 1 } }),
    });
    const result = await brevo(http).subscribe(key, { ...base, tags: ['x'] });
    expect(result.status).toBe('subscribed');
    expect(result.notes?.[0]).toMatch(/no tags/);
    expect(calls[1]!.json).toEqual({
      email: 'ada@example.com',
      attributes: { FIRSTNAME: 'Ada', LASTNAME: 'Lovelace' },
      listIds: [7],
      updateEnabled: true,
    });
  });

  it('says already subscribed for a contact on every list', async () => {
    const { http, calls } = fakeHttp({
      'GET api.brevo.com/v3/contacts/*': () => ({
        status: 200,
        body: { listIds: [7, 9], emailBlacklisted: false },
      }),
    });
    expect((await brevo(http).subscribe(key, base)).status).toBe('already');
    expect(calls).toHaveLength(1);
  });

  it('updates a contact on other lists and keeps it as already known', async () => {
    const { http } = fakeHttp({
      'GET api.brevo.com/v3/contacts/*': () => ({ status: 200, body: { listIds: [9] } }),
      'POST api.brevo.com/v3/contacts': () => ({ status: 204 }),
    });
    expect((await brevo(http).subscribe(key, base)).status).toBe('already');
  });

  it('sends the double opt-in with the template and the page', async () => {
    const { http, calls } = fakeHttp({
      'GET api.brevo.com/v3/contacts/*': () => ({ status: 404 }),
      'POST api.brevo.com/v3/contacts/doubleOptinConfirmation': () => ({ status: 201 }),
    });
    const result = await brevo(http).subscribe(key, {
      ...base,
      doubleOptIn: true,
      doi: { templateId: 12, redirectUrl: 'https://example.com/thanks' },
    });
    expect(result.status).toBe('pending');
    expect(calls[1]!.json).toMatchObject({
      includeListIds: [7],
      templateId: 12,
      redirectionUrl: 'https://example.com/thanks',
    });
  });

  it('needs the template for double opt-in, and valid lists', async () => {
    const { http } = fakeHttp({ 'GET api.brevo.com/v3/contacts/*': () => ({ status: 404 }) });
    expect(await code(brevo(http).subscribe(key, { ...base, doubleOptIn: true }))).toBe('config');
    expect(await code(brevo(http).subscribe(key, { ...base, listIds: ['abc'] }))).toBe(
      'invalid-list',
    );
    expect(await code(brevo(http).subscribe(key, { ...base, listIds: [] }))).toBe('invalid-list');
  });

  it('refuses an invalid key and reads an invalid email', async () => {
    const { http } = fakeHttp({ 'GET api.brevo.com/v3/account': unauthorized });
    expect(await code(brevo(http).verify(key))).toBe('invalid-key');
    expect(await code(brevo(http).verify({ key: '  ' }))).toBe('invalid-key');
    const bad = fakeHttp({
      'GET api.brevo.com/v3/contacts/*': () => ({ status: 404 }),
      'POST api.brevo.com/v3/contacts': () => ({
        status: 400,
        body: { code: 'invalid_parameter', message: 'Invalid email address' },
      }),
    });
    expect(await code(brevo(bad.http).subscribe(key, base))).toBe('invalid-email');
  });
});

describe('Mailchimp', () => {
  const key = { key: '0123abcd-us21' };
  const member = `GET us21.api.mailchimp.com/3.0/lists/abc123/members/${memberHash('ada@example.com')}`;
  const lists = { ...base, listIds: ['abc123'] };

  it('finds the API address from the key', () => {
    expect(mailchimpBase('0123-us21')).toBe('https://us21.api.mailchimp.com/3.0');
    expect(() => mailchimpBase('0123')).toThrow(ProviderError);
    expect(memberHash(' Ada@Example.com ')).toBe(memberHash('ada@example.com'));
  });

  it('verifies the key, lists audiences and merge fields', async () => {
    const { http, calls } = fakeHttp({
      'GET us21.api.mailchimp.com/3.0/': () => ({ status: 200, body: { account_name: 'Acme' } }),
      'GET us21.api.mailchimp.com/3.0/lists': () => ({
        status: 200,
        body: { lists: [{ id: 'abc123', name: 'News', stats: { member_count: 5 } }] },
      }),
      'GET us21.api.mailchimp.com/3.0/lists/abc123/merge-fields': () => ({
        status: 200,
        body: {
          merge_fields: [
            { tag: 'FNAME', name: 'First Name', type: 'text', required: false },
            { tag: 'BDAY', name: 'Birthday', type: 'birthday', required: true },
          ],
        },
      }),
    });
    const p = mailchimp(http);
    expect(await p.verify(key)).toEqual({ name: 'Acme' });
    expect(calls[0]!.headers.authorization).toBe(
      `Basic ${Buffer.from('cleitext:0123abcd-us21').toString('base64')}`,
    );
    expect(await p.lists(key)).toEqual([{ id: 'abc123', name: 'News', count: 5 }]);
    expect(await p.fields(key, 'abc123')).toEqual([
      { key: 'FNAME', label: 'First Name', type: 'text', required: false },
      { key: 'BDAY', label: 'Birthday', type: 'date', required: true },
    ]);
    expect(await p.fields(key)).toEqual([]);
  });

  it('subscribes a new member, with merge fields, tags and the signup IP', async () => {
    const { http, calls } = fakeHttp({
      [member]: () => ({ status: 404, body: { title: 'Resource Not Found' } }),
      'POST us21.api.mailchimp.com/3.0/lists/abc123/members': () => ({
        status: 200,
        body: { status: 'subscribed' },
      }),
    });
    const result = await mailchimp(http).subscribe(key, { ...lists, tags: ['site'] });
    expect(result.status).toBe('subscribed');
    expect(calls[1]!.json).toEqual({
      email_address: 'ada@example.com',
      status: 'subscribed',
      merge_fields: { FNAME: 'Ada', LNAME: 'Lovelace' },
      tags: ['site'],
      ip_signup: '203.0.113.9',
      timestamp_signup: '2030-01-01T10:00:00.000Z',
      language: 'it',
    });
  });

  it('adds a new member as pending with double opt-in', async () => {
    const { http, calls } = fakeHttp({
      [member]: () => ({ status: 404 }),
      'POST us21.api.mailchimp.com/3.0/lists/abc123/members': () => ({
        status: 200,
        body: { status: 'pending' },
      }),
    });
    expect((await mailchimp(http).subscribe(key, { ...lists, doubleOptIn: true })).status).toBe(
      'pending',
    );
    expect(calls[1]!.json.status).toBe('pending');
  });

  it('says already subscribed, and still adds the tags', async () => {
    const { http, calls } = fakeHttp({
      [member]: () => ({ status: 200, body: { status: 'subscribed' } }),
      [`POST us21.api.mailchimp.com/3.0/lists/abc123/members/${memberHash('ada@example.com')}/tags`]:
        () => ({ status: 204 }),
    });
    expect((await mailchimp(http).subscribe(key, { ...lists, tags: ['a'] })).status).toBe(
      'already',
    );
    expect(calls[1]!.json).toEqual({ tags: [{ name: 'a', status: 'active' }] });
  });

  it('asks an unsubscribed member to confirm again', async () => {
    const { http, calls } = fakeHttp({
      [member]: () => ({ status: 200, body: { status: 'unsubscribed' } }),
      [`PATCH us21.api.mailchimp.com/3.0/lists/abc123/members/${memberHash('ada@example.com')}`]:
        () => ({ status: 200, body: { status: 'pending' } }),
    });
    expect((await mailchimp(http).subscribe(key, lists)).status).toBe('pending');
    expect(calls[1]!.json.status).toBe('pending');
  });

  it('reads Member Exists, fake emails, missing audiences and refused keys', async () => {
    const exists = fakeHttp({
      [member]: () => ({ status: 404 }),
      'POST us21.api.mailchimp.com/3.0/lists/abc123/members': () => ({
        status: 400,
        body: { title: 'Member Exists', detail: 'ada@example.com is already a list member.' },
      }),
    });
    expect((await mailchimp(exists.http).subscribe(key, lists)).status).toBe('already');
    const fake = fakeHttp({
      [member]: () => ({ status: 404 }),
      'POST us21.api.mailchimp.com/3.0/lists/abc123/members': () => ({
        status: 400,
        body: { title: 'Invalid Resource', detail: 'ada@example.com looks fake or invalid' },
      }),
    });
    expect(await code(mailchimp(fake.http).subscribe(key, lists))).toBe('invalid-email');
    const gone = fakeHttp({
      [member]: () => ({ status: 404 }),
      'POST us21.api.mailchimp.com/3.0/lists/abc123/members': () => ({
        status: 404,
        body: { title: 'Resource Not Found' },
      }),
    });
    expect(await code(mailchimp(gone.http).subscribe(key, lists))).toBe('invalid-list');
    const refused = fakeHttp({ 'GET us21.api.mailchimp.com/3.0/': unauthorized });
    expect(await code(mailchimp(refused.http).verify(key))).toBe('invalid-key');
    expect(await code(mailchimp(refused.http).subscribe(key, { ...lists, listIds: [] }))).toBe(
      'invalid-list',
    );
  });
});

describe('MailerLite', () => {
  const key = { key: 'eyJ0eXAi' };
  const groups = { ...base, listIds: ['111'] };

  it('verifies the key, lists groups and fields', async () => {
    const { http, calls } = fakeHttp({
      'GET connect.mailerlite.com/api/groups': () => ({
        status: 200,
        body: { data: [{ id: '111', name: 'News', active_count: 4 }], meta: { last_page: 1 } },
      }),
      'GET connect.mailerlite.com/api/fields': () => ({
        status: 200,
        body: {
          data: [
            { key: 'email', name: 'Email', type: 'text' },
            { key: 'city', name: 'City', type: 'text' },
          ],
        },
      }),
    });
    const p = mailerlite(http);
    expect(await p.verify(key)).toEqual({ name: 'MailerLite' });
    expect(calls[0]!.headers.authorization).toBe('Bearer eyJ0eXAi');
    expect(await p.lists(key)).toEqual([{ id: '111', name: 'News', count: 4 }]);
    expect(await p.fields(key)).toEqual([{ key: 'city', label: 'City', type: 'text' }]);
  });

  it('subscribes as active, or unconfirmed with double opt-in', async () => {
    const routes = {
      'GET connect.mailerlite.com/api/subscribers/*': () => ({ status: 404 }),
      'POST connect.mailerlite.com/api/subscribers': () => ({ status: 201, body: { data: {} } }),
    };
    const a = fakeHttp(routes);
    expect((await mailerlite(a.http).subscribe(key, groups)).status).toBe('subscribed');
    expect(a.calls[1]!.json).toMatchObject({
      email: 'ada@example.com',
      fields: { name: 'Ada', last_name: 'Lovelace' },
      groups: ['111'],
      status: 'active',
      ip_address: '203.0.113.9',
    });
    const b = fakeHttp(routes);
    expect((await mailerlite(b.http).subscribe(key, { ...groups, doubleOptIn: true })).status).toBe(
      'pending',
    );
    expect(b.calls[1]!.json.status).toBe('unconfirmed');
  });

  it('says already subscribed for an active subscriber in the groups', async () => {
    const { http } = fakeHttp({
      'GET connect.mailerlite.com/api/subscribers/*': () => ({
        status: 200,
        body: { data: { status: 'active', groups: [{ id: '111' }] } },
      }),
    });
    expect((await mailerlite(http).subscribe(key, groups)).status).toBe('already');
  });

  it('adds an active subscriber to a new group and keeps it active', async () => {
    const { http, calls } = fakeHttp({
      'GET connect.mailerlite.com/api/subscribers/*': () => ({
        status: 200,
        body: { data: { status: 'active', groups: [] } },
      }),
      'POST connect.mailerlite.com/api/subscribers': () => ({ status: 200, body: { data: {} } }),
    });
    expect((await mailerlite(http).subscribe(key, { ...groups, doubleOptIn: true })).status).toBe(
      'already',
    );
    expect(calls[1]!.json.status).toBe('active');
  });

  it('reads an invalid email, a bad group and a refused key', async () => {
    const bad = fakeHttp({
      'GET connect.mailerlite.com/api/subscribers/*': () => ({ status: 404 }),
      'POST connect.mailerlite.com/api/subscribers': () => ({
        status: 422,
        body: {
          message: 'The email must be a valid email address.',
          errors: { email: ['The email must be a valid email address.'] },
        },
      }),
    });
    expect(await code(mailerlite(bad.http).subscribe(key, groups))).toBe('invalid-email');
    expect(await code(mailerlite(bad.http).subscribe(key, { ...groups, listIds: ['x'] }))).toBe(
      'invalid-list',
    );
    const refused = fakeHttp({ 'GET connect.mailerlite.com/api/groups': unauthorized });
    expect(await code(mailerlite(refused.http).verify(key))).toBe('invalid-key');
  });
});

describe('Kit', () => {
  const key = { key: 'kit_abc' };
  const forms = { ...base, listIds: ['55'] };

  it('verifies the key, lists forms and custom fields', async () => {
    const { http, calls } = fakeHttp({
      'GET api.kit.com/v4/account': () => ({
        status: 200,
        body: { account: { name: 'Acme' }, user: { email: 'a@b.c' } },
      }),
      'GET api.kit.com/v4/forms': () => ({
        status: 200,
        body: { forms: [{ id: 55, name: 'Signup' }], pagination: { has_next_page: false } },
      }),
      'GET api.kit.com/v4/custom_fields': () => ({
        status: 200,
        body: { custom_fields: [{ id: 1, key: 'last_name', label: 'Last name' }] },
      }),
    });
    const p = kit(http);
    expect(await p.verify(key)).toEqual({ name: 'Acme' });
    expect(calls[0]!.headers['x-kit-api-key']).toBe('kit_abc');
    expect(await p.lists(key)).toEqual([{ id: '55', name: 'Signup' }]);
    expect(await p.fields(key)).toEqual([{ key: 'last_name', label: 'Last name', type: 'text' }]);
  });

  it('subscribes, adds to the form and tags (making missing tags)', async () => {
    const { http, calls } = fakeHttp({
      'POST api.kit.com/v4/subscribers': () => ({
        status: 201,
        body: { subscriber: { id: 1, state: 'active' } },
      }),
      'POST api.kit.com/v4/forms/55/subscribers': () => ({ status: 201 }),
      'GET api.kit.com/v4/tags': () => ({ status: 200, body: { tags: [{ id: 3, name: 'Site' }] } }),
      'POST api.kit.com/v4/tags': () => ({ status: 201, body: { tag: { id: 4, name: 'new' } } }),
      'POST api.kit.com/v4/tags/*/subscribers': () => ({ status: 201 }),
    });
    const result = await kit(http).subscribe(key, { ...forms, tags: ['site', 'new'] });
    expect(result.status).toBe('subscribed');
    expect(result.notes?.[0]).toMatch(/last name/);
    expect(calls[0]!.json).toEqual({
      email_address: 'ada@example.com',
      first_name: 'Ada',
      state: 'active',
    });
    const tagged = calls.filter((c) => /\/tags\/\d+\/subscribers$/.test(c.url)).map((c) => c.url);
    expect(tagged).toEqual([
      'https://api.kit.com/v4/tags/3/subscribers',
      'https://api.kit.com/v4/tags/4/subscribers',
    ]);
  });

  it('says already subscribed, and pending with double opt-in', async () => {
    const existing = fakeHttp({
      'POST api.kit.com/v4/subscribers': () => ({
        status: 200,
        body: { subscriber: { state: 'active' } },
      }),
      'POST api.kit.com/v4/forms/55/subscribers': () => ({ status: 200 }),
    });
    expect((await kit(existing.http).subscribe(key, forms)).status).toBe('already');
    const doi = fakeHttp({
      'POST api.kit.com/v4/subscribers': () => ({
        status: 201,
        body: { subscriber: { state: 'inactive' } },
      }),
      'POST api.kit.com/v4/forms/55/subscribers': () => ({ status: 201 }),
    });
    expect((await kit(doi.http).subscribe(key, { ...forms, doubleOptIn: true })).status).toBe(
      'pending',
    );
    expect(doi.calls[0]!.json.state).toBe('inactive');
  });

  it('reads an invalid email, a missing form and a refused key', async () => {
    const bad = fakeHttp({
      'POST api.kit.com/v4/subscribers': () => ({
        status: 422,
        body: { errors: ['Email address is invalid'] },
      }),
    });
    expect(await code(kit(bad.http).subscribe(key, forms))).toBe('invalid-email');
    const gone = fakeHttp({
      'POST api.kit.com/v4/subscribers': () => ({ status: 201, body: { subscriber: {} } }),
      'POST api.kit.com/v4/forms/55/subscribers': () => ({ status: 404 }),
    });
    expect(await code(kit(gone.http).subscribe(key, forms))).toBe('invalid-list');
    const refused = fakeHttp({ 'GET api.kit.com/v4/account': unauthorized });
    expect(await code(kit(refused.http).verify(key))).toBe('invalid-key');
  });
});

describe('ActiveCampaign', () => {
  const creds = { key: 'ac-key', url: 'https://acme.api-us1.com/' };
  const host = 'acme.api-us1.com/api/3';

  it('needs the account address', () => {
    expect(activeCampaignBase('https://acme.api-us1.com/api/3')).toBe(
      'https://acme.api-us1.com/api/3',
    );
    expect(() => activeCampaignBase('http://acme.api-us1.com')).toThrow(ProviderError);
    expect(() => activeCampaignBase(undefined)).toThrow(ProviderError);
  });

  it('verifies the key, lists lists and fields', async () => {
    const { http, calls } = fakeHttp({
      [`GET ${host}/users/me`]: () => ({ status: 200, body: { user: { email: 'o@acme.com' } } }),
      [`GET ${host}/lists`]: () => ({ status: 200, body: { lists: [{ id: '2', name: 'News' }] } }),
      [`GET ${host}/fields`]: () => ({
        status: 200,
        body: { fields: [{ id: '5', title: 'City', type: 'text' }] },
      }),
    });
    const p = activeCampaign(http);
    expect(await p.verify(creds)).toEqual({ name: 'o@acme.com' });
    expect(calls[0]!.headers['api-token']).toBe('ac-key');
    expect(await p.lists(creds)).toEqual([{ id: '2', name: 'News' }]);
    expect(await p.fields(creds)).toEqual([{ key: '5', label: 'City', type: 'text' }]);
  });

  it('syncs the contact, adds it to the lists and tags it', async () => {
    const { http, calls } = fakeHttp({
      [`GET ${host}/contacts`]: () => ({ status: 200, body: { contacts: [] } }),
      [`POST ${host}/contact/sync`]: () => ({ status: 201, body: { contact: { id: '9' } } }),
      [`POST ${host}/contactLists`]: () => ({ status: 201, body: {} }),
      [`GET ${host}/tags`]: () => ({ status: 200, body: { tags: [{ id: '4', tag: 'site' }] } }),
      [`POST ${host}/contactTags`]: () => ({ status: 201, body: {} }),
    });
    const result = await activeCampaign(http).subscribe(creds, {
      ...base,
      listIds: ['2'],
      fields: { '5': 'Turin' },
      tags: ['site'],
      doubleOptIn: true,
    });
    expect(result.status).toBe('subscribed');
    expect(result.notes?.[0]).toMatch(/cannot send its confirmation/);
    expect(calls[1]!.json).toEqual({
      contact: {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fieldValues: [{ field: '5', value: 'Turin' }],
      },
    });
    expect(calls[2]!.json).toEqual({ contactList: { list: '2', contact: '9', status: 1 } });
    expect(calls.at(-1)!.json).toEqual({ contactTag: { contact: '9', tag: '4' } });
  });

  it('says already subscribed, reads invalid emails and refused keys', async () => {
    const { http } = fakeHttp({
      [`GET ${host}/contacts`]: () => ({ status: 200, body: { contacts: [{ id: '9' }] } }),
      [`GET ${host}/contacts/9/contactLists`]: () => ({
        status: 200,
        body: { contactLists: [{ list: '2', status: '1' }] },
      }),
    });
    expect((await activeCampaign(http).subscribe(creds, { ...base, listIds: ['2'] })).status).toBe(
      'already',
    );
    const bad = fakeHttp({
      [`GET ${host}/contacts`]: () => ({ status: 200, body: { contacts: [] } }),
      [`POST ${host}/contact/sync`]: () => ({
        status: 422,
        body: { errors: [{ title: 'Email address is not valid.' }] },
      }),
    });
    expect(await code(activeCampaign(bad.http).subscribe(creds, { ...base, listIds: ['2'] }))).toBe(
      'invalid-email',
    );
    const refused = fakeHttp({ [`GET ${host}/users/me`]: () => ({ status: 403, body: {} }) });
    expect(await code(activeCampaign(refused.http).verify(creds))).toBe('invalid-key');
  });
});

describe('shared HTTP handling', () => {
  it('turns failures into provider errors', async () => {
    const failing = async () => {
      throw new Error('ECONNRESET');
    };
    expect(await code(send(failing, { url: 'https://x.test/', method: 'GET', headers: {} }))).toBe(
      'network',
    );
    const busy = fakeHttp({ 'GET x.test/': () => ({ status: 429 }) });
    expect(
      await code(send(busy.http, { url: 'https://x.test/', method: 'GET', headers: {} })),
    ).toBe('rate-limit');
    const down = fakeHttp({ 'GET x.test/': () => ({ status: 503, body: { message: 'Down' } }) });
    expect(
      await code(send(down.http, { url: 'https://x.test/', method: 'GET', headers: {} })),
    ).toBe('provider');
  });

  it('reads the services’ error messages', () => {
    expect(messageOf({ message: 'A' })).toBe('A');
    expect(messageOf({ detail: 'B' })).toBe('B');
    expect(messageOf({ errors: ['C'] })).toBe('C');
    expect(messageOf({ errors: [{ title: 'D' }] })).toBe('D');
    expect(messageOf({ errors: { email: ['E'] } })).toBe('E');
    expect(messageOf({})).toBe('');
  });

  it('knows the services and sends tests only to a local endpoint', async () => {
    expect(isProviderId('brevo')).toBe(true);
    expect(isProviderId('sendgrid')).toBe(false);
    for (const id of ['brevo', 'mailchimp', 'mailerlite', 'kit', 'activecampaign'] as const)
      expect(providerOf(id, async () => ({ status: 200, text: '' })).id).toBe(id);
    expect(testEndpoint(undefined)).toBeNull();
    expect(testEndpoint('https://127.0.0.1:9')).toBeNull();
    expect(testEndpoint('http://example.com:9')).toBeNull();
    expect(testEndpoint('nonsense')).toBeNull();
    expect(testEndpoint('http://127.0.0.1:4010/')).toBe('http://127.0.0.1:4010');
    expect(
      redirectToTest('http://127.0.0.1:4010', {
        url: 'https://api.brevo.com/v3/contacts?x=1',
        method: 'GET',
        headers: {},
      }).url,
    ).toBe('http://127.0.0.1:4010/api.brevo.com/v3/contacts?x=1');
    // On a site: the core's client, with a timeout.
    const sent: unknown[] = [];
    const http = siteHttp(async (r) => {
      sent.push(r);
      return { status: 200, text: 'ok' };
    }, null);
    expect(
      await http({ url: 'https://api.brevo.com/v3/account', method: 'GET', headers: {} }),
    ).toEqual({
      status: 200,
      text: 'ok',
    });
    expect(sent[0]).toMatchObject({ timeoutMs: 15_000 });
  });
});
