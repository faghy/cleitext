import type { MeResponse } from '@cleitext/shared';
import { PASSWORD_MIN_LENGTH } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY } from '../auth';
import { Alert, AuthShell, Button, TextField } from '../components/ui';

export function LoginPage({ redirect }: { redirect?: string | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  const login = useMutation({
    mutationFn: () => api<MeResponse>('POST', '/auth/login', { email, password, remember }),
    onSuccess: async (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      await navigate({ to: safeRedirect(redirect) });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  const error = login.error;
  return (
    <AuthShell title="Sign in">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert>
            {error instanceof ApiError && error.status === 429
              ? 'Too many failed attempts. Wait a few minutes and try again.'
              : errorMessage(error)}
          </Alert>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
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
          Remember me
        </label>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-sky-700 hover:underline">
            Lost your password?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const request = useMutation({
    mutationFn: () => api<{ message: string }>('POST', '/auth/password/forgot', { email }),
  });

  return (
    <AuthShell title="Reset your password">
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
            Enter your email address: we will send you a link to choose a new password.
          </p>
          {request.error && <Alert>{errorMessage(request.error)}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={request.isPending}>
            Send reset link
          </Button>
          <BackToLogin />
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api<void>('POST', '/auth/password/reset', { token, password }),
  });

  return (
    <AuthShell title="Choose a new password">
      {reset.isSuccess ? (
        <div className="space-y-4">
          <Alert kind="success">Your password has been changed. You can now sign in.</Alert>
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
            Save password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function AcceptInvitePage({ token }: { token: string }) {
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

  if (invitation.isPending) return <AuthShell title="Invitation">Loading…</AuthShell>;
  if (invitation.isError) {
    return (
      <AuthShell title="Invitation">
        <div className="space-y-4">
          <Alert>{errorMessage(invitation.error)}</Alert>
          <BackToLogin />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${invitation.data.siteName}`}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          You are joining as <strong>{invitation.data.email}</strong>. Choose a password to finish.
        </p>
        {accept.error &&
          !(accept.error instanceof ApiError && accept.error.fieldError('password')) && (
            <Alert>{errorMessage(accept.error)}</Alert>
          )}
        <TextField
          label="Your name"
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
          Accept invitation
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
  return (
    <TextField
      label="New password"
      type="password"
      autoComplete="new-password"
      required
      minLength={PASSWORD_MIN_LENGTH}
      hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
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
  return (
    <p className="text-center text-sm">
      <Link to="/login" className="text-sky-700 hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
