import { adminUrl, Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { core } from './shared';
import { CSS } from './styles';

type Status = 'pending' | 'approved' | 'spam' | 'trash';
interface Review {
  id: string;
  productId: string;
  product: string;
  status: Status;
  author: string;
  rating: number;
  verified: boolean;
  content: string;
  createdAt: string;
}

const TABS: [Status | 'any', string][] = [
  ['any', 'All'],
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['spam', 'Spam'],
  ['trash', 'Trash'],
];

/** Shop → Reviews: the products' reviews, moderated like comments (WooCommerce's). */
export function ReviewsPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Status | 'any'>('any');
  const list = useQuery({
    queryKey: ['shop', 'reviews', tab],
    queryFn: () => api<{ items: Review[] }>('GET', `/reviews?status=${tab}`),
    placeholderData: keepPreviousData,
  });
  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      core('POST', '/comments/status', { ids: [id], status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop', 'reviews'] }),
  });
  const actions = (r: Review): [Status, string][] =>
    (
      [
        ['approved', 'Approve'],
        ['pending', 'Unapprove'],
        ['spam', 'Spam'],
        ['trash', 'Trash'],
      ] as [Status, string][]
    ).filter(([status]) => status !== r.status);

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <h1>{t('Reviews')}</h1>
      <p className="sh-muted">
        {t(
          'What customers say about your products, with their rating. New reviews follow the comment moderation settings; “Verified owner” means they bought the product.',
        )}
      </p>
      <div className="sh-tabs" role="tablist">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-current={tab === value}
            onClick={() => setTab(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {(list.error ?? moderate.error) && (
        <Alert>{errorMessage(list.error ?? moderate.error)}</Alert>
      )}
      <div className="sh-card" style={{ overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              <th>{t('Rating')}</th>
              <th>{t('Review')}</th>
              <th className="sh-hide-sm">{t('Product')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((r) => (
              <tr key={r.id} style={{ cursor: 'default' }}>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--color-amber-700)' }}>
                  {r.rating ? (
                    <span aria-label={t('{n} stars', { n: r.rating })}>
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(5 - r.rating)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div>
                    <strong>{r.author}</strong>{' '}
                    {r.verified && (
                      <span className="sh-badge sh-badge-ok">{t('Verified owner')}</span>
                    )}{' '}
                    <span className="sh-small sh-muted">
                      {new Date(r.createdAt).toLocaleString(user.locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <p style={{ margin: '.25rem 0', whiteSpace: 'pre-line' }}>{r.content}</p>
                  <div className="sh-row sh-small">
                    {actions(r).map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        className={`sh-link${status === 'spam' || status === 'trash' ? ' sh-btn-danger' : ''}`}
                        disabled={moderate.isPending}
                        onClick={() => moderate.mutate({ id: r.id, status })}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="sh-hide-sm">
                  <a href={adminUrl(`/ext/shop?product=${r.productId}`)}>{r.product}</a>
                </td>
                <td>
                  <span
                    className={`sh-badge ${r.status === 'approved' ? 'sh-badge-ok' : r.status === 'pending' ? 'sh-badge-warn' : 'sh-badge-out'}`}
                  >
                    {t(TABS.find(([v]) => v === r.status)?.[1] ?? r.status)}
                  </span>
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr style={{ cursor: 'default' }}>
                <td colSpan={4} className="sh-muted">
                  {t('No reviews here.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
