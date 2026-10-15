import type { CatalogEntryView, CatalogView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { LicenseBox, PaidPrice } from './license';
import { Alert, Button, useT } from './ui';

/** The catalog, for super admins (who can install code). */
export const CATALOG_QUERY = {
  queryKey: ['catalog'],
  queryFn: () => api<CatalogView>('GET', '/catalog'),
  staleTime: 10 * 60 * 1000,
};

export function useCatalog() {
  const me = useMe();
  return useQuery({ ...CATALOG_QUERY, enabled: me.capabilities.includes('manage_plugins') });
}

/** Installed plugins or themes with a newer version that works here. */
export function useCatalogUpdates(type?: 'plugin' | 'theme'): CatalogEntryView[] {
  const catalog = useCatalog();
  return (catalog.data?.items ?? []).filter(
    (item) => item.update && item.compatible && (!type || item.type === type),
  );
}

/** What changes when something is installed: lists, menus, admin pages. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        ['catalog'],
        ['plugins'],
        ['themes'],
        ['content-types'],
        ME_QUERY_KEY,
        ['plugins', 'admin'],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

function useInstall() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (item: Pick<CatalogEntryView, 'type' | 'slug'>) =>
      api<{ slug: string; version: string }>('POST', `/catalog/${item.type}/${item.slug}/install`),
    onSuccess: refresh,
  });
}

/** "Update to 1.2.0" next to an installed plugin or theme, when the catalog has it. */
export function CatalogUpdateButton({ type, slug }: { type: 'plugin' | 'theme'; slug: string }) {
  const { t } = useT();
  const item = useCatalogUpdates(type).find((i) => i.slug === slug);
  const install = useInstall();
  if (!item) return null;
  if (item.renew) return <RenewNote item={item} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" disabled={install.isPending} onClick={() => install.mutate(item)}>
        {install.isPending ? t('Updating…') : t('Update to {version}', { version: item.version })}
      </Button>
      {install.error && <span className="text-xs text-red-700">{errorMessage(install.error)}</span>}
    </span>
  );
}

/** A paid update newer than the updates the license includes. */
function RenewNote({ item }: { item: CatalogEntryView }) {
  const { t } = useT();
  const url = item.siteLicense?.renewUrl ?? item.paid?.purchaseUrl;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-amber-800">
        {t('{version} is out: renew the license to update.', { version: item.version })}
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-sky-700 px-3 py-2 font-medium text-white hover:bg-sky-800"
        >
          {t('Renew to update')}
        </a>
      )}
    </span>
  );
}

/** Plugins → Add New, Themes → Add New: the catalog, searchable, with Install. */
export function CatalogBrowser({ type }: { type: 'plugin' | 'theme' }) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const install = useInstall();
  const refresh = useRefresh();
  const activate = useMutation({
    mutationFn: (slug: string) =>
      api('POST', type === 'plugin' ? `/plugins/${slug}/activate` : `/themes/${slug}/activate`),
    onSuccess: refresh,
  });
  const [query, setQuery] = useState('');
  const [installedNow, setInstalledNow] = useState<Set<string>>(new Set());
  const lang = me.user.locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  const summary = (item: CatalogEntryView) => item.summary[lang] ?? item.summary.en ?? '';
  const words = query.trim().toLowerCase();
  const items = (catalog.data?.items ?? []).filter(
    (item) =>
      item.type === type &&
      (!words ||
        `${item.name} ${summary(item)} ${item.tags.join(' ')}`.toLowerCase().includes(words)),
  );

  if (!me.capabilities.includes('manage_plugins')) return null;
  if (catalog.data && !catalog.data.enabled) {
    return (
      <p className="text-sm text-slate-600">
        {t('The catalog is turned off on this server. Upload a package instead.')}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="sr-only">
            {type === 'plugin' ? t('Search plugins') : t('Search themes')}
          </span>
          <input
            type="search"
            className="w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={type === 'plugin' ? t('Search plugins…') : t('Search themes…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            const fresh = await api<CatalogView>('GET', '/catalog?refresh=1');
            queryClient.setQueryData(['catalog'], fresh);
          }}
        >
          {t('Check again')}
        </Button>
      </div>
      {catalog.error && <Alert>{errorMessage(catalog.error)}</Alert>}
      {catalog.data?.error && (
        <Alert>
          {t('The catalog could not be read:')} {catalog.data.error}
        </Alert>
      )}
      {(install.error ?? activate.error) && (
        <Alert>{errorMessage(install.error ?? activate.error)}</Alert>
      )}
      {catalog.isPending && <p className="text-sm text-slate-600">{t('Loading…')}</p>}
      {catalog.data && items.length === 0 && (
        <p className="text-sm text-slate-600">{t('Nothing found.')}</p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('Catalog')}>
        {items.map((item) => {
          const justInstalled = installedNow.has(item.slug);
          return (
            <li
              key={item.slug}
              aria-label={item.name}
              className="flex flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-sm"
            >
              {item.screenshots[0] && (
                <img
                  src={item.screenshots[0]}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/10] w-full border-b border-slate-200 object-cover object-top"
                />
              )}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  {item.icon ? (
                    <img src={item.icon} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-lg font-semibold">
                      {item.name[0]}
                    </span>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="text-xs text-slate-500">
                      {t('Version {version}', { version: item.version })} · {item.author}
                    </p>
                  </div>
                </div>
                <p className="flex-1 text-sm text-slate-700">{summary(item)}</p>
                {item.paid && <PaidPrice paid={item.paid} />}
                {!item.compatible && (
                  <p className="text-xs text-amber-800">
                    {t('Needs a newer Cleitext: update it first.')}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {!item.installed ? (
                    <Button
                      disabled={!item.compatible || install.isPending}
                      onClick={() =>
                        install.mutate(item, {
                          onSuccess: () => setInstalledNow((s) => new Set(s).add(item.slug)),
                        })
                      }
                    >
                      {install.isPending && install.variables?.slug === item.slug
                        ? t('Installing…')
                        : item.paid && !item.siteLicense
                          ? t('Install the demo')
                          : t('Install')}
                      <span className="sr-only"> {item.name}</span>
                    </Button>
                  ) : item.renew ? (
                    <RenewNote item={item} />
                  ) : item.update ? (
                    <Button
                      disabled={!item.compatible || install.isPending}
                      onClick={() => install.mutate(item)}
                    >
                      {t('Update to {version}', { version: item.version })}
                    </Button>
                  ) : (
                    <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                      {t('Installed')}
                    </span>
                  )}
                  {justInstalled && item.paid && !item.siteLicense && (
                    <span className="text-xs text-slate-600">
                      {t('Try it with Live Preview in Installed themes, then activate a license.')}
                    </span>
                  )}
                  {justInstalled && (!item.paid || item.siteLicense) && (
                    <Button
                      variant="secondary"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate(item.slug)}
                    >
                      {t('Activate')}
                    </Button>
                  )}
                  {item.homepage && (
                    <a
                      href={item.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-sky-700 hover:underline"
                    >
                      {t('Details')}
                    </a>
                  )}
                </div>
                {item.paid && (
                  <LicenseBox
                    type={item.type}
                    slug={item.slug}
                    name={item.name}
                    purchaseUrl={item.paid.purchaseUrl}
                    license={item.siteLicense}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">
        {t(
          'Packages from the Cleitext catalog are checked before installing: the signature of the catalog and the SHA-256 of each package.',
        )}
      </p>
    </div>
  );
}
