import type { MemberAccountView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { Avatar } from '../components/avatar';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

// Section routes are made at run time: their paths are plain strings.
const USERS: string = '/users';
const PROFILE: string = '/profile';

/** Users → Edit: a member's account, as WordPress's "Edit User" (RF-USR-10). */
export function UserEditPage({ id }: { id: string }) {
  const { t } = useT();
  const account = useQuery({
    queryKey: ['users', id],
    queryFn: () => api<MemberAccountView>('GET', `/users/${id}`),
  });

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link to={USERS} className="text-sky-700 hover:underline">
          ← {t('Users')}
        </Link>
      </p>
      {account.error && <Alert>{errorMessage(account.error)}</Alert>}
      {account.data && <AccountForms account={account.data} />}
    </div>
  );
}

function AccountForms({ account }: { account: MemberAccountView }) {
  const { t } = useT();
  const locked = account.locked;
  const reason = {
    self: t('This is your account: change it from your profile.'),
    role: t('This person has permissions you do not have: you cannot change their account.'),
    shared: t(
      'This person also belongs to other sites: only they, or a super admin, can change their account.',
    ),
    super_admin: t('Only super admins can change the account of a super admin.'),
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={account.displayName} url={account.avatarUrl} />
        <div>
          <h1 className="text-2xl font-semibold">
            {t('Edit {name}', { name: account.displayName })}
          </h1>
          <p className="text-sm text-slate-600">
            {account.role.name}
            {account.twoFactor ? ` · ${t('Two-factor authentication on')}` : ''}
          </p>
        </div>
      </div>
      {locked && (
        <p
          role="note"
          className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
        >
          {reason[locked]}{' '}
          {locked === 'self' && (
            <Link to={PROFILE} className="text-sky-700 hover:underline">
              {t('Profile')}
            </Link>
          )}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsForm account={account} disabled={Boolean(locked)} />
        <PasswordForm account={account} disabled={Boolean(locked)} />
      </div>
    </>
  );
}

function useSave(account: MemberAccountView) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<MemberAccountView>('PATCH', `/users/${account.id}/account`, body),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['users', account.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['users'], exact: true });
    },
  });
}

function DetailsForm({ account, disabled }: { account: MemberAccountView; disabled: boolean }) {
  const { t } = useT();
  const [values, setValues] = useState({
    displayName: account.displayName,
    email: account.email,
    locale: account.locale,
    bio: account.bio,
    website: account.website,
    slug: account.slug,
  });
  const [notify, setNotify] = useState(true);
  const save = useSave(account);
  const fieldError = (path: string) =>
    save.error instanceof ApiError ? save.error.fieldError(path) : undefined;
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const emailChanged = values.email.trim().toLowerCase() !== account.email.toLowerCase();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ ...values, ...(emailChanged ? { notify } : {}) });
  };

  return (
    <Card title={t('Account')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset disabled={disabled} className="space-y-4">
          <TextField
            label={t('Name')}
            value={values.displayName}
            onChange={(e) => set('displayName')(e.target.value)}
            {...(fieldError('displayName') ? { error: fieldError('displayName') } : {})}
          />
          <TextField
            label={t('Email')}
            type="email"
            value={values.email}
            onChange={(e) => set('email')(e.target.value)}
            {...(fieldError('email') ? { error: fieldError('email') } : {})}
          />
          {emailChanged && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              {t('Tell the person at the old and the new address')}
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span className="block font-medium text-slate-800">{t('Admin language')}</span>
            <select
              className="w-full rounded border border-slate-300 bg-white px-2 py-2"
              value={values.locale}
              onChange={(e) => set('locale')(e.target.value)}
            >
              <option value="en">English</option>
              <option value="it">Italiano</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="block font-medium text-slate-800">{t('Biographical info')}</span>
            <textarea
              className="w-full rounded border border-slate-300 p-2"
              rows={4}
              maxLength={2000}
              value={values.bio}
              onChange={(e) => set('bio')(e.target.value)}
            />
          </label>
          <TextField
            label={t('Website')}
            type="url"
            placeholder="https://"
            value={values.website}
            onChange={(e) => set('website')(e.target.value)}
            {...(fieldError('website') ? { error: fieldError('website') } : {})}
          />
          <TextField
            label={t('Author page address')}
            value={values.slug}
            onChange={(e) => set('slug')(e.target.value)}
            hint={`/author/${values.slug || '…'}`}
            {...(fieldError('slug') ? { error: fieldError('slug') } : {})}
          />
          {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
          {save.error &&
            !fieldError('email') &&
            !fieldError('displayName') &&
            !fieldError('website') &&
            !fieldError('slug') && <Alert>{errorMessage(save.error)}</Alert>}
          <Button type="submit" disabled={save.isPending}>
            {t('Save')}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

function PasswordForm({ account, disabled }: { account: MemberAccountView; disabled: boolean }) {
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [notify, setNotify] = useState(true);
  const save = useSave(account);
  const fieldError = save.error instanceof ApiError ? save.error.fieldError('password') : undefined;

  const generate = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    setPassword(
      btoa(String.fromCharCode(...bytes))
        .replace(/[+/=]/g, '')
        .slice(0, 20),
    );
    setShow(true);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ password, notify }, { onSuccess: () => setPassword('') });
  };

  return (
    <Card title={t('Password')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset disabled={disabled} className="space-y-4">
          <p className="text-sm text-slate-600">
            {account.hasPassword
              ? t('Set a new password: the person is signed out everywhere and signs in with it.')
              : t(
                  'This person signs in without a password (passkeys or invitation): you can set one.',
                )}
          </p>
          <TextField
            label={t('New password')}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...(fieldError ? { error: fieldError } : {})}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={generate}>
              {t('Generate password')}
            </Button>
            {password && (
              <Button type="button" variant="secondary" onClick={() => setShow((v) => !v)}>
                {show ? t('Hide') : t('Show')}
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            {t('Tell the person by email (the password is not sent)')}
          </label>
          {save.isSuccess && <Alert kind="success">{t('Password changed.')}</Alert>}
          {save.error && !fieldError && <Alert>{errorMessage(save.error)}</Alert>}
          <Button type="submit" disabled={save.isPending || !password}>
            {t('Set password')}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
