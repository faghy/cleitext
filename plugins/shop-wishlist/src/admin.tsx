import {
  addMessages,
  Alert,
  Button,
  defineAdminPlugin,
  errorMessage,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { IT } from './admin/it';

addMessages('it', IT);

const CSS = `
.wl{max-width:860px;display:flex;flex-direction:column;gap:1rem;color:var(--color-slate-900,#0f172a)}
.wl h1{font-size:1.5rem;font-weight:700;margin:0}
.wl-card{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:1rem;display:flex;flex-direction:column;gap:.6rem}
.wl-card h2{font-size:1rem;font-weight:600;margin:0}
.wl-muted{color:var(--color-slate-500,#64748b);font-size:.875rem}
.wl ol{margin:0;padding-left:1.3rem;font-size:.875rem}
`;

interface Wishlists {
  wishlists: { userId?: number; items?: { sku?: string }[] }[];
}

function WishlistPage({ api }: AdminPageProps) {
  const { t } = useT();
  const [stats, setStats] = useState<{
    lists: number;
    saved: number;
    top: { id: string; title: string; n: number }[];
  } | null>(null);
  const [data, setData] = useState<Wishlists | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    imported: number;
    saved: number;
    skipped: number;
    missing: number;
    reasons: { guest: number; customer: number; products: number };
    linked: boolean;
  } | null>(null);

  const load = () =>
    api<NonNullable<typeof stats>>('GET', '/stats')
      .then(setStats)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const read = async (file: File | undefined) => {
    setError('');
    setData(null);
    setDone(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Wishlists>;
      if (!Array.isArray(parsed.wishlists)) {
        throw new Error(
          t('This export has no wishlists: download the script again from WooCommerce Import.'),
        );
      }
      setData({ wishlists: parsed.wishlists });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const importLists = async () => {
    if (!data) return;
    setBusy(true);
    setError('');
    const total = {
      imported: 0,
      saved: 0,
      skipped: 0,
      missing: 0,
      reasons: { guest: 0, customer: 0, products: 0 },
      linked: true,
    };
    try {
      for (let i = 0; i < data.wishlists.length; i += 200) {
        const r = await api<Partial<typeof total> & typeof total>('POST', '/import', {
          wishlists: data.wishlists.slice(i, i + 200),
        });
        total.imported += r.imported;
        total.saved += r.saved;
        total.skipped += r.skipped;
        total.missing += r.missing ?? 0;
        for (const k of ['guest', 'customer', 'products'] as const)
          total.reasons[k] += r.reasons?.[k] ?? 0;
        total.linked = r.linked;
      }
      setDone(total);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wl">
      <style>{CSS}</style>
      <h1>{t('Wishlist')}</h1>
      {error && <Alert>{error}</Alert>}
      {stats && (
        <section className="wl-card">
          <p>
            {t('{lists} lists, {saved} products saved.', {
              lists: stats.lists,
              saved: stats.saved,
            })}
          </p>
          <h2>{t('Most wished')}</h2>
          {stats.top.length ? (
            <ol>
              {stats.top.map((p) => (
                <li key={p.id}>
                  {p.title} ({p.n})
                </li>
              ))}
            </ol>
          ) : (
            <p className="wl-muted">{t('Nothing saved yet.')}</p>
          )}
        </section>
      )}
      <section className="wl-card">
        <h2>{t('How it works')}</h2>
        <p className="wl-muted">
          {t(
            'A heart appears on every product card and page: customers save products, also without an account (their list joins the account when they sign in). The list is at /wishlist, with a link to share it. Add the «Wishlist link» block to the header to show the count.',
          )}
        </p>
      </section>
      <section className="wl-card">
        <h2>{t('Import from YITH WooCommerce Wishlist')}</h2>
        <p className="wl-muted">
          {t(
            'Choose the export of WooCommerce Import (it holds the lists): customers are found among those imported by WooCommerce Import, products by SKU. Import the customers first.',
          )}
        </p>
        <input
          type="file"
          accept="application/json,.json"
          aria-label={t('Choose the export')}
          onChange={(e) => void read(e.target.files?.[0])}
        />
        {data && (
          <p className="wl-muted">{t('{n} lists in the export.', { n: data.wishlists.length })}</p>
        )}
        <div>
          <Button disabled={!data || busy} onClick={() => void importLists()}>
            {t('Import the lists')}
          </Button>
        </div>
        {done && !done.linked && (
          <Alert>
            {t('WooCommerce Import is not active: lists cannot be linked to customers.')}
          </Alert>
        )}
        {done && (
          <Alert kind="success">
            {t(
              '{imported} lists imported ({saved} products), {skipped} left out (customer or products not found).',
              { imported: done.imported, saved: done.saved, skipped: done.skipped },
            )}
            {done.skipped > 0 && (
              <ul>
                <li>
                  {t('{n} of guests without an account: they cannot be linked to anyone.', {
                    n: done.reasons.guest,
                  })}
                </li>
                <li>
                  {t('{n} of customers not imported by WooCommerce Import.', {
                    n: done.reasons.customer,
                  })}
                </li>
                <li>
                  {t('{n} with none of their products found in Cleishop.', {
                    n: done.reasons.products,
                  })}
                </li>
              </ul>
            )}
            {done.missing > 0 && (
              <p>
                {t('{n} saved products not found in Cleishop (by SKU or slug).', {
                  n: done.missing,
                })}
              </p>
            )}
          </Alert>
        )}
      </section>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Wishlist', it: 'Lista desideri' },
      parent: '/plugins',
      capability: 'manage_wishlist',
      component: WishlistPage,
    },
  ],
});
