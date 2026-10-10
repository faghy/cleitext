import type { SessionView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, ApiError, errorMessage, uploadFile } from '../api';
import { Avatar } from '../components/avatar';
import { TwoFactorCard } from './two-factor-card';
import { PasskeysCard } from './passkeys-card';
import { ApiTokensCard } from './api-tokens-card';
import { applyTheme, themePreference, type ThemePreference } from '../theme';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

export function ProfilePage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Profile')}</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsCard />
        <div className="space-y-6">
          <AvatarCard />
          <PasswordCard />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <TwoFactorCard />
        <PasskeysCard />
      </div>
      <ApiTokensCard />
      <SessionsCard />
    </div>
  );
}

function DetailsCard() {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(me.user.displayName);
  const [locale, setLocale] = useState(me.user.locale);
  const [theme, setTheme] = useState<ThemePreference>(themePreference);

  const save = useMutation({
    mutationFn: () => api('PATCH', '/profile', { displayName, locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });

  return (
    <Card title={t('Your details')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label={t('Email')} value={me.user.email} disabled />
        <TextField
          label={t('Name')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t('Admin language')}</span>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-2"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t('Color scheme')}</span>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-2"
            value={theme}
            onChange={(e) => {
              const next = e.target.value as ThemePreference;
              setTheme(next);
              applyTheme(next);
            }}
            aria-describedby="theme-help"
          >
            <option value="system">{t('Same as the system')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
          <span id="theme-help" className="block text-xs text-slate-500">
            {t('Applied right away, on this browser.')}
          </span>
        </label>
        {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        <Button type="submit" disabled={save.isPending}>
          {t('Save')}
        </Button>
      </form>
    </Card>
  );
}

/** Profile picture (RF-USR-07): cropped to a square by the server. */
function AvatarCard() {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const done = () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadFile<{ avatarUrl: string }>(file, { path: '/profile/avatar' }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api<{ avatarUrl: null }>('DELETE', '/profile/avatar'),
    onSuccess: done,
  });
  const error = upload.error ?? remove.error;

  return (
    <Card title={t('Profile picture')}>
      <div className="flex items-center gap-4">
        <Avatar name={me.user.displayName} url={me.user.avatarUrl} size={96} />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending
                ? t('Uploading…')
                : me.user.avatarUrl
                  ? t('Change picture')
                  : t('Upload picture')}
            </Button>
            {me.user.avatarUrl && (
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('Remove picture')}
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {t('JPEG, PNG, GIF, WebP or AVIF. It is cropped to a square.')}
          </p>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            aria-label={t('Profile picture file')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const { t } = useT();
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
    <Card title={t('Change password')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <TextField
          label={t('Current password')}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label={t('New password')}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          hint={t('At least 12 characters. Other devices will be signed out.')}
          {...(newPasswordError ? { error: newPasswordError } : {})}
        />
        {change.isSuccess && <Alert kind="success">{t('Password changed.')}</Alert>}
        {change.error && !newPasswordError && <Alert>{errorMessage(change.error)}</Alert>}
        <Button type="submit" disabled={change.isPending}>
          {t('Change password')}
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const { t } = useT();
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
    <Card title={t('Active sessions')}>
      {sessions.error && <Alert>{errorMessage(sessions.error)}</Alert>}
      <ul className="divide-y divide-slate-100 text-sm">
        {sessions.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <p className="truncate">{s.userAgent ?? t('Unknown device')}</p>
              <p className="text-xs text-slate-500">
                {s.ip ?? t('unknown address')} ·{' '}
                {t('last active {time}', { time: new Date(s.lastSeenAt).toLocaleString() })}
              </p>
            </div>
            {s.current ? (
              <span className="text-xs text-emerald-700">{t('This device')}</span>
            ) : (
              <Button
                variant="secondary"
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending}
              >
                {t('Sign out')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
