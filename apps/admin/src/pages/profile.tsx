import type { SessionView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

export function ProfilePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsCard />
        <PasswordCard />
      </div>
      <SessionsCard />
    </div>
  );
}

function DetailsCard() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(me.user.displayName);
  const [locale, setLocale] = useState(me.user.locale);

  const save = useMutation({
    mutationFn: () => api('PATCH', '/profile', { displayName, locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });

  return (
    <Card title="Your details">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label="Email" value={me.user.email} disabled />
        <TextField
          label="Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">Admin language</span>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-2"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </label>
        {save.isSuccess && <Alert kind="success">Saved.</Alert>}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');

  const change = useMutation({
    mutationFn: () => api<void>('POST', '/profile/password', { currentPassword, newPassword }),
    onSuccess: async () => {
      setCurrent('');
      setNew('');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  const newPasswordError =
    change.error instanceof ApiError ? change.error.fieldError('newPassword') : undefined;

  return (
    <Card title="Change password">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          hint="At least 12 characters. Other devices will be signed out."
          {...(newPasswordError ? { error: newPasswordError } : {})}
        />
        {change.isSuccess && <Alert kind="success">Password changed.</Alert>}
        {change.error && !newPasswordError && <Alert>{errorMessage(change.error)}</Alert>}
        <Button type="submit" disabled={change.isPending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<SessionView[]>('GET', '/profile/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/profile/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return (
    <Card title="Active sessions">
      {sessions.error && <Alert>{errorMessage(sessions.error)}</Alert>}
      <ul className="divide-y divide-slate-100 text-sm">
        {sessions.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <p className="truncate">{s.userAgent ?? 'Unknown device'}</p>
              <p className="text-xs text-slate-500">
                {s.ip ?? 'unknown address'} · last active {new Date(s.lastSeenAt).toLocaleString()}
              </p>
            </div>
            {s.current ? (
              <span className="text-xs text-emerald-700">This device</span>
            ) : (
              <Button
                variant="secondary"
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
