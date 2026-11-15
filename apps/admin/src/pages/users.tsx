import type { MemberView, RoleView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useMe } from '../auth';
import { Avatar } from '../components/avatar';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { RolesCard } from './roles-card';
import { useTabParam } from '../components/use-tab';

const MEMBERS_KEY = ['users'] as const;

export function UsersPage() {
  const me = useMe();
  const { t } = useT();
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<MemberView[]>('GET', '/users'),
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleView[]>('GET', '/roles') });
  const canPromote = me.capabilities.includes('promote_users');

  // As in WordPress: All users, Administrators, Add New User (and Roles) in the Users submenu.
  const [tab, setTab] = useTabParam<'list' | 'admins' | 'add' | 'roles'>('list');
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ by: SortKey; desc: boolean }>({ by: 'name', desc: false });
  const all = members.data ?? [];
  const admins = all.filter((m) => m.role.slug === 'administrator');
  const tabs = [
    { id: 'list' as const, label: `${t('All users')} (${all.length})` },
    { id: 'admins' as const, label: `${t('Administrators')} (${admins.length})` },
    ...(canPromote ? [{ id: 'add' as const, label: t('Add New User') }] : []),
    { id: 'roles' as const, label: t('Roles') },
  ];
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (tab === 'admins' ? admins : all)
    .filter((m) => {
      const text = `${m.displayName} ${m.username ?? ''} ${m.email} ${m.role.name}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => {
      const order = compareMembers(a, b, sort.by) || compareMembers(a, b, 'name');
      return sort.desc ? -order : order;
    });
  const header = (key: SortKey, label: string) => (
    <th
      className="py-2 font-medium"
      aria-sort={sort.by === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-slate-900"
        onClick={() => setSort({ by: key, desc: sort.by === key ? !sort.desc : false })}
      >
        {label}
        <span aria-hidden="true" className="text-xs">
          {sort.by === key ? (sort.desc ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t('Users')}</h1>
      </div>
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-sky-700 font-medium text-sky-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'add' && canPromote && roles.data && (
        <InviteForm
          roles={roles.data}
          onAdded={(message) => {
            setNotice(message);
            setTab('list');
          }}
        />
      )}
      {(tab === 'list' || tab === 'admins') && notice && <Alert kind="success">{notice}</Alert>}
      {tab === 'roles' && <RolesCard />}
      {(tab === 'list' || tab === 'admins') && (
        <Card title={tab === 'admins' ? t('Administrators') : t('Members')}>
          {members.isPending && <p className="text-sm text-slate-600">{t('Loading…')}</p>}
          {members.error && <Alert>{errorMessage(members.error)}</Alert>}
          {members.data && (
            <div className="mb-3">
              <label className="sr-only" htmlFor="users-search">
                {t('Search users')}
              </label>
              <input
                id="users-search"
                type="search"
                className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
                placeholder={t('Search users')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          {members.data && shown.length === 0 && (
            <p className="text-sm text-slate-600">{t('No users found.')}</p>
          )}
          {members.data && shown.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  {header('name', t('Name'))}
                  {header('email', t('Email'))}
                  {header('role', t('Role'))}
                  {header('status', t('Status'))}
                  <th className="py-2 font-medium">
                    <span className="sr-only">{t('Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    roles={roles.data ?? []}
                    isSelf={member.id === me.user.id}
                    canPromote={canPromote}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

type SortKey = 'name' | 'email' | 'role' | 'status';

/** WordPress's roles from the most powerful; others (the site's own) after them, by name. */
const ROLE_RANK = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];

function compareMembers(a: MemberView, b: MemberView, by: SortKey): number {
  if (by === 'role') {
    const rank = (m: MemberView) => {
      const i = ROLE_RANK.indexOf(m.role.slug);
      return i < 0 ? ROLE_RANK.length : i;
    };
    return rank(a) - rank(b) || a.role.name.localeCompare(b.role.name);
  }
  const value = (m: MemberView) =>
    by === 'name' ? m.displayName : by === 'email' ? m.email : m.status;
  return value(a).localeCompare(value(b), undefined, { sensitivity: 'base' });
}

/** Users → Add New: an invitation, or an account with a password (as in WordPress). */
function InviteForm({
  roles,
  onAdded,
}: {
  roles: RoleView[];
  onAdded?: (message: string) => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('author');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const invite = useMutation({
    mutationFn: () =>
      api<MemberView>('POST', '/users/invite', {
        email,
        displayName,
        ...(username.trim() ? { username } : {}),
        role,
        ...(password ? { password } : {}),
        sendEmail,
      }),
    onSuccess: async (done) => {
      setEmail('');
      setDisplayName('');
      setUsername('');
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
      // As in WordPress: back to the list of users, with the news.
      onAdded?.(
        done.status === 'invited'
          ? sendEmail
            ? t('Invitation sent to {email}.', { email: done.email })
            : t('{email} was invited; no email was sent.', { email: done.email })
          : t('{email} can now sign in.', { email: done.email }),
      );
    },
  });
  const fieldError = (path: string) =>
    invite.error instanceof ApiError ? invite.error.fieldError(path) : undefined;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate();
  };

  const generate = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    setPassword(
      btoa(String.fromCharCode(...bytes))
        .replace(/[+/=]/g, '')
        .slice(0, 20),
    );
    setShowPassword(true);
  };

  const done = invite.data;
  return (
    <Card title={t('Add New User')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 md:grid-cols-4">
          <TextField
            label={t('Name')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            {...(fieldError('displayName') ? { error: fieldError('displayName') } : {})}
          />
          <TextField
            label={t('Username (optional)')}
            value={username}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
            {...(fieldError('username') ? { error: fieldError('username') } : {})}
          />
          <TextField
            label={t('Email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...(fieldError('email') ? { error: fieldError('email') } : {})}
          />
          <RoleSelect label={t('Role')} roles={roles} value={role} onChange={setRole} />
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <TextField
            label={t('Password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={t('Leave empty to send an invitation: the person chooses the password.')}
            {...(fieldError('password') ? { error: fieldError('password') } : {})}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={generate}>
              {t('Generate password')}
            </Button>
            {password && (
              <Button type="button" variant="secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? t('Hide') : t('Show')}
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            {password
              ? t('Send the new user an email about their account')
              : t('Send the invitation by email')}
          </label>
        </div>
        <Button type="submit" disabled={invite.isPending}>
          {password ? t('Add New User') : t('Send invitation')}
        </Button>
      </form>
      <div className="mt-3">
        {done && (
          <Alert kind="success">
            {done.status === 'invited'
              ? sendEmail
                ? t('Invitation sent to {email}.', { email: done.email })
                : t('{email} was invited; no email was sent.', { email: done.email })
              : t('{email} can now sign in.', { email: done.email })}
          </Alert>
        )}
        {invite.error &&
          !fieldError('email') &&
          !fieldError('displayName') &&
          !fieldError('password') && <Alert>{errorMessage(invite.error)}</Alert>}
      </div>
    </Card>
  );
}

function MemberRow({
  member,
  roles,
  isSelf,
  canPromote,
}: {
  member: MemberView;
  roles: RoleView[];
  isSelf: boolean;
  canPromote: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });

  const changeRole = useMutation({
    mutationFn: (role: string) => api<MemberView>('PATCH', `/users/${member.id}`, { role }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api<void>('DELETE', `/users/${member.id}`),
    onSuccess: refresh,
  });
  const error = changeRole.error ?? remove.error;

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2">
        <span className="flex items-center gap-2">
          <Avatar name={member.displayName} url={member.avatarUrl} />
          <span>
            {isSelf ? (
              member.displayName
            ) : (
              <Link
                to="/users/$id"
                params={{ id: member.id }}
                className="font-medium text-sky-700 hover:underline"
              >
                {member.displayName}
              </Link>
            )}
            {isSelf && <span className="ml-1 text-slate-500">{t('(you)')}</span>}
            {member.username && (
              <span className="block text-xs text-slate-500">{member.username}</span>
            )}
          </span>
        </span>
      </td>
      <td className="py-2">{member.email}</td>
      <td className="py-2">
        {canPromote && !isSelf ? (
          <RoleSelect
            label={t('Role of {name}', { name: member.displayName })}
            hideLabel
            roles={roles}
            value={member.role.slug}
            onChange={(role) => changeRole.mutate(role)}
          />
        ) : (
          member.role.name
        )}
        {error && <p className="mt-1 text-xs text-red-700">{errorMessage(error)}</p>}
      </td>
      <td className="py-2">
        {member.status === 'invited' ? t('Invitation pending') : t(member.status)}
      </td>
      <td className="py-2 text-right">
        {!isSelf && (
          <Link
            to="/users/$id"
            params={{ id: member.id }}
            className="mr-2 inline-block rounded px-2 py-1 text-sm text-sky-700 hover:underline"
          >
            {t('Edit')}
          </Link>
        )}
        {!isSelf && (
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t('Remove {name} from this site?', { name: member.displayName })))
                remove.mutate();
            }}
          >
            {t('Remove')}
          </Button>
        )}
      </td>
    </tr>
  );
}

function RoleSelect({
  label,
  hideLabel = false,
  roles,
  value,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  roles: RoleView[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className={hideLabel ? 'sr-only' : 'block font-medium text-slate-800'}>{label}</span>
      <select
        className="w-full rounded border border-slate-300 bg-white px-2 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {roles.map((role) => (
          <option key={role.id} value={role.slug}>
            {role.name}
          </option>
        ))}
      </select>
    </label>
  );
}
