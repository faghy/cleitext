import type { AutoUpdatesView, CatalogEntryView, CorePolicy } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { useCatalog } from './catalog';
import { Button, useT } from './ui';

/** The server's automatic updates (super admins only). */
export const AUTO_QUERY = {
  queryKey: ['updates', 'auto'],
  queryFn: () => api<AutoUpdatesView>('GET', '/updates/auto'),
};

type Item = { type: 'plugin' | 'theme'; slug: string; enabled: boolean };

/**
 * The choices of automatic updates, shown at once when changed (the
 * server's answer replaces them, or the old ones come back).
 */
export function useAutoUpdates() {
  const me = useMe();
  const queryClient = useQueryClient();
  const auto = useQuery({ ...AUTO_QUERY, enabled: me.user.isSuperAdmin });
  const change = useMutation({
    mutationFn: (body: { core?: CorePolicy; item?: Item; items?: Item[] }) =>
      api<AutoUpdatesView>('PUT', '/updates/auto', body),
    onMutate: (body) => {
      const previous = queryClient.getQueryData<AutoUpdatesView>(['updates', 'auto']);
      if (previous) {
        let items = previous.items;
        for (const item of [...(body.item ? [body.item] : []), ...(body.items ?? [])]) {
          items = [
            ...items.filter((i) => !(i.type === item.type && i.slug === item.slug)),
            ...(item.enabled ? [{ type: item.type, slug: item.slug }] : []),
          ];
        }
        queryClient.setQueryData(['updates', 'auto'], {
          ...previous,
          ...(body.core ? { core: body.core } : {}),
          items,
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(['updates', 'auto'], context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(['updates', 'auto'], data),
  });
  const on = (type: string, slug: string) =>
    Boolean(auto.data?.items.some((i) => i.type === type && i.slug === slug));
  return { auto, change, on };
}

/**
 * "Automatic updates" for the plugins (or themes) installed from the
 * catalog, with "Select all", as in WordPress's Plugins page.
 */
export function AutoUpdatesAll({ type }: { type: 'plugin' | 'theme' }) {
  const { t } = useT();
  const me = useMe();
  const catalog = useCatalog();
  const { auto, change, on } = useAutoUpdates();
  if (!me.user.isSuperAdmin || !auto.data) return null;
  const installed = (catalog.data?.items ?? []).filter(
    (item) => item.installed && item.type === type,
  );
  if (installed.length === 0) return null;
  const allOn = installed.every((item) => on(item.type, item.slug));
  const someOn = installed.some((item) => on(item.type, item.slug));
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        checked={allOn}
        ref={(el) => {
          if (el) el.indeterminate = someOn && !allOn;
        }}
        disabled={change.isPending}
        onChange={(e) =>
          change.mutate({
            items: installed.map((item) => ({
              type: item.type,
              slug: item.slug,
              enabled: e.target.checked,
            })),
          })
        }
      />
      {type === 'plugin'
        ? t('Automatic updates for all the plugins from the catalog')
        : t('Automatic updates for all the themes from the catalog')}
      {change.error && (
        <span className="text-xs font-normal text-red-700">{errorMessage(change.error)}</span>
      )}
    </label>
  );
}

/** "Automatic updates" of one plugin or theme from the catalog (super admins). */
export function AutoUpdateToggle({ type, slug }: { type: 'plugin' | 'theme'; slug: string }) {
  const { t } = useT();
  const me = useMe();
  const catalog = useCatalog();
  const { auto, change, on } = useAutoUpdates();
  const fromCatalog = (catalog.data?.items ?? []).some(
    (item) => item.installed && item.type === type && item.slug === slug,
  );
  if (!me.user.isSuperAdmin || !auto.data || !fromCatalog) return null;
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <input
        type="checkbox"
        checked={on(type, slug)}
        disabled={change.isPending}
        onChange={(e) => change.mutate({ item: { type, slug, enabled: e.target.checked } })}
      />
      {t('Automatic updates')}
    </label>
  );
}

/**
 * The updates available, with a box each, "Select all" and "Update the
 * selected": installed one after the other; a failure does not stop the others.
 */
export function BulkUpdates({ updates }: { updates: CatalogEntryView[] }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const key = (item: CatalogEntryView) => `${item.type}:${item.slug}`;
  const ready = updates.filter((item) => !item.renew);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);
  const chosen = ready.filter((item) => picked.has(key(item)));
  const all = ready.length > 0 && chosen.length === ready.length;
  const run = async () => {
    setFailures([]);
    setProgress({ done: 0, total: chosen.length });
    const failed: { name: string; error: string }[] = [];
    for (const [index, item] of chosen.entries()) {
      try {
        await api('POST', `/catalog/${item.type}/${item.slug}/install`);
      } catch (error) {
        failed.push({ name: item.name, error: errorMessage(error) });
      }
      setProgress({ done: index + 1, total: chosen.length });
    }
    setFailures(failed);
    setPicked(new Set());
    setProgress(null);
    await Promise.all(
      [['catalog'], ['plugins'], ['themes'], ['plugins', 'admin'], ['updates']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
  if (ready.length === 0) return null;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-2">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = chosen.length > 0 && !all;
            }}
            disabled={Boolean(progress)}
            onChange={(e) => setPicked(e.target.checked ? new Set(ready.map(key)) : new Set())}
          />
          {t('Select all')}
        </label>
        <Button disabled={chosen.length === 0 || Boolean(progress)} onClick={() => void run()}>
          {progress
            ? t('Updating {done} of {total}…', progress)
            : t('Update the selected ({count})', { count: chosen.length })}
        </Button>
      </div>
      <ul className="space-y-2">
        {ready.map((item) => (
          <li key={key(item)}>
            <label className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={picked.has(key(item))}
                disabled={Boolean(progress)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(key(item));
                  else next.delete(key(item));
                  setPicked(next);
                }}
              />
              <span className="font-medium">{item.name}</span>
              <span className="text-slate-600">
                {item.type === 'theme' ? t('theme') : t('plugin')} · {item.installed} →{' '}
                {item.version}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {failures.length > 0 && (
        <ul className="space-y-1 text-red-700">
          {failures.map((f) => (
            <li key={f.name}>
              {f.name}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
