import type {
  BulkEntriesResponse,
  EntryListResponse,
  EntryStatus,
  EntrySummary,
  EntryView,
  MemberView,
  TaxonomyView,
  TermView,
} from '@cleitext/shared';
import { labelText } from '@cleitext/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card } from '../components/ui';
import { entryTree } from '../entry-tree';
import { contentTypesQuery } from '../plugins';
export const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  scheduled: 'Scheduled',
  published: 'Published',
  private: 'Private',
  trashed: 'Trash',
};

const FILTERS: { label: string; status?: EntryStatus }[] = [
  { label: 'All' },
  { label: 'Published', status: 'published' },
  { label: 'Drafts', status: 'draft' },
  { label: 'Pending', status: 'pending' },
  { label: 'Scheduled', status: 'scheduled' },
  { label: 'Trash', status: 'trashed' },
];

type Sort = 'updated' | 'title' | 'date' | 'order';
type BulkAction = 'publish' | 'unpublish' | 'trash' | 'restore' | 'delete';

const SELECT = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

/** WordPress-like list of entries of one type (Posts, Pages) — RF-ADM-03. */
export function EntriesListPage({ type, title }: { type: string; title: string }) {
  const { t } = useT();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EntryStatus | undefined>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState('');
  const [locale, setLocale] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<{ by: Sort; dir: 'asc' | 'desc' }>({
    by: 'updated',
    dir: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | ''>('');
  const [bulkMessage, setBulkMessage] = useState<{ kind: 'error' | 'success'; text: string }>();
  const [editing, setEditing] = useState<string | null>(null);

  const canManageUsers = me.capabilities.includes('manage_users');
  const multilingual = me.site.locales.length > 1;
  const types = useQuery(contentTypesQuery);
  const hierarchical = types.data?.find((ct) => ct.slug === type)?.hierarchical ?? false;
  // Hierarchical types (pages) open in manual order, shown as a tree.
  const sortTouched = useRef(false);
  useEffect(() => {
    if (hierarchical && !sortTouched.current) setSort({ by: 'order', dir: 'asc' });
  }, [hierarchical]);
  const members = useQuery({
    queryKey: ['users'],
    queryFn: () => api<MemberView[]>('GET', '/users'),
    enabled: canManageUsers,
  });
  const taxonomies = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => api<TaxonomyView[]>('GET', '/taxonomies'),
  });
  const applicable = taxonomies.data?.filter((tx) => tx.contentTypes.includes(type)) ?? [];
  const terms = useQuery({
    queryKey: ['terms', 'filter', applicable.map((tx) => tx.slug)],
    queryFn: async () =>
      Promise.all(
        applicable.map(async (tx) => ({
          taxonomy: tx,
          terms: await api<TermView[]>('GET', `/taxonomies/${tx.slug}/terms`),
        })),
      ),
    enabled: applicable.length > 0,
  });

  // The tree needs the whole hierarchy: only without filters that hide parents.
  const treeView =
    hierarchical && sort.by === 'order' && sort.dir === 'asc' && !query && !author && !term;
  const filters = { type, status, query, author, locale, term, sort, treeView };
  const list = useInfiniteQuery({
    queryKey: ['entries', filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        type,
        limit: treeView ? '100' : '20',
        sort: sort.by,
        dir: sort.dir,
      });
      if (status) params.set('status', status);
      if (query) params.set('q', query);
      if (author) params.set('author', author);
      if (locale) params.set('locale', locale);
      if (term) params.set('term', term);
      if (pageParam) params.set('cursor', pageParam);
      return api<EntryListResponse>('GET', `/entries?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const create = useMutation({
    mutationFn: () => api<EntryView>('POST', '/entries', { type, title: '' }),
    onSuccess: (entry) => navigate({ to: '/entries/$id', params: { id: entry.id } }),
  });

  const bulk = useMutation({
    mutationFn: (input: { ids: string[]; action: BulkAction }) =>
      api<BulkEntriesResponse>('POST', '/entries/bulk', input),
    onSuccess: async ({ results }) => {
      const failed = results.filter((r) => !r.ok);
      setBulkMessage(
        failed.length === 0
          ? { kind: 'success', text: t('{count} items updated.', { count: results.length }) }
          : {
              kind: 'error',
              text: t('{failed} of {count} items could not be changed: {error}', {
                failed: failed.length,
                count: results.length,
                error: failed[0]?.error ?? '',
              }),
            },
      );
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  const loaded = list.data?.pages.flatMap((p) => p.items) ?? [];
  const rows = treeView ? entryTree(loaded) : loaded.map((entry) => ({ entry, depth: 0 }));
  const items = rows.map((row) => row.entry);
  const allSelected = items.length > 0 && items.every((entry) => selected.has(entry.id));
  const bulkActions: { value: BulkAction; label: string }[] =
    status === 'trashed'
      ? [
          { value: 'restore', label: 'Restore' },
          { value: 'delete', label: 'Delete permanently' },
        ]
      : [
          { value: 'publish', label: 'Publish' },
          { value: 'unpublish', label: 'Unpublish' },
          { value: 'trash', label: 'Move to trash' },
        ];

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortBy(by: Sort) {
    sortTouched.current = true;
    setSort((current) =>
      current.by === by
        ? { by, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { by, dir: by === 'title' || by === 'order' ? 'asc' : 'desc' },
    );
  }

  function SortHeader({ by, label }: { by: Sort; label: string }) {
    const active = sort.by === by;
    return (
      <th
        className="py-2 font-medium"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className="hover:text-sky-700" onClick={() => sortBy(by)}>
          {label}
          {active && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Button variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
          {t('Add New')}
        </Button>
      </div>
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('Filter by status')} className="flex flex-wrap gap-1 text-sm">
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => {
                setStatus(filter.status);
                setSelected(new Set());
              }}
              aria-pressed={status === filter.status}
              className={`rounded px-2 py-1 ${status === filter.status ? 'bg-slate-800 text-white' : 'text-sky-700 hover:underline'}`}
            >
              {t(filter.label)}
            </button>
          ))}
        </nav>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <label className="sr-only" htmlFor="entries-search">
            {t('Search {title}', { title: title.toLowerCase() })}
          </label>
          <input
            id="entries-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <Button variant="secondary" type="submit">
            {t('Search')}
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          aria-label={t('Bulk actions')}
          onSubmit={(e) => {
            e.preventDefault();
            if (!bulkAction || selected.size === 0) return;
            if (
              bulkAction === 'delete' &&
              !window.confirm(t('Delete the selected items permanently?'))
            )
              return;
            setBulkMessage(undefined);
            bulk.mutate({ ids: [...selected], action: bulkAction });
          }}
        >
          <select
            aria-label={t('Bulk action')}
            className={SELECT}
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value as BulkAction | '')}
          >
            <option value="">{t('Bulk actions')}</option>
            {bulkActions.map((action) => (
              <option key={action.value} value={action.value}>
                {t(action.label)}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            type="submit"
            disabled={!bulkAction || selected.size === 0 || bulk.isPending}
          >
            {t('Apply')}
          </Button>
        </form>
        {canManageUsers ? (
          <select
            aria-label={t('Filter by author')}
            className={SELECT}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          >
            <option value="">{t('All authors')}</option>
            {members.data
              ?.filter((m) => m.status !== 'invited')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
          </select>
        ) : (
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={author === me.user.id}
              onChange={(e) => setAuthor(e.target.checked ? me.user.id : '')}
            />
            {t('Only mine')}
          </label>
        )}
        {multilingual && (
          <select
            aria-label={t('Filter by language')}
            className={SELECT}
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="">{t('All languages')}</option>
            {me.site.locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {(terms.data ?? []).some((group) => group.terms.length > 0) && (
          <select
            aria-label={t('Filter by term')}
            className={SELECT}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          >
            <option value="">{t('All terms')}</option>
            {terms.data
              ?.filter((group) => group.terms.length > 0)
              .map((group) => (
                <optgroup
                  key={group.taxonomy.slug}
                  label={labelText(group.taxonomy.name, me.user.locale)}
                >
                  {group.terms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {multilingual ? ` (${item.locale.toUpperCase()})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        )}
      </div>
      {bulk.error && <Alert>{errorMessage(bulk.error)}</Alert>}
      {bulkMessage && <Alert kind={bulkMessage.kind}>{bulkMessage.text}</Alert>}

      <Card>
        {list.error && <Alert>{errorMessage(list.error)}</Alert>}
        {list.isPending ? (
          <p className="text-sm text-slate-600">{t('Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-600">{t('Nothing found.')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    aria-label={t('Select all')}
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)))
                    }
                  />
                </th>
                <SortHeader by="title" label={t('Title')} />
                <th className="py-2 font-medium">{t('Author')}</th>
                {multilingual && <th className="py-2 font-medium">{t('Language')}</th>}
                <th className="py-2 font-medium">{t('Status')}</th>
                {hierarchical && <SortHeader by="order" label={t('Order')} />}
                <SortHeader by="date" label={t('Date')} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, depth }) =>
                editing === entry.id ? (
                  <QuickEditRow
                    key={entry.id}
                    entry={entry}
                    hierarchical={hierarchical}
                    columns={5 + (multilingual ? 1 : 0) + (hierarchical ? 1 : 0)}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <tr key={entry.id} className="group border-b border-slate-100">
                    <td className="py-2 align-top">
                      <input
                        type="checkbox"
                        aria-label={t('Select {title}', { title: entry.title || t('(no title)') })}
                        checked={selected.has(entry.id)}
                        onChange={() => toggle(entry.id)}
                      />
                    </td>
                    <td className="py-2">
                      <Link
                        to="/entries/$id"
                        params={{ id: entry.id }}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {depth > 0 && <span aria-hidden="true">{'\u2014 '.repeat(depth)}</span>}
                        {entry.title || t('(no title)')}
                      </Link>
                      {entry.hasUnpublishedChanges && (
                        <span className="ml-2 text-xs text-amber-700">
                          {t('unpublished changes')}
                        </span>
                      )}
                      {entry.status !== 'trashed' && (
                        <div className="text-xs opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            className="text-sky-700 hover:underline"
                            onClick={() => setEditing(entry.id)}
                          >
                            {t('Quick Edit')}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2">{entry.author?.displayName ?? '—'}</td>
                    {multilingual && <td className="py-2 uppercase">{entry.locale}</td>}
                    <td className="py-2">{t(STATUS_LABELS[entry.status])}</td>
                    {hierarchical && <td className="py-2">{entry.position}</td>}
                    <td className="py-2 text-slate-600">
                      {formatDate(entry.publishedAt ?? entry.scheduledAt ?? entry.updatedAt)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
        {list.hasNextPage && (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {t('Load more')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Inline editing of title, slug and order (RF-ADM-03). */
function QuickEditRow({
  entry,
  hierarchical,
  columns,
  onClose,
}: {
  entry: EntrySummary;
  hierarchical: boolean;
  columns: number;
  onClose: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(entry.title);
  const [slug, setSlug] = useState(entry.slug);
  const [position, setPosition] = useState(String(entry.position));
  const save = useMutation({
    mutationFn: () =>
      api<EntryView>('PATCH', `/entries/${entry.id}`, {
        title,
        ...(slug !== entry.slug ? { slug } : {}),
        ...(hierarchical ? { position: Number(position) || 0 } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
      onClose();
    },
  });
  const input = 'w-full rounded border border-slate-300 px-2 py-1';
  return (
    <tr className="border-b border-slate-100 bg-slate-50">
      <td colSpan={columns} className="p-3">
        <form
          aria-label={t('Quick Edit')}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-600">{t('Title')}</span>
              <input
                className={input}
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-600">{t('Slug')}</span>
              <input className={input} value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
            {hierarchical && (
              <label className="space-y-1">
                <span className="block text-xs font-medium text-slate-600">{t('Order')}</span>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </label>
            )}
          </div>
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {t('Update')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
