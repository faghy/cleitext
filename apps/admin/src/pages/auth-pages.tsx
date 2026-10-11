import type { MeResponse, TwoFactorChallenge } from '@cleitext/shared';
import { PASSWORD_MIN_LENGTH } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY } from '../auth';
import { Alert, AuthShell, Button, TextField, useT } from '../components/ui';

export function LoginPage({ redirect }: { redirect?: string | undefined }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);

  const signedIn = async (me: MeResponse) => {
    queryClient.setQueryData(ME_QUERY_KEY, me);
    // Connecting an AI assistant: back to its consent page, outside the admin.
    if (redirect?.startsWith('/oauth/authorize?')) {
      window.location.assign(redirect);
      return;
    }
    await navigate({ to: safeRedirect(redirect) });
  };
  const login = useMutation({
    mutationFn: () =>
      api<MeResponse | TwoFactorChallenge>('POST', '/auth/login', { email, password, remember }),
    onSuccess: async (result) => {
      if ('twoFactorRequired' in result) setChallenge(result.challenge);
      else await signedIn(result);
    },
  });

  const passkey = useMutation({
    mutationFn: async () => {
      const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
        'POST',
        '/auth/passkey/options',
      );
      const response = await startAuthentication({ optionsJSON });
      return api<MeResponse>('POST', '/auth/passkey/verify', { response });
    },
    onSuccess: signedIn,
  });

  if (challenge) {
    return (
      <TwoFactorStep
        challenge={challenge}
        onSignedIn={signedIn}
        onExpired={() => {
          setChallenge(null);
          setPassword('');
        }}
      />
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  const error = login.error;
  return (
    <AuthShell title={t('Sign in')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert>
            {error instanceof ApiError && error.status === 429
              ? t('Too many failed attempts. Wait a few minutes and try again.')
              : errorMessage(error)}
          </Alert>
        )}
        <TextField
          label={t('Email')}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('Password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {t('Remember me')}
        </label>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t('Signing in…') : t('Sign in')}
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-sky-700 hover:underline">
            {t('Lost your password?')}
          </Link>
        </p>
      </form>
      {browserSupportsWebAuthn() && (
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          {passkey.error && (
            <Alert>
              {passkey.error instanceof Error && passkey.error.name === 'NotAllowedError'
                ? t('The passkey prompt was cancelled or timed out.')
                : errorMessage(passkey.error)}
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            disabled={passkey.isPending}
            onClick={() => passkey.mutate()}
          >
            {t('Use a passkey')}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}

/** Second sign-in step: a code from the authenticator app, or a recovery code. */
function TwoFactorStep({
  challenge,
  onSignedIn,
  onExpired,
}: {
  challenge: string;
  onSignedIn: (me: MeResponse) => Promise<void>;
  onExpired: () => void;
}) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () => api<MeResponse>('POST', '/auth/2fa', { challenge, code }),
    onSuccess: onSignedIn,
  });
  const error = verify.error;
  return (
    <AuthShell title={t('Two-factor authentication')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          {t('Enter the code shown by your authenticator app, or one of your recovery codes.')}
        </p>
        {error && (
          <Alert>
            {error instanceof ApiError && error.status === 429
              ? t('Too many failed attempts. Wait a few minutes and try again.')
              : errorMessage(error)}
          </Alert>
        )}
        <TextField
          label={t('Authentication code')}
          autoComplete="one-time-code"
          inputMode="text"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={verify.isPending || !code.trim()}>
          {t('Verify')}
        </Button>
        <p className="text-center text-sm">
          <button type="button" className="text-sky-700 hover:underline" onClick={onExpired}>
            {t('Back to sign in')}
          </button>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const request = useMutation({
    mutationFn: () => api<{ message: string }>('POST', '/auth/password/forgot', { email }),
  });

  return (
    <AuthShell title={t('Reset your password')}>
      {request.isSuccess ? (
        <div className="space-y-4">
          <Alert kind="success">{request.data.message}</Alert>
          <BackToLogin />
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <p className="text-sm text-slate-600">
            {t('Enter your email address: we will send you a link to choose a new password.')}
          </p>
          {request.error && <Alert>{errorMessage(request.error)}</Alert>}
          <TextField
            label={t('Email')}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={request.isPending}>
            {t('Send reset link')}
          </Button>
          <BackToLogin />
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const { t } = useT();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api<void>('POST', '/auth/password/reset', { token, password }),
  });

  return (
    <AuthShell title={t('Choose a new password')}>
      {reset.isSuccess ? (
        <div className="space-y-4">
          <Alert kind="success">{t('Your password has been changed. You can now sign in.')}</Alert>
          <BackToLogin />
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          {reset.error &&
            !(reset.error instanceof ApiError && reset.error.fieldError('password')) && (
              <Alert>{errorMessage(reset.error)}</Alert>
            )}
          <NewPasswordField
            value={password}
            onChange={setPassword}
            error={reset.error instanceof ApiError ? reset.error.fieldError('password') : undefined}
          />
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {t('Save password')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function AcceptInvitePage({ token }: { token: string }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);

  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      api<{ email: string; displayName: string; siteName: string }>(
        'GET',
        `/auth/invitation?token=${encodeURIComponent(token)}`,
      ),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      api<MeResponse>('POST', '/auth/invitation/accept', {
        token,
        password,
        ...(displayName ? { displayName } : {}),
      }),
    onSuccess: async (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      await navigate({ to: '/' });
    },
  });

  if (invitation.isPending) return <AuthShell title={t('Invitation')}>{t('Loading…')}</AuthShell>;
  if (invitation.isError) {
    return (
      <AuthShell title={t('Invitation')}>
        <div className="space-y-4">
          <Alert>{errorMessage(invitation.error)}</Alert>
          <BackToLogin />
        </div>
      </AuthShell>
    );
  }

  const [joiningBefore, joiningAfter] = t(
    'You are joining as {email}. Choose a password to finish.',
  ).split('{email}');
  return (
    <AuthShell title={t('Join {site}', { site: invitation.data.siteName })}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          {joiningBefore}
          <strong>{invitation.data.email}</strong>
          {joiningAfter}
        </p>
        {accept.error &&
          !(accept.error instanceof ApiError && accept.error.fieldError('password')) && (
            <Alert>{errorMessage(accept.error)}</Alert>
          )}
        <TextField
          label={t('Your name')}
          autoComplete="name"
          value={displayName ?? invitation.data.displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <NewPasswordField
          value={password}
          onChange={setPassword}
          error={accept.error instanceof ApiError ? accept.error.fieldError('password') : undefined}
        />
        <Button type="submit" className="w-full" disabled={accept.isPending}>
          {t('Accept invitation')}
        </Button>
      </form>
    </AuthShell>
  );
}

function NewPasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const { t } = useT();
  return (
    <TextField
      label={t('New password')}
      type="password"
      autoComplete="new-password"
      required
      minLength={PASSWORD_MIN_LENGTH}
      hint={t('At least {count} characters. A short sentence works well.', {
        count: PASSWORD_MIN_LENGTH,
      })}
      {...(error ? { error } : {})}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Where to go after signing in: only same-app paths (no open redirects),
 * relative to the router base path.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
  return target.replace(/^\/admin(?=\/|$)/, '') || '/';
}

function BackToLogin() {
  const { t } = useT();
  return (
    <p className="text-center text-sm">
      <Link to="/login" className="text-sky-700 hover:underline">
        {t('Back to sign in')}
      </Link>
    </p>
  );
}
