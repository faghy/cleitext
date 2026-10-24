import type { PluginView } from '@cleitext/shared';
import { useTabParam } from '../components/use-tab';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api, errorMessage } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { Alert, Button, useT } from '../components/ui';
import { PackageUpload } from '../components/package-upload';
import { CatalogBrowser, CatalogUpdateButton } from '../components/catalog';
import { LicenseBox } from '../components/license';
import { pagePath, usePluginAdmin, type LoadedAdminPlugin } from '../plugins';

/** Where an active plugin is configured: its first admin page, or its card in Settings. */
function optionsLink(
  plugin: LoadedAdminPlugin | undefined,
  capabilities: readonly string[],
): { to: string; hash?: string } | null {
  if (!plugin) return null;
  const page = plugin.definition?.pages?.find(
    (p) => p.menu !== false && (!p.capability || capabilities.includes(p.capability)),
  );
  if (page) return { to: pagePath(plugin.slug, page.path) };
  if (plugin.settings && capabilities.includes('manage_settings')) {
    return { to: '/settings', hash: `plugin-${plugin.slug}` };
  }
  return null;
}

const PERMISSION_LABELS: Record<string, string> = {
  'content:read': 'Read content',
  'content:write': 'Add content types and fields',
  'media:read': 'Read the media library',
  'media:write': 'Add files to the media library',
  'settings:own': 'Store its own settings',
  'routes:public': 'Add addresses to the public site',
  'routes:admin': 'Add API endpoints',
  blocks: 'Add blocks',
  'theme:hooks': 'Change public pages',
  'mail:send': 'Send email',
  network: 'Send requests to other services',
  'forms:protect': 'Protect forms against bots (can refuse submissions)',
  'users:read': "Read the site's users (names, roles, confirmed email addresses)",
};

/** Permissions over people's data: activating a plugin that asks for them needs consent. */
const CONSENT_PERMISSIONS = ['users:read'];

/** Plugins → Installed Plugins (RF-PLG-02). Installation is done with the CLI. */
export function PluginsPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api<PluginView[]>('GET', '/plugins'),
  });
  const me = useMe();
  const adminPlugins = usePluginAdmin();
  // Activating on every site only means something with more than one site; a plugin
  // already active on every site can still be turned back.
  const canUseNetwork = me.user.isSuperAdmin && me.sites.length > 1;
  const network = useMutation({
    mutationFn: ({ slug, on }: { slug: string; on: boolean }) =>
      api<PluginView>('POST', `/plugins/${slug}/network`, { network: on }),
    onSuccess: async () => {
      await Promise.all(
        [['plugins'], ['content-types'], ME_QUERY_KEY, ['plugins', 'admin']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const canDelete = me.capabilities.includes('manage_plugins');
  const remove = useMutation({
    mutationFn: (slug: string) => api<void>('DELETE', `/plugins/${slug}`),
    onSuccess: async () => {
      await Promise.all(
        [['plugins'], ['content-types'], ME_QUERY_KEY, ['plugins', 'admin']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  /** Asks before activating a plugin that reads people's data (`users:read`). */
  const consent = (plugin: PluginView): boolean => {
    const sensitive = plugin.permissions.filter((p) => CONSENT_PERMISSIONS.includes(p));
    if (sensitive.length === 0) return true;
    return window.confirm(
      t('{name} asks to: {permissions}. Activate it?', {
        name: plugin.name,
        permissions: sensitive.map((p) => t(PERMISSION_LABELS[p] ?? p)).join(' · '),
      }),
    );
  };
  const toggle = useMutation({
    mutationFn: ({ slug, activate }: { slug: string; activate: boolean }) =>
      api<PluginView>('POST', `/plugins/${slug}/${activate ? 'activate' : 'deactivate'}`),
    onSuccess: async () => {
      // Types, capabilities, menus and admin pages may have changed.
      await Promise.all(
        [['plugins'], ['content-types'], ME_QUERY_KEY, ['plugins', 'admin']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  const [installBefore, installAfter] = t(
    'Install plugins on the server with {command}, then activate them here for this site.',
  ).split('{command}');
  // Plugins → Add New: the catalog and the upload, as in WordPress.
  const [view, setView] = useTabParam<'installed' | 'add'>('installed');
  const adding = view === 'add';
  const setAdding = (on: boolean) => setView(on ? 'add' : 'installed');
  if (adding) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t('Add Plugins')}</h1>
          <Button variant="secondary" onClick={() => setAdding(false)}>
            {t('Installed plugins')}
          </Button>
        </div>
        <CatalogBrowser type="plugin" />
        <PackageUpload
          title={t('Upload Plugin')}
          path="/plugins/upload"
          onInstalled={() => void queryClient.invalidateQueries({ queryKey: ['plugins'] })}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t('Plugins')}</h1>
        {canDelete && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t('Add New')}
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {installBefore}
        <code>cleitext plugin:install &lt;folder&gt;</code>
        {installAfter}
      </p>
      {plugins.error && <Alert>{errorMessage(plugins.error)}</Alert>}
      {(toggle.error ?? network.error ?? remove.error) && (
        <Alert>{errorMessage(toggle.error ?? network.error ?? remove.error)}</Alert>
      )}
      {plugins.data?.length === 0 && (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {t('No plugins are installed.')}
        </p>
      )}
      <ul className="space-y-3" aria-label={t('Installed plugins')}>
        {plugins.data?.map((plugin) => (
          <li
            key={plugin.slug}
            aria-label={plugin.name}
            className={`rounded border bg-white p-4 shadow-sm ${plugin.active ? 'border-sky-300' : 'border-slate-200'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold">
                  {plugin.name}{' '}
                  <span className="text-sm font-normal text-slate-500">{plugin.version}</span>
                  {plugin.mustUse && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal">
                      {t('Must-use')}
                    </span>
                  )}
                  {plugin.network && !plugin.mustUse && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal">
                      {t('Network')}
                    </span>
                  )}
                </h2>
                {plugin.description && <p className="text-sm">{plugin.description}</p>}
                {plugin.paid && plugin.status !== 'error' && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                      {plugin.paid.license ? t('Paid plugin') : t('Paid plugin · demo')}
                    </p>
                    <LicenseBox
                      type="plugin"
                      slug={plugin.slug}
                      name={plugin.name}
                      purchaseUrl={plugin.paid.purchaseUrl}
                      license={plugin.paid.license}
                    />
                  </>
                )}
                <p className="text-xs text-slate-500">
                  {plugin.author && <>{t('By {author}', { author: plugin.author })} · </>}
                  {plugin.license}
                  {plugin.homepage && (
                    <>
                      {' · '}
                      <a
                        className="text-sky-700 underline hover:no-underline"
                        href={plugin.homepage}
                      >
                        {t('Website')}
                      </a>
                    </>
                  )}
                </p>
              </div>
              {plugin.status === 'loaded' && (plugin.active || !plugin.mustUse) && (
                <div className="flex flex-wrap gap-2">
                  {plugin.active &&
                    (() => {
                      const link = optionsLink(
                        adminPlugins.find((p) => p.slug === plugin.slug),
                        me.capabilities,
                      );
                      return link ? (
                        <Link
                          to={link.to}
                          hash={link.hash}
                          className="rounded bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
                        >
                          {t('Settings')}
                          <span className="sr-only"> {plugin.name}</span>
                        </Link>
                      ) : null;
                    })()}
                  <CatalogUpdateButton type="plugin" slug={plugin.slug} />
                  {!plugin.network && !plugin.mustUse && (
                    <Button
                      variant={plugin.active ? 'secondary' : 'primary'}
                      disabled={toggle.isPending}
                      onClick={() => {
                        if (plugin.active || consent(plugin))
                          toggle.mutate({ slug: plugin.slug, activate: !plugin.active });
                      }}
                    >
                      {plugin.active ? t('Deactivate') : t('Activate')}
                    </Button>
                  )}
                  {!plugin.mustUse &&
                    (canUseNetwork || (plugin.network && me.user.isSuperAdmin)) && (
                      <Button
                        variant="secondary"
                        disabled={network.isPending}
                        onClick={() => {
                          if (plugin.network || consent(plugin))
                            network.mutate({ slug: plugin.slug, on: !plugin.network });
                        }}
                      >
                        {plugin.network
                          ? t('Deactivate on every site')
                          : t('Activate on every site')}
                      </Button>
                    )}
                  {/* As in WordPress: only a plugin active nowhere can be deleted. */}
                  {canDelete && !plugin.active && !plugin.network && !plugin.mustUse && (
                    <Button
                      variant="danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              'Delete {name} and all its data on every site? This cannot be undone.',
                              {
                                name: plugin.name,
                              },
                            ),
                          )
                        )
                          remove.mutate(plugin.slug);
                      }}
                    >
                      {t('Delete')}
                      <span className="sr-only"> {plugin.name}</span>
                    </Button>
                  )}
                </div>
              )}
              {plugin.mustUse && (
                <p className="text-sm text-slate-600">{t('Always active on every site.')}</p>
              )}
            </div>
            {plugin.status === 'error' && (
              <div className="mt-3">
                <Alert>
                  {t('This plugin could not be loaded: {error}', { error: plugin.error ?? '' })}
                </Alert>
              </div>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-700">{t('Details')}</summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-slate-500">{t('Permissions')}</dt>
                <dd>
                  {plugin.permissions.length
                    ? plugin.permissions
                        .map((p) => (PERMISSION_LABELS[p] ? t(PERMISSION_LABELS[p]) : p))
                        .join(' · ')
                    : t('None')}
                </dd>
                {plugin.contributes.types.length > 0 && (
                  <>
                    <dt className="text-slate-500">{t('Content types')}</dt>
                    <dd>{plugin.contributes.types.join(', ')}</dd>
                  </>
                )}
                {plugin.contributes.blocks.length > 0 && (
                  <>
                    <dt className="text-slate-500">{t('Blocks')}</dt>
                    <dd>{plugin.contributes.blocks.join(', ')}</dd>
                  </>
                )}
                {Object.keys(plugin.requires).length > 0 && (
                  <>
                    <dt className="text-slate-500">{t('Requires')}</dt>
                    <dd>
                      {Object.entries(plugin.requires)
                        .map(([slug, range]) => `${slug} ${range}`)
                        .join(', ')}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">{t('Activity')}</dt>
                <dd>
                  {t('{calls} calls, {ms} ms, {errors} errors since the server started', {
                    calls: plugin.stats.calls,
                    ms: plugin.stats.totalMs,
                    errors: plugin.stats.errors,
                  })}
                  {plugin.stats.lastError && (
                    <span className="block text-red-700">
                      {t('Last error: {error}', { error: plugin.stats.lastError })}
                    </span>
                  )}
                </dd>
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
