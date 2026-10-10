import { REDIRECT_STATUSES, type RedirectImportResult, type RedirectView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Alert, Button, Card, useT } from '../components/ui';

const STATUS_LABELS: Record<number, string> = {
  301: '301 Moved permanently',
  302: '302 Found (temporary)',
  307: '307 Temporary redirect',
  308: '308 Permanent redirect',
  410: '410 Gone',
};

const input = 'w-full rounded border border-slate-300 px-2 py-1 text-sm';

/** Settings → Redirects (RF-NAV-04). */
export function RedirectsPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const redirects = useQuery({
    queryKey: ['redirects', query],
    queryFn: () => api<RedirectView[]>('GET', `/redirects?q=${encodeURIComponent(query)}`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['redirects'] });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/redirects/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Redirects')}</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('Add redirect')}>
          <RedirectForm onSaved={refresh} />
        </Card>
        <Card title={t('Import from CSV')}>
          <ImportForm onDone={refresh} />
        </Card>
      </div>
      <Card>
        <div className="mb-3 flex justify-end">
          <label className="sr-only" htmlFor="redirects-search">
            {t('Search redirects')}
          </label>
          <input
            id="redirects-search"
            type="search"
            placeholder={t('Search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        {(redirects.error ?? remove.error) && (
          <Alert>{errorMessage(redirects.error ?? remove.error)}</Alert>
        )}
        {redirects.data?.length === 0 ? (
          <p className="text-sm text-slate-600">{t('No redirects.')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 font-medium">{t('From')}</th>
                <th className="py-2 font-medium">{t('To')}</th>
                <th className="py-2 font-medium">{t('Type')}</th>
                <th className="py-2 font-medium">{t('Hits')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {redirects.data?.map((redirect) => (
                <tr key={redirect.id} className="border-b border-slate-100">
                  <td className="py-2 font-mono text-xs break-all">{redirect.from}</td>
                  <td className="py-2 font-mono text-xs break-all">{redirect.to || '—'}</td>
                  <td className="py-2">{redirect.status}</td>
                  <td className="py-2">{redirect.hits}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            t('Delete the redirect from {from}?', { from: redirect.from }),
                          )
                        )
                          remove.mutate(redirect.id);
                      }}
                    >
                      {t('Delete')}
                      <span className="sr-only"> {redirect.from}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function RedirectForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState(301);
  const save = useMutation({
    mutationFn: () => api<RedirectView>('POST', '/redirects', { from, to, status }),
    onSuccess: () => {
      setFrom('');
      setTo('');
      onSaved();
    },
  });
  return (
    <form
      className="space-y-3 text-sm"
      aria-label={t('Add redirect')}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="block space-y-1">
        <span className="font-medium">{t('From (path of this site)')}</span>
        <input
          className={input}
          placeholder="/old-address"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">{t('To (path or full address)')}</span>
        <input
          className={input}
          placeholder="/new-address"
          value={to}
          disabled={status === 410}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">{t('Type')}</span>
        <select
          className={input}
          value={status}
          onChange={(e) => setStatus(Number(e.target.value))}
        >
          {REDIRECT_STATUSES.map((code) => (
            <option key={code} value={code}>
              {t(STATUS_LABELS[code]!)}
            </option>
          ))}
        </select>
      </label>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <Button type="submit" disabled={save.isPending || !from.trim()}>
        {t('Add redirect')}
      </Button>
    </form>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [csv, setCsv] = useState('');
  const run = useMutation({
    mutationFn: () => api<RedirectImportResult>('POST', '/redirects/import', { csv }),
    onSuccess: () => {
      setCsv('');
      onDone();
    },
  });
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      <p className="text-slate-600">
        {t('One redirect per line: from,to,type. The type is optional (301 if missing).')}
      </p>
      <label className="block space-y-1">
        <span className="font-medium">{t('CSV file or text')}</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void file.text().then(setCsv);
          }}
        />
      </label>
      <textarea
        aria-label={t('CSV text')}
        className={`${input} h-28 font-mono`}
        placeholder={'/old,/new\n/gone,,410'}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      {run.error && <Alert>{errorMessage(run.error)}</Alert>}
      {run.data && (
        <Alert kind={run.data.errors.length ? 'error' : 'success'}>
          {t('{count} redirects saved.', { count: run.data.saved })}
          {run.data.errors.map((error) => (
            <span key={error.line} className="block">
              {t('Line {line}: {message}', { line: error.line, message: error.message })}
            </span>
          ))}
        </Alert>
      )}
      <Button type="submit" disabled={run.isPending || !csv.trim()}>
        {t('Import')}
      </Button>
    </form>
  );
}
