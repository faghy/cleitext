/**
 * The roles of WordPress users on the new site (1.34.0). The export (WXR)
 * names the authors but not their roles: they come from the list WP-CLI
 * prints (`wp user list --fields=user_login,user_email,roles --format=csv`),
 * from the `admins` option, or else the role chosen for imported authors.
 * WordPress administrators stay administrators.
 */

/** Cleitext roles, the most powerful first: the first known role of a user wins. */
export const ROLE_PRIORITY = [
  'administrator',
  'editor',
  'author',
  'contributor',
  'subscriber',
] as const;
export type MappedRole = (typeof ROLE_PRIORITY)[number];

/** WordPress roles (WooCommerce's included) and the Cleitext role they become. */
export const WP_ROLES: Record<string, MappedRole> = {
  administrator: 'administrator',
  editor: 'editor',
  author: 'author',
  contributor: 'contributor',
  subscriber: 'subscriber',
  shop_manager: 'editor',
  customer: 'subscriber',
};

/** A row of `wp user list`. */
export interface WpUserRoles {
  login: string;
  email: string;
  /** WordPress role slugs, as listed. */
  roles: string[];
}

/** Where the role of an imported user came from. */
export type RoleSource = 'roles' | 'admins' | 'default';

/** An imported user and the role given on the site (the import's report). */
export interface ImportedUser {
  login: string;
  email: string;
  displayName: string;
  role: string;
  source: RoleSource;
  /** Their roles in WordPress, when the list had them. */
  wordpressRoles?: string[];
}

/** The rows of a CSV text (RFC 4180: quoted fields, "" inside quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * The users of `wp user list --fields=user_login,user_email,roles --format=csv`
 * (a header row first; `roles` may hold several, comma-separated). Columns
 * are found by their header (`user_login`/`login`, `user_email`/`email`,
 * `roles`/`role`), so their order does not matter. Throws when the text is
 * not such a list.
 */
export function parseWpUserList(text: string): WpUserRoles[] {
  const rows = parseCsv(text.trim());
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const column = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const login = column('user_login', 'login');
  const email = column('user_email', 'email');
  const roles = column('roles', 'role');
  if (roles < 0 || (login < 0 && email < 0)) {
    throw new Error(
      'The users list needs a header with user_login (or user_email) and roles: wp user list --fields=user_login,user_email,roles --format=csv',
    );
  }
  return rows.slice(1).map((row) => ({
    login: login >= 0 ? (row[login] ?? '').trim() : '',
    email: email >= 0 ? (row[email] ?? '').trim() : '',
    roles: (row[roles] ?? '')
      .split(/[,\s]+/)
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean),
  }));
}

/** The Cleitext role of a user with these WordPress roles: the highest known, or null. */
export function mapWpRoles(roles: string[]): MappedRole | null {
  const mapped = new Set(roles.map((r) => WP_ROLES[r.toLowerCase()]).filter(Boolean));
  return ROLE_PRIORITY.find((r) => mapped.has(r)) ?? null;
}

/** `admins=login1,login2` (logins or emails). */
export function parseAdmins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 500);
}

/**
 * The role of each author of the export: from the `admins` option, then
 * from the users list (matched by login, then by email), else `authorRole`.
 * A user whose WordPress roles are all unknown gets `authorRole` too.
 */
export function assignRoles(
  authors: { login: string; email: string; displayName: string }[],
  options: { authorRole: string; roles?: WpUserRoles[]; admins?: string[] },
): ImportedUser[] {
  const byLogin = new Map<string, WpUserRoles>();
  const byEmail = new Map<string, WpUserRoles>();
  for (const row of options.roles ?? []) {
    if (row.login && !byLogin.has(row.login.toLowerCase()))
      byLogin.set(row.login.toLowerCase(), row);
    if (row.email && !byEmail.has(row.email.toLowerCase()))
      byEmail.set(row.email.toLowerCase(), row);
  }
  const admins = new Set((options.admins ?? []).map((a) => a.toLowerCase()));
  return authors.map((author) => {
    const base = { login: author.login, email: author.email, displayName: author.displayName };
    const login = author.login.toLowerCase();
    const email = author.email.toLowerCase();
    if (admins.has(login) || (email && admins.has(email))) {
      return { ...base, role: 'administrator', source: 'admins' as const };
    }
    const row = byLogin.get(login) ?? (email ? byEmail.get(email) : undefined);
    const mapped = row ? mapWpRoles(row.roles) : null;
    if (row && mapped) {
      return { ...base, role: mapped, source: 'roles' as const, wordpressRoles: row.roles };
    }
    return {
      ...base,
      role: options.authorRole,
      source: 'default' as const,
      ...(row ? { wordpressRoles: row.roles } : {}),
    };
  });
}
