import { Alert, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { backordersOf, categoryPaths, columnOf, parseCsv, yesNo, type Column } from '../csv';
import { parseMoney } from '../pricing';
import { core, useSetup, type Setup, type Term } from './shared';

interface Parsed {
  name: string;
  columns: (Column | undefined)[];
  headers: string[];
  rows: string[][];
}

interface Outcome {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** HTML of a WooCommerce description → paragraphs of plain text. */
function plainParagraphs(html: string): string {
  const marked = html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n');
  const text = new DOMParser().parseFromString(marked, 'text/html').body.textContent ?? '';
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');
}

function paragraphs(text: string) {
  return {
    schema: 1,
    blocks: text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => ({
        id: crypto.randomUUID(),
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: p }],
      })),
  };
}

const money = (value: string) => {
  const text = value.trim();
  return text === '' ? null : parseMoney(text);
};
const number = (value: string) => {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`"${value}" is not a number`);
  return n;
};
const date = (value: string) => {
  const text = value.trim();
  if (!text) return null;
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) throw new Error(`"${value}" is not a date`);
  return parsed.toISOString();
};

/** Import from CSV (WooCommerce's export or the shop's own), in the browser, row by row. */
export function ImportPanel({
  api,
  site,
  onClose,
}: Pick<AdminPageProps, 'api' | 'site'> & { onClose: () => void }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const setup = useSetup(api);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState(site.defaultLocale);
  const [update, setUpdate] = useState(true);
  const [create, setCreate] = useState(true);
  const [makeTerms, setMakeTerms] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const read = async (file: File) => {
    setError(null);
    setOutcome(null);
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError(t('The file has no products.'));
    const headers = rows[0]!;
    const columns = headers.map(columnOf);
    if (!columns.includes('title') && !columns.includes('sku') && !columns.includes('id'))
      return setError(t('The file needs a column with the name, the code (SKU) or the ID.'));
    setParsed({ name: file.name, headers, columns, rows: rows.slice(1) });
  };

  const run = async (data: Parsed, shop: Setup) => {
    const result: Outcome = { created: 0, updated: 0, skipped: 0, errors: [] };
    const cell = (row: string[], column: Column) => {
      const index = data.columns.indexOf(column);
      return index < 0 ? undefined : (row[index] ?? '');
    };
    const has = (column: Column) => data.columns.includes(column);
    const match = await api<{ ids: string[]; skus: Record<string, string> }>(
      'POST',
      '/import/match',
      {
        ids: data.rows.map((r) => cell(r, 'id') ?? '').filter((v) => /^[0-9a-f-]{36}$/i.test(v)),
        skus: data.rows.map((r) => (cell(r, 'sku') ?? '').trim()).filter(Boolean),
      },
    );

    // Categories by their path in this language, and brands by name: found or made.
    const categories = shop.categories.filter((c) => c.locale === locale);
    const brands = new Map(
      shop.brands.filter((b) => b.locale === locale).map((b) => [b.name.toLowerCase(), b.id]),
    );
    const categoryId = async (path: string[]): Promise<string | null> => {
      let parent: string | null = null;
      for (const name of path) {
        let term: Term | undefined = categories.find(
          (c) => c.parentId === parent && c.name.toLowerCase() === name.toLowerCase(),
        );
        if (!term) {
          if (!makeTerms) return null;
          term = await core<Term>('POST', '/taxonomies/product-category/terms', {
            name,
            locale,
            ...(parent ? { parentId: parent } : {}),
          });
          categories.push(term);
        }
        parent = term.id;
      }
      return parent;
    };
    const brandId = async (name: string): Promise<string | null> => {
      const key = name.trim().toLowerCase();
      if (!key) return null;
      if (brands.has(key)) return brands.get(key)!;
      if (!makeTerms) return null;
      const term = await core<Term>('POST', '/taxonomies/brand/terms', {
        name: name.trim(),
        locale,
      });
      brands.set(key, term.id);
      return term.id;
    };

    for (const [index, row] of data.rows.entries()) {
      setProgress(index / data.rows.length);
      try {
        const rowId = cell(row, 'id')?.trim() ?? '';
        const sku = cell(row, 'sku')?.trim() ?? '';
        let id = match.ids.includes(rowId)
          ? rowId
          : sku
            ? (match.skus[sku.toLowerCase()] ?? null)
            : null;
        if ((id && !update) || (!id && !create)) {
          result.skipped++;
          continue;
        }
        const title = cell(row, 'title')?.trim();
        if (!id && !title) throw new Error(t('A new product needs a name.'));
        const isNew = !id;
        if (!id) {
          id = (await core<{ id: string }>('POST', '/entries', { type: 'product', title, locale }))
            .id;
          if (sku) match.skus[sku.toLowerCase()] = id;
        }

        const entry: Record<string, unknown> = {};
        if (title) entry.title = title;
        if (has('excerpt')) entry.excerpt = plainParagraphs(cell(row, 'excerpt') ?? '') || null;
        if (has('description'))
          entry.document = paragraphs(plainParagraphs(cell(row, 'description') ?? ''));
        const terms: Record<string, string[]> = {};
        if (has('categories')) {
          const ids = [];
          for (const path of categoryPaths(cell(row, 'categories') ?? '')) {
            const found = await categoryId(path);
            if (found) ids.push(found);
          }
          terms['product-category'] = ids;
        }
        if (has('brand')) {
          const found = await brandId((cell(row, 'brand') ?? '').split(',')[0] ?? '');
          terms.brand = found ? [found] : [];
        }
        if (Object.keys(terms).length > 0) entry.terms = terms;
        if (Object.keys(entry).length > 0) await core('PATCH', `/entries/${id}`, entry);

        const product: Record<string, unknown> = {};
        const text = (column: Column, key: string = column) => {
          if (has(column)) product[key] = (cell(row, column) ?? '').trim();
        };
        text('sku');
        text('gtin');
        text('shippingClass');
        text('purchaseNote');
        if (has('taxClass')) product.taxClass = (cell(row, 'taxClass') ?? '').trim().toLowerCase();
        for (const column of ['cost', 'listPrice', 'regularPrice', 'salePrice'] as const)
          if (has(column)) product[column] = money(cell(row, column)!);
        for (const column of ['weight', 'length', 'width', 'height'] as const)
          if (has(column)) product[column] = number(cell(row, column)!);
        for (const column of ['saleFrom', 'saleTo'] as const)
          if (has(column)) product[column] = date(cell(row, column)!);
        if (has('kind')) {
          const kind = (cell(row, 'kind') ?? '').toLowerCase();
          if (kind.includes('variable')) product.kind = 'variable';
          else if (kind.includes('simple') || kind === '') product.kind = 'simple';
        }
        if (has('condition')) {
          const value = (cell(row, 'condition') ?? '').trim().toLowerCase();
          product.condition = /used|usato/.test(value)
            ? 'used'
            : /refurb|ricondiz/.test(value)
              ? 'refurbished'
              : 'new';
        }
        if (has('stock')) {
          const stock = number(cell(row, 'stock')!);
          product.manageStock = stock !== null;
          product.stock = stock === null ? null : Math.round(stock);
        }
        if (has('inStock')) {
          const value = (cell(row, 'inStock') ?? '').trim().toLowerCase();
          product.stockStatus =
            value === 'backorder'
              ? 'onbackorder'
              : yesNo(value) === false
                ? 'outofstock'
                : 'instock';
        }
        if (has('lowStock')) {
          const low = number(cell(row, 'lowStock')!);
          product.lowStock = low === null ? null : Math.round(low);
        }
        if (has('backorders')) product.backorders = backordersOf(cell(row, 'backorders')!) ?? 'no';
        if (has('soldIndividually'))
          product.soldIndividually = yesNo(cell(row, 'soldIndividually')!) === true;
        if (has('featured')) product.featured = yesNo(cell(row, 'featured')!) === true;
        if (has('taxStatus')) {
          const value = (cell(row, 'taxStatus') ?? '').trim().toLowerCase();
          if (['taxable', 'shipping', 'none'].includes(value)) product.taxStatus = value;
        }
        if (has('visibility')) {
          const value = (cell(row, 'visibility') ?? '').trim().toLowerCase();
          if (['visible', 'catalog', 'search', 'hidden'].includes(value))
            product.visibility = value;
        }
        // Pictures (WooCommerce lists their addresses, comma separated): the first is the
        // product's picture, the others its gallery.
        if (has('images')) {
          const urls = (cell(row, 'images') ?? '')
            .split(',')
            .map((u) => u.trim())
            .filter((u) => /^https?:\/\//i.test(u))
            .slice(0, 20);
          if (urls.length > 0) {
            const { images } = await api<{
              images: ({ id: string; url: string } | { error: string; source: string })[];
            }>('POST', '/import/images', { urls });
            const ok = images.filter((i): i is { id: string; url: string } => 'id' in i);
            for (const failed of images.filter((i) => 'error' in i))
              result.errors.push({
                row: index + 2,
                message: t('Picture not downloaded ({source}): {error}', {
                  source: (failed as { source: string }).source,
                  error: (failed as { error: string }).error,
                }),
              });
            if (ok[0]) await core('PATCH', `/entries/${id}`, { featuredMediaId: ok[0].id });
            product.gallery = ok.slice(1).map((i) => ({ id: i.id, caption: '' }));
          }
        }
        await api('PUT', `/products/${id}`, { product });

        if (has('published') && (cell(row, 'published') ?? '').trim() === '1')
          await core('POST', `/entries/${id}/publish`);
        if (isNew) result.created++;
        else result.updated++;
      } catch (err) {
        result.errors.push({
          row: index + 2,
          message: err instanceof Error && !('problem' in err) ? err.message : errorMessage(err),
        });
      }
    }
    setProgress(null);
    setOutcome(result);
    await queryClient.invalidateQueries({ queryKey: ['shop'] });
  };

  const known = parsed?.columns.filter(Boolean).length ?? 0;
  const ignored = parsed?.headers.filter((_, i) => !parsed.columns[i]) ?? [];
  return (
    <section className="sh-card sh-stack" aria-labelledby="sh-import">
      <div className="sh-row sh-between">
        <h2 id="sh-import" style={{ margin: 0 }}>
          {t('Import products')}
        </h2>
        <button type="button" className="sh-btn" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
      <p className="sh-muted">
        {t(
          'A CSV file with a header row: the shop’s export, or a WooCommerce product export. Products are matched by ID, then by code (SKU).',
        )}
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={t('CSV file')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {error && <Alert>{error}</Alert>}
      {parsed && !outcome && (
        <div className="sh-stack">
          <p>
            {t('{rows} products in {file}; {known} columns recognized.', {
              rows: parsed.rows.length,
              file: parsed.name,
              known,
            })}
          </p>
          {ignored.length > 0 && (
            <p className="sh-small sh-muted">
              {t('Ignored columns:')} {ignored.join(', ')}
            </p>
          )}
          {parsed.columns.includes('images') && (
            <p className="sh-small sh-muted">
              {t(
                'Pictures are downloaded from their addresses: the first becomes the product picture, the others its gallery. Keep the old site online until the import ends.',
              )}
            </p>
          )}
          <div className="sh-row">
            <label className="sh-check">
              <input
                type="checkbox"
                checked={update}
                onChange={(e) => setUpdate(e.target.checked)}
              />
              {t('Update the products already in the shop')}
            </label>
            <label className="sh-check">
              <input
                type="checkbox"
                checked={create}
                onChange={(e) => setCreate(e.target.checked)}
              />
              {t('Add the new ones')}
            </label>
            <label className="sh-check">
              <input
                type="checkbox"
                checked={makeTerms}
                onChange={(e) => setMakeTerms(e.target.checked)}
              />
              {t('Create missing categories and brands')}
            </label>
            {site.locales.length > 1 && (
              <select
                aria-label={t('Language')}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                {site.locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {progress === null ? (
            <div>
              <button
                type="button"
                className="sh-btn sh-btn-primary"
                disabled={!setup.data}
                onClick={() => void run(parsed, setup.data!)}
              >
                {t('Import')}
              </button>
            </div>
          ) : (
            <div
              className="sh-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-label={t('Import')}
            >
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {outcome && (
        <div className="sh-stack">
          <Alert kind={outcome.errors.length ? 'error' : 'success'}>
            {t('Added {created}, updated {updated}, skipped {skipped}, with errors {errors}.', {
              created: outcome.created,
              updated: outcome.updated,
              skipped: outcome.skipped,
              errors: outcome.errors.length,
            })}
          </Alert>
          {outcome.errors.length > 0 && (
            <ul className="sh-small">
              {outcome.errors.slice(0, 100).map((e) => (
                <li key={e.row}>
                  {t('Row {row}:', { row: e.row })} {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
