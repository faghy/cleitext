import { useT } from '@cleitext/admin-sdk';
import type { AuditListResponse } from '@cleitext/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ACTION_FILTERS } from '../activity';
import { api, errorMessage } from '../api';
import { ActivityList } from '../components/activity-list';
import { Alert, Button, Card } from '../components/ui';

/** Activity log of the site (RF-ADM-06). */
export function ActivityPage() {
  const { t } = useT();
  const [action, setAction] = useState('');
  const log = useInfiniteQuery({
    queryKey: ['audit', action],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (action) params.set('action', action);
      if (pageParam) params.set('cursor', pageParam);
      return api<AuditListResponse>('GET', `/audit?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Activity')}</h1>
      <div role="group" aria-label={t('Filter')} className="flex flex-wrap gap-2 text-sm">
        {ACTION_FILTERS.map((filter) => (
          <button
            key={filter.action}
            type="button"
            aria-pressed={action === filter.action}
            onClick={() => setAction(filter.action)}
            className={`rounded px-2 py-1 ${action === filter.action ? 'bg-sky-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {t(filter.label)}
          </button>
        ))}
      </div>
      {log.error && <Alert>{errorMessage(log.error)}</Alert>}
      <Card>
        <ActivityList items={items} showIp />
      </Card>
      {log.hasNextPage && (
        <Button
          variant="secondary"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          {t('Load more')}
        </Button>
      )}
    </div>
  );
}
