/**
 * The roles of WordPress users on the new site (1.34.0): from the list of
 * `wp user list`, the `admins` option or the role of imported authors.
 */
import { describe, expect, it } from 'vitest';
import { assignRoles, mapWpRoles, parseAdmins, parseCsv, parseWpUserList } from './user-roles';
import { wxrToDocument } from './wxr';

const LIST = [
  'user_login,user_email,roles',
  'anna,anna@example.com,administrator',
  'bruno,bruno@example.com,"editor,administrator"',
  'carla,carla@example.com,"subscriber,shop_manager"',
  'dario,dario@example.com,customer',
  'elena,ELENA@example.com,seo_manager',
  'fabio,fabio@example.com,contributor',
  '',
].join('\r\n');

describe('the users list of WP-CLI', () => {
  it('reads CSV with quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n\r\nd,,e\n')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['d', '', 'e'],
    ]);
  });

  it('reads logins, emails and roles by their header, in any order', () => {
    expect(parseWpUserList(LIST)[1]).toEqual({
      login: 'bruno',
      email: 'bruno@example.com',
      roles: ['editor', 'administrator'],
    });
    expect(parseWpUserList('roles,user_email\nauthor,x@example.com')).toEqual([
      { login: '', email: 'x@example.com', roles: ['author'] },
    ]);
    expect(() => parseWpUserList('name,mail\na,b')).toThrow(/user_login/);
  });

  it('maps WordPress roles, the most powerful known one first', () => {
    expect(mapWpRoles(['administrator'])).toBe('administrator');
    expect(mapWpRoles(['editor', 'administrator'])).toBe('administrator');
    expect(mapWpRoles(['subscriber', 'shop_manager'])).toBe('editor');
    expect(mapWpRoles(['customer'])).toBe('subscriber');
    expect(mapWpRoles(['author'])).toBe('author');
    expect(mapWpRoles(['contributor'])).toBe('contributor');
    expect(mapWpRoles(['seo_manager'])).toBeNull();
    expect(mapWpRoles([])).toBeNull();
  });

  it('gives each author a role and says where it came from', () => {
    const authors = ['anna', 'bruno', 'carla', 'dario', 'elena', 'fabio', 'gino', 'hugo'].map(
      (login) => ({ login, email: `${login}@example.com`, displayName: login }),
    );
    // Elena's login differs from WordPress's list: she is found by her email.
    authors[4]!.login = 'elena.b';
    const users = assignRoles(authors, {
      authorRole: 'author',
      roles: parseWpUserList(LIST),
      admins: parseAdmins(' hugo@example.com , ,fabio'),
    });
    expect(users.map((u) => [u.login, u.role, u.source])).toEqual([
      ['anna', 'administrator', 'roles'],
      ['bruno', 'administrator', 'roles'],
      ['carla', 'editor', 'roles'],
      ['dario', 'subscriber', 'roles'],
      ['elena.b', 'author', 'default'],
      ['fabio', 'administrator', 'admins'],
      ['gino', 'author', 'default'],
      ['hugo', 'administrator', 'admins'],
    ]);
    expect(users[4]!.wordpressRoles).toEqual(['seo_manager']);
  });
});

describe('roles and language in the transfer document', () => {
  const author = (id: number, login: string) =>
    `<wp:author><wp:author_id>${id}</wp:author_id><wp:author_login>${login}</wp:author_login><wp:author_email>${login}@example.com</wp:author_email><wp:author_display_name>${login}</wp:author_display_name></wp:author>`;
  const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Site</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://s.example.com</wp:base_blog_url>
${author(1, 'anna')}${author(2, 'bruno')}${author(3, 'carla')}
</channel></rss>`;

  it('keeps WordPress administrators administrators, and gives new accounts the site language', () => {
    const { document, users, warnings } = wxrToDocument(xml, {
      locale: 'it',
      userLocale: 'it',
      authorRole: 'contributor',
      roles: parseWpUserList('user_login,user_email,roles\nanna,anna@example.com,administrator'),
      admins: ['bruno', 'zeta'],
    });
    expect(document.users?.map((u) => [u.email, u.role, u.locale])).toEqual([
      ['anna@example.com', 'administrator', 'it'],
      ['bruno@example.com', 'administrator', 'it'],
      ['carla@example.com', 'contributor', 'it'],
    ]);
    expect(users.map((u) => [u.login, u.source])).toEqual([
      ['anna', 'roles'],
      ['bruno', 'admins'],
      ['carla', 'default'],
    ]);
    expect(warnings).toContain('Administrator "zeta" is not an author of the export: left out.');
  });

  it('keeps the chosen role without a list', () => {
    const { document } = wxrToDocument(xml, { locale: 'en' });
    expect(document.users?.map((u) => u.role)).toEqual(['author', 'author', 'author']);
    expect(document.users?.[0]).not.toHaveProperty('locale');
  });
});
