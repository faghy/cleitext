import { useT } from '@cleitext/admin-sdk';
import type { SiteView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';

const KEY = ['sites'];

/** Sites of the installation, for super admins (RF-SIT-03). */
export function SitesPage() {
  const { t } = useT();
  const sites = useQuery({ queryKey: KEY, queryFn: () => api<SiteView[]>('GET', '/sites') });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Sites')}</h1>
      {sites.error && <Alert>{errorMessage(sites.error)}</Alert>}
      <NewSite />
      <ul className="space-y-4" aria-label={t('Sites')}>
        {sites.data?.map((site) => (
          <li key={site.id}>
            <SiteCard site={site} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function useSitesMutation<T>(fn: (input: T) => Promise<SiteView[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (list) => {
      queryClient.setQueryData(KEY, list);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

function NewSite() {
  const { t } = useT();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    host: '',
    locale: 'it',
    forceHttps: true,
  });
  const create = useSitesMutation(() => api<SiteView[]>('POST', '/sites', form));
  const fieldError = (field: string) =>
    create.error instanceof ApiError ? create.error.fieldError(field) : undefined;
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Card title={t('Add New Site')}>
      <form
        className="grid gap-4 md:grid-cols-5 md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, {
            onSuccess: () =>
              setForm({ name: '', slug: '', host: '', locale: 'it', forceHttps: true }),
          });
        }}
      >
        <TextField
          label={t('Name')}
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((f) => ({
              ...f,
              name,
              // Suggested from the name until edited by hand.
              slug: f.slug && f.slug !== slugOf(f.name) ? f.slug : slugOf(name),
            }));
          }}
          {...(fieldError('name') ? { error: fieldError('name')! } : {})}
        />
        <TextField
          label={t('Slug')}
          value={form.slug}
          onChange={(e) => set('slug', e.target.value)}
          {...(fieldError('slug') ? { error: fieldError('slug')! } : {})}
        />
        <TextField
          label={t('Domain')}
          placeholder="example.com"
          value={form.host}
          onChange={(e) => set('host', e.target.value)}
          {...(fieldError('host') ? { error: fieldError('host')! } : {})}
        />
        <TextField
          label={t('Language')}
          value={form.locale}
          onChange={(e) => set('locale', e.target.value.trim())}
        />
        <Button type="submit" disabled={create.isPending || !form.name || !form.slug || !form.host}>
          {t('Create site')}
        </Button>
        <label className="flex items-center gap-2 text-sm md:col-span-5">
          <input
            type="checkbox"
            checked={form.forceHttps}
            onChange={(e) => set('forceHttps', e.target.checked)}
          />
          {t('Always use HTTPS')}
        </label>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        {t(
          'Point the domain to this server first (DNS, and an alias of the application in Plesk).',
        )}
      </p>
      {create.error && !fieldError('name') && !fieldError('slug') && !fieldError('host') && (
        <div className="mt-3">
          <Alert>{errorMessage(create.error)}</Alert>
        </div>
      )}
    </Card>
  );
}

function SiteCard({ site }: { site: SiteView }) {
  const { t } = useT();
  const me = useMe();
  const current = site.id === me.site.id;
  const [name, setName] = useState(site.name);
  const [host, setHost] = useState('');
  const update = useSitesMutation((body: Record<string, unknown>) =>
    api<SiteView[]>('PATCH', `/sites/${site.id}`, body),
  );
  const addDomain = useSitesMutation(() =>
    api<SiteView[]>('POST', `/sites/${site.id}/domains`, { host, forceHttps: true }),
  );
  const domain = useSitesMutation(({ id, body }: { id: string; body?: Record<string, unknown> }) =>
    api<SiteView[]>(body ? 'PATCH' : 'DELETE', `/sites/domains/${id}`, body),
  );
  const error = update.error ?? addDomain.error ?? domain.error;
  const primary = site.domains.find((d) => d.isPrimary);
  const statusLabel = {
    active: t('Active'),
    maintenance: t('Maintenance'),
    archived: t('Archived'),
  }[site.status];

  return (
    <article
      aria-label={site.name}
      className={`rounded border bg-white p-4 shadow-sm ${site.status === 'archived' ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {site.name} <span className="text-sm font-normal text-slate-500">({site.slug})</span>
          </h2>
          <p className="text-xs text-slate-500">
            {statusLabel}
            {current && ` · ${t('this site')}`}
            {primary && site.status !== 'archived' && (
              <>
                {' · '}
                <a
                  className="text-sky-700 underline"
                  href={`${primary.forceHttps ? 'https' : 'http'}://${primary.host}/admin/`}
                >
                  {t('Open admin')}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {site.status !== 'archived' ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  update.mutate({
                    status: site.status === 'maintenance' ? 'active' : 'maintenance',
                  })
                }
              >
                {site.status === 'maintenance' ? t('End maintenance') : t('Maintenance mode')}
              </Button>
              {!current && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        t('Archive {site}? Its domains will stop answering.', { site: site.name }),
                      )
                    ) {
                      update.mutate({ status: 'archived' });
                    }
                  }}
                >
                  {t('Archive')}
                </Button>
              )}
            </>
          ) : (
            <Button variant="secondary" onClick={() => update.mutate({ status: 'active' })}>
              {t('Restore')}
            </Button>
          )}
        </div>
      </div>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ name });
        }}
      >
        <TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!name.trim() || name === site.name}>
          {t('Rename')}
        </Button>
      </form>

      <h3 className="mt-4 text-sm font-medium">{t('Domains')}</h3>
      <ul className="mt-1 divide-y divide-slate-100 text-sm">
        {site.domains.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>
              {d.host}
              {d.isPrimary && <span className="ml-2 text-xs text-sky-700">{t('primary')}</span>}
              {!d.forceHttps && (
                <span className="ml-2 text-xs text-amber-700">{t('HTTP allowed')}</span>
              )}
            </span>
            <span className="space-x-3">
              {!d.isPrimary && (
                <button
                  type="button"
                  className="text-sky-700 hover:underline"
                  onClick={() => domain.mutate({ id: d.id, body: { isPrimary: true } })}
                >
                  {t('Make primary')}
                </button>
              )}
              <button
                type="button"
                className="text-sky-700 hover:underline"
                onClick={() => domain.mutate({ id: d.id, body: { forceHttps: !d.forceHttps } })}
              >
                {d.forceHttps ? t('Allow HTTP') : t('Always use HTTPS')}
              </button>
              {!d.isPrimary && (
                <button
                  type="button"
                  className="text-red-700 hover:underline"
                  onClick={() => {
                    if (window.confirm(t('Remove {domain}?', { domain: d.host })))
                      domain.mutate({ id: d.id });
                  }}
                >
                  {t('Remove')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addDomain.mutate(undefined, { onSuccess: () => setHost('') });
        }}
      >
        <TextField
          label={t('Add a domain')}
          placeholder="www.example.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!host.trim() || addDomain.isPending}>
          {t('Add')}
        </Button>
      </form>
      {error && (
        <div className="mt-3">
          <Alert>{errorMessage(error)}</Alert>
        </div>
      )}
    </article>
  );
}

function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}
