import type { PluginView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { ME_QUERY_KEY } from '../auth';
import { Alert, Button } from '../components/ui';

const PERMISSION_LABELS: Record<string, string> = {
  'content:read': 'Read content',
  'content:write': 'Add content types and fields',
  'media:read': 'Read the media library',
  'settings:own': 'Store its own settings',
  'routes:public': 'Add addresses to the public site',
  'routes:admin': 'Add API endpoints',
  blocks: 'Add blocks',
  'theme:hooks': 'Change public pages',
  'mail:send': 'Send email',
};

/** Plugins → Installed Plugins (RF-PLG-02). Installation is done with the CLI. */
export function PluginsPage() {
  const queryClient = useQueryClient();
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api<PluginView[]>('GET', '/plugins'),
  });
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Plugins</h1>
      <p className="text-sm text-slate-600">
        Install plugins on the server with <code>cleitext plugin:install &lt;folder&gt;</code>, then
        activate them here for this site.
      </p>
      {plugins.error && <Alert>{errorMessage(plugins.error)}</Alert>}
      {toggle.error && <Alert>{errorMessage(toggle.error)}</Alert>}
      {plugins.data?.length === 0 && (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No plugins are installed.
        </p>
      )}
      <ul className="space-y-3" aria-label="Installed plugins">
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
                </h2>
                {plugin.description && <p className="text-sm">{plugin.description}</p>}
                <p className="text-xs text-slate-500">
                  {plugin.author && <>By {plugin.author} · </>}
                  {plugin.license}
                  {plugin.homepage && (
                    <>
                      {' · '}
                      <a className="text-sky-700 hover:underline" href={plugin.homepage}>
                        Website
                      </a>
                    </>
                  )}
                </p>
              </div>
              {plugin.status === 'loaded' && (
                <Button
                  variant={plugin.active ? 'secondary' : 'primary'}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ slug: plugin.slug, activate: !plugin.active })}
                >
                  {plugin.active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
            {plugin.status === 'error' && (
              <div className="mt-3">
                <Alert>This plugin could not be loaded: {plugin.error}</Alert>
              </div>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-700">Details</summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                <dt className="text-slate-500">Permissions</dt>
                <dd>
                  {plugin.permissions.length
                    ? plugin.permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(' · ')
                    : 'None'}
                </dd>
                {plugin.contributes.types.length > 0 && (
                  <>
                    <dt className="text-slate-500">Content types</dt>
                    <dd>{plugin.contributes.types.join(', ')}</dd>
                  </>
                )}
                {plugin.contributes.blocks.length > 0 && (
                  <>
                    <dt className="text-slate-500">Blocks</dt>
                    <dd>{plugin.contributes.blocks.join(', ')}</dd>
                  </>
                )}
                {Object.keys(plugin.requires).length > 0 && (
                  <>
                    <dt className="text-slate-500">Requires</dt>
                    <dd>
                      {Object.entries(plugin.requires)
                        .map(([slug, range]) => `${slug} ${range}`)
                        .join(', ')}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Activity</dt>
                <dd>
                  {plugin.stats.calls} calls, {plugin.stats.totalMs} ms, {plugin.stats.errors}{' '}
                  errors since the server started
                  {plugin.stats.lastError && (
                    <span className="block text-red-700">Last error: {plugin.stats.lastError}</span>
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
