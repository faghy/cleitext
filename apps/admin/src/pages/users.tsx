import type { MemberView, RoleView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

const MEMBERS_KEY = ['users'] as const;

export function UsersPage() {
  const me = useMe();
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<MemberView[]>('GET', '/users'),
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleView[]>('GET', '/roles') });
  const canPromote = me.capabilities.includes('promote_users');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      {canPromote && roles.data && <InviteForm roles={roles.data} />}
      <Card title="Members">
        {members.isPending && <p className="text-sm text-slate-600">Loading…</p>}
        {members.error && <Alert>{errorMessage(members.error)}</Alert>}
        {members.data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.data.map((member) => (
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
    </div>
  );
}

/** Users → Add New: an invitation, or an account with a password (as in WordPress). */
function InviteForm({ roles }: { roles: RoleView[] }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('author');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const invite = useMutation({
    mutationFn: () =>
      api<MemberView>('POST', '/users/invite', {
        email,
        displayName,
        role,
        ...(password ? { password } : {}),
        sendEmail,
      }),
    onSuccess: async () => {
      setEmail('');
      setDisplayName('');
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
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
    <Card title="Add New User">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label="Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            {...(fieldError('displayName') ? { error: fieldError('displayName') } : {})}
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...(fieldError('email') ? { error: fieldError('email') } : {})}
          />
          <RoleSelect label="Role" roles={roles} value={role} onChange={setRole} />
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Leave empty to send an invitation: the person chooses the password."
            {...(fieldError('password') ? { error: fieldError('password') } : {})}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={generate}>
              Generate password
            </Button>
            {password && (
              <Button type="button" variant="secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Hide' : 'Show'}
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
              ? 'Send the new user an email about their account'
              : 'Send the invitation by email'}
          </label>
        </div>
        <Button type="submit" disabled={invite.isPending}>
          {password ? 'Add New User' : 'Send invitation'}
        </Button>
      </form>
      <div className="mt-3">
        {done && (
          <Alert kind="success">
            {done.status === 'invited'
              ? sendEmail
                ? `Invitation sent to ${done.email}.`
                : `${done.email} was invited; no email was sent.`
              : `${done.email} can now sign in.`}
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
        {member.displayName}
        {isSelf && <span className="ml-1 text-slate-500">(you)</span>}
      </td>
      <td className="py-2">{member.email}</td>
      <td className="py-2">
        {canPromote && !isSelf ? (
          <RoleSelect
            label={`Role of ${member.displayName}`}
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
      <td className="py-2">{member.status === 'invited' ? 'Invitation pending' : member.status}</td>
      <td className="py-2 text-right">
        {!isSelf && (
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${member.displayName} from this site?`)) remove.mutate();
            }}
          >
            Remove
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
