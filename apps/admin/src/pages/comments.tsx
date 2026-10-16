import { adminUrl } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';

type Status = 'pending' | 'approved' | 'spam' | 'trash';

interface CommentView {
  id: string;
  entryId: string;
  entryTitle: string;
  parentId: string | null;
  status: Status;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  content: string;
  ip: string | null;
  createdAt: string;
}

interface CommentList {
  items: CommentView[];
  total: number;
  counts: Record<Status | 'all', number>;
}

export const PENDING_COMMENTS_KEY = ['comments', 'pending-count'];

/** The menu badge: comments waiting for approval. */
export function usePendingComments(enabled: boolean): number {
  const query = useQuery({
    queryKey: PENDING_COMMENTS_KEY,
    queryFn: () => api<{ count: number }>('GET', '/comments/pending-count'),
    enabled,
    staleTime: 60_000,
  });
  return query.data?.count ?? 0;
}

const TABS: { value: '' | Status; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'spam', label: 'Spam' },
  { value: 'trash', label: 'Trash' },
];

/** Comments (RF-COM): moderation as in WordPress. */
export function CommentsPage() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const initial = new URLSearchParams(window.location.search).get('status') ?? '';
  const [status, setStatus] = useState<'' | Status>(
    (['pending', 'approved', 'spam', 'trash'].includes(initial) ? initial : '') as '' | Status,
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replying, setReplying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const list = useQuery({
    queryKey: ['comments', status, search, page],
    queryFn: () =>
      api<CommentList>(
        'GET',
        `/comments?status=${status}&search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ['comments'] });
  };
  const setStatusOf = useMutation({
    mutationFn: (input: { ids: string[]; status: Status }) =>
      api('POST', '/comments/status', input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (ids: string[]) => api('DELETE', '/comments', { ids }),
    onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: (input: { id: string; content: string }) =>
      api('POST', `/comments/${input.id}/reply`, { content: input.content }),
    onSuccess: async () => {
      setReplying(null);
      setDraft('');
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; content: string }) =>
      api('PATCH', `/comments/${input.id}`, { content: input.content }),
    onSuccess: async () => {
      setEditing(null);
      setDraft('');
      await refresh();
    },
  });
  const error = list.error ?? setStatusOf.error ?? remove.error ?? reply.error ?? update.error;
  const items = list.data?.items ?? [];
  const counts = list.data?.counts;
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const dateFormat = new Intl.DateTimeFormat(me.user.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const all = items.length > 0 && items.every((c) => selected.has(c.id));
  const act = (ids: string[], next: Status) => setStatusOf.mutate({ ids, status: next });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Comments')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 text-sm" aria-label={t('Comments')}>
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`rounded px-3 py-1 ${status === tab.value ? 'bg-sky-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              aria-pressed={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
                setSelected(new Set());
              }}
            >
              {t(tab.label)}
              {counts && (
                <span className="ml-1">({tab.value ? counts[tab.value] : counts.all})</span>
              )}
            </button>
          ))}
        </nav>
        <input
          type="search"
          placeholder={t('Search comments')}
          aria-label={t('Search comments')}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(items.map((c) => c.id)) : new Set())
              }
            />
            {t('Select all')}
          </label>
          {selected.size > 0 && (
            <>
              <Button variant="secondary" onClick={() => act([...selected], 'approved')}>
                {t('Approve')}
              </Button>
              <Button variant="secondary" onClick={() => act([...selected], 'pending')}>
                {t('Unapprove')}
              </Button>
              <Button variant="secondary" onClick={() => act([...selected], 'spam')}>
                {t('Spam')}
              </Button>
              {status === 'trash' || status === 'spam' ? (
                <Button variant="danger" onClick={() => remove.mutate([...selected])}>
                  {t('Delete permanently')}
                </Button>
              ) : (
                <Button variant="danger" onClick={() => act([...selected], 'trash')}>
                  {t('Move to trash')}
                </Button>
              )}
            </>
          )}
        </div>
        {list.isLoading ? (
          <p className="text-sm text-slate-500">{t('Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('No comments found.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((comment) => (
              <li
                key={comment.id}
                className={`flex gap-3 py-3 ${comment.status === 'pending' ? 'bg-amber-50/60' : ''}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={t('Select')}
                  checked={selected.has(comment.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(comment.id);
                    else next.delete(comment.id);
                    setSelected(next);
                  }}
                />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-slate-600">
                    <strong className="text-slate-900">{comment.authorName}</strong>
                    {comment.authorEmail && (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          className="text-sky-700 underline"
                          href={`mailto:${comment.authorEmail}`}
                        >
                          {comment.authorEmail}
                        </a>
                      </>
                    )}
                    {comment.ip && <> · {comment.ip}</>}
                    {' · '}
                    {dateFormat.format(new Date(comment.createdAt))}
                    {' · '}
                    <span>
                      {t('on')}{' '}
                      <a
                        className="text-sky-700 underline"
                        href={adminUrl(`/entries/${comment.entryId}`)}
                      >
                        {comment.entryTitle}
                      </a>
                    </span>
                    {comment.status === 'pending' && (
                      <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs text-amber-900">
                        {t('Pending')}
                      </span>
                    )}
                  </p>
                  {editing === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded border border-slate-300 p-2"
                        rows={4}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => update.mutate({ id: comment.id, content: draft })}
                          disabled={!draft.trim()}
                        >
                          {t('Save')}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditing(null)}>
                          {t('Cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-slate-900">{comment.content}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {comment.status !== 'approved' && (
                      <button
                        type="button"
                        className="text-green-700 hover:underline"
                        onClick={() => act([comment.id], 'approved')}
                      >
                        {t('Approve')}
                      </button>
                    )}
                    {comment.status === 'approved' && (
                      <button
                        type="button"
                        className="text-amber-700 hover:underline"
                        onClick={() => act([comment.id], 'pending')}
                      >
                        {t('Unapprove')}
                      </button>
                    )}
                    {comment.status !== 'trash' && comment.status !== 'spam' && (
                      <>
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => {
                            setReplying(comment.id);
                            setDraft('');
                          }}
                        >
                          {t('Reply')}
                        </button>
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => {
                            setEditing(comment.id);
                            setDraft(comment.content);
                          }}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          className="text-slate-600 hover:underline"
                          onClick={() => act([comment.id], 'spam')}
                        >
                          {t('Spam')}
                        </button>
                        <button
                          type="button"
                          className="text-red-700 hover:underline"
                          onClick={() => act([comment.id], 'trash')}
                        >
                          {t('Trash')}
                        </button>
                      </>
                    )}
                    {(comment.status === 'trash' || comment.status === 'spam') && (
                      <>
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => act([comment.id], 'pending')}
                        >
                          {comment.status === 'spam' ? t('Not spam') : t('Restore')}
                        </button>
                        <button
                          type="button"
                          className="text-red-700 hover:underline"
                          onClick={() => remove.mutate([comment.id])}
                        >
                          {t('Delete permanently')}
                        </button>
                      </>
                    )}
                  </div>
                  {replying === comment.id && (
                    <div className="space-y-2 pt-2">
                      <textarea
                        className="w-full rounded border border-slate-300 p-2"
                        rows={3}
                        placeholder={t('Your reply')}
                        aria-label={t('Your reply')}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => reply.mutate({ id: comment.id, content: draft })}
                          disabled={!draft.trim() || reply.isPending}
                        >
                          {comment.status === 'approved' ? t('Reply') : t('Approve and reply')}
                        </Button>
                        <Button variant="secondary" onClick={() => setReplying(null)}>
                          {t('Cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← {t('Previous')}
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t('Next')} →
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
