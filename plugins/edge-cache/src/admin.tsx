import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface PurgeResult {
  target: 'varnish' | 'cloudflare';
  ok: boolean;
  detail: string;
  error?: string;
}

interface Status {
  settings: {
    varnish: boolean;
    varnish_url: string;
    cloudflare: boolean;
    cloudflare_zone: string;
    ttl: number;
  };
  cloudflareToken: boolean;
  hosts: string[];
  log: { at: string; what: string; results: PurgeResult[] }[];
  vcl: string;
  cloudflareRule: string | null;
}

const T = {
  en: {
    title: 'Edge cache',
    intro:
      'Public pages are kept by Varnish or Cloudflare, in front of Cleitext, and purged from them as soon as they change. The admin, the API and signed-in users are never cached.',
    off: 'No cache is turned on: choose Varnish or Cloudflare in Settings → Edge cache.',
    varnish: 'Varnish',
    cloudflare: 'Cloudflare',
    on: 'on',
    notOn: 'off',
    hosts: 'Addresses of the site seen so far',
    noHosts: 'None yet: they appear after the first visits.',
    purgeAll: 'Purge the whole site',
    check: 'Check the home page',
    token: 'Cloudflare API token',
    tokenHint:
      'A token with the permission Zone → Cache Purge → Purge for this zone. It is kept encrypted.',
    tokenSet: 'A token is set.',
    save: 'Save token',
    remove: 'Remove token',
    log: 'Latest purges',
    noLog: 'None yet.',
    all: 'whole site',
    vcl: 'Rules for the Varnish VCL',
    vclHint: 'For whoever manages the server: they go in the VCL used by this site.',
    rule: 'Cloudflare Cache Rule',
    ruleHint:
      'Caching → Cache Rules → Create rule: "Custom filter expression" with this expression, then "Eligible for cache", Edge TTL "Use cache-control header if present", Browser TTL "Respect origin".',
    copy: 'Copy',
    seen: 'What visitors get (asked twice)',
  },
  it: {
    title: 'Cache esterna',
    intro:
      'Le pagine pubbliche vengono tenute da Varnish o da Cloudflare, davanti a Cleitext, e tolte dalla cache appena cambiano. L’admin, l’API e chi ha fatto il login non vanno mai in cache.',
    off: 'Nessuna cache attiva: scegli Varnish o Cloudflare in Impostazioni → Cache esterna.',
    varnish: 'Varnish',
    cloudflare: 'Cloudflare',
    on: 'attiva',
    notOn: 'spenta',
    hosts: 'Indirizzi del sito visti finora',
    noHosts: 'Ancora nessuno: compaiono dopo le prime visite.',
    purgeAll: 'Svuota tutto il sito',
    check: 'Controlla la home page',
    token: 'Token API di Cloudflare',
    tokenHint:
      'Un token con il permesso Zona → Eliminazione cache → Elimina per questa zona. Viene conservato cifrato.',
    tokenSet: 'Il token è impostato.',
    save: 'Salva il token',
    remove: 'Rimuovi il token',
    log: 'Ultimi svuotamenti',
    noLog: 'Ancora nessuno.',
    all: 'tutto il sito',
    vcl: 'Regole per la VCL di Varnish',
    vclHint: 'Per chi gestisce il server: vanno nella VCL usata da questo sito.',
    rule: 'Cache Rule di Cloudflare',
    ruleHint:
      'Caching → Cache Rules → Crea regola: "Espressione filtro personalizzata" con questa espressione, poi "Idoneo per la cache", Edge TTL "Usa l’header cache-control se presente", Browser TTL "Rispetta l’origine".',
    copy: 'Copia',
    seen: 'Cosa riceve un visitatore (chiesto due volte)',
  },
};

function Code({ text, copy }: { text: string; copy: string }) {
  return (
    <div className="space-y-2">
      <pre className="max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
        {text}
      </pre>
      <Button
        variant="secondary"
        type="button"
        onClick={() => void navigator.clipboard?.writeText(text)}
      >
        {copy}
      </Button>
    </div>
  );
}

function EdgeCachePage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? T.it : T.en;
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['edge-cache', 'status'],
    queryFn: () => api<Status>('GET', '/status'),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['edge-cache'] });
  const [token, setToken] = useState('');
  const saveToken = useMutation({
    mutationFn: () => api('PUT', '/cloudflare-token', { token }),
    onSuccess: () => {
      setToken('');
      void refresh();
    },
  });
  const removeToken = useMutation({
    mutationFn: () => api('DELETE', '/cloudflare-token'),
    onSuccess: refresh,
  });
  const purge = useMutation({ mutationFn: () => api('POST', '/purge'), onSuccess: refresh });
  const check = useMutation({
    mutationFn: () => api<{ seen: Record<string, string>[]; error?: string }>('POST', '/check'),
  });

  if (status.isError) return <Alert kind="error">{errorMessage(status.error)}</Alert>;
  if (!status.data) return <p className="text-sm text-slate-500">…</p>;
  const s = status.data;
  const anyOn = s.settings.varnish || s.settings.cloudflare;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-slate-700">{t.intro}</p>
      {!anyOn && <Alert kind="error">{t.off}</Alert>}

      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="font-medium">{t.varnish}</dt>
          <dd>{s.settings.varnish ? `${t.on} · ${s.settings.varnish_url || '—'}` : t.notOn}</dd>
          <dt className="font-medium">{t.cloudflare}</dt>
          <dd>
            {s.settings.cloudflare ? `${t.on} · ${s.settings.cloudflare_zone || '—'}` : t.notOn}
          </dd>
          <dt className="font-medium">{t.hosts}</dt>
          <dd>{s.hosts.length > 0 ? s.hosts.join(', ') : t.noHosts}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!anyOn || purge.isPending} onClick={() => purge.mutate()}>
            {t.purgeAll}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            {t.check}
          </Button>
        </div>
        {purge.isError && <Alert kind="error">{errorMessage(purge.error)}</Alert>}
        {check.data && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-medium">{t.seen}</p>
            {check.data.error && <Alert kind="error">{check.data.error}</Alert>}
            {check.data.seen.map((headers, i) => (
              <pre key={i} className="overflow-auto rounded bg-slate-100 p-2 text-xs">
                {Object.entries(headers)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join('\n')}
              </pre>
            ))}
          </div>
        )}
      </Card>

      {s.settings.cloudflare && (
        <Card title={t.token}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveToken.mutate();
            }}
          >
            {s.cloudflareToken && <p className="text-sm text-emerald-700">{t.tokenSet}</p>}
            <TextField
              label={t.token}
              hint={t.tokenHint}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            {saveToken.isError && <Alert kind="error">{errorMessage(saveToken.error)}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={!token || saveToken.isPending}>
                {t.save}
              </Button>
              {s.cloudflareToken && (
                <Button type="button" variant="danger" onClick={() => removeToken.mutate()}>
                  {t.remove}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card title={t.log}>
        {s.log.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noLog}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {s.log.map((entry) => (
              <li key={entry.at} className="border-b border-slate-100 pb-2">
                <span className="text-slate-500">
                  {new Date(entry.at).toLocaleString(user.locale)}
                </span>{' '}
                <span className="font-medium">{entry.what === 'all' ? t.all : entry.what}</span>
                <ul className="ml-4">
                  {entry.results.map((r, i) => (
                    <li key={i} className={r.ok ? 'text-emerald-700' : 'text-red-700'}>
                      {r.ok ? '✓' : '✗'} {r.target} {r.detail} {r.error ? `— ${r.error}` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {s.settings.varnish && (
        <Card title={t.vcl}>
          <p className="mb-2 text-sm text-slate-600">{t.vclHint}</p>
          <Code text={s.vcl} copy={t.copy} />
        </Card>
      )}
      {s.settings.cloudflare && s.cloudflareRule && (
        <Card title={t.rule}>
          <p className="mb-2 text-sm text-slate-600">{t.ruleHint}</p>
          <Code text={s.cloudflareRule} copy={t.copy} />
        </Card>
      )}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: 'edge-cache',
      title: { en: 'Edge cache', it: 'Cache esterna' },
      capability: 'manage_settings',
      component: EdgeCachePage,
    },
  ],
});
