import type { EntryListResponse, EntryStatus, EntryView } from '@cleitext/shared';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card } from '../components/ui';

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

/** WordPress-like list of entries of one type (Posts, Pages). */
export function EntriesListPage({ type, title }: { type: string; title: string }) {
  const { t } = useT();
  const me = useMe();
  const navigate = useNavigate();
  const [status, setStatus] = useState<EntryStatus | undefined>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const list = useInfiniteQuery({
    queryKey: ['entries', type, status, query],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ type, limit: '20' });
      if (status) params.set('status', status);
      if (query) params.set('q', query);
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

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const multilingual = me.site.locales.length > 1;

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
              onClick={() => setStatus(filter.status)}
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
                <th className="py-2 font-medium">{t('Title')}</th>
                <th className="py-2 font-medium">{t('Author')}</th>
                {multilingual && <th className="py-2 font-medium">{t('Language')}</th>}
                <th className="py-2 font-medium">{t('Status')}</th>
                <th className="py-2 font-medium">{t('Date')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      to="/entries/$id"
                      params={{ id: entry.id }}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {entry.title || t('(no title)')}
                    </Link>
                    {entry.hasUnpublishedChanges && (
                      <span className="ml-2 text-xs text-amber-700">
                        {t('unpublished changes')}
                      </span>
                    )}
                  </td>
                  <td className="py-2">{entry.author?.displayName ?? '—'}</td>
                  {multilingual && <td className="py-2 uppercase">{entry.locale}</td>}
                  <td className="py-2">{t(STATUS_LABELS[entry.status])}</td>
                  <td className="py-2 text-slate-600">
                    {formatDate(entry.publishedAt ?? entry.scheduledAt ?? entry.updatedAt)}
                  </td>
                </tr>
              ))}
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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
