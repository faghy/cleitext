import { ApiError, api as coreApi, type AdminPageProps, type Method } from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';
import type { PricingRules } from '../catalog';
import type { ProductList } from '../list';
import type { AttributeView, ProductView } from '../products';

/** What the admin pages of the shop share: the API, the setup and small helpers. */

export type { AttributeView, PricingRules, ProductList, ProductView };
export type ShopApi = AdminPageProps['api'];

export interface Term {
  id: string;
  taxonomy: string;
  locale: string;
  slug: string;
  name: string;
  parentId: string | null;
  url: string;
  description: string | null;
  fields: Record<string, unknown>;
  position: number;
}

export interface Setup {
  settings: {
    currency: string;
    pricesIncludeTax: boolean;
    weightUnit: string;
    dimensionUnit: string;
    lowStock: number;
    wizard: boolean;
  };
  pricing: PricingRules;
  categories: Term[];
  brands: Term[];
  attributes: AttributeView[];
}

export function useSetup(api: ShopApi) {
  return useQuery({
    queryKey: ['shop', 'setup'],
    queryFn: () => api<Setup>('GET', '/setup'),
    staleTime: 30_000,
  });
}

/** Calls the core API (`/api/v1…`) with the user's session. */
export const core = <T,>(method: Method, path: string, body?: unknown) =>
  coreApi<T>(method, path, body);

/** "Phones › Smartphones" for each term, and whether it has children. */
export function termPaths(
  terms: Term[],
): Map<string, { path: string; leaf: boolean; depth: number }> {
  const byId = new Map(terms.map((t) => [t.id, t]));
  const parents = new Set(terms.flatMap((t) => (t.parentId ? [t.parentId] : [])));
  const result = new Map<string, { path: string; leaf: boolean; depth: number }>();
  for (const term of terms) {
    const names = [term.name];
    let parent = term.parentId ? byId.get(term.parentId) : undefined;
    for (let depth = 0; parent && depth < 20; depth++) {
      names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    result.set(term.id, {
      path: names.join(' › '),
      leaf: !parents.has(term.id),
      depth: names.length - 1,
    });
  }
  return result;
}

/** Terms as a tree, depth first, siblings by position then name. */
export function termTree<T extends Term>(terms: T[]): { term: T; depth: number }[] {
  const children = new Map<string | null, T[]>();
  const ids = new Set(terms.map((t) => t.id));
  for (const term of terms) {
    const parent = term.parentId && ids.has(term.parentId) ? term.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), term]);
  }
  const rows: { term: T; depth: number }[] = [];
  const visit = (parent: string | null, depth: number) => {
    const siblings = (children.get(parent) ?? []).sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );
    for (const term of siblings) {
      rows.push({ term, depth });
      visit(term.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** An amount in the shop's currency, in the admin's language. */
export function formatMoney(
  value: string | number | null,
  currency: string,
  locale: string,
): string {
  if (value === null || value === '') return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      useGrouping: 'always',
    }).format(Number(value));
  } catch {
    return Number(value).toFixed(2);
  }
}

/** "12.5000" → "12.50" for inputs; empty for null. */
export function moneyInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toFixed(2);
}

/** Messages of invalid fields, by path (`product.regularPrice`). */
export function fieldErrors(error: unknown): Record<string, string> {
  const errors = error instanceof ApiError ? (error.problem.errors ?? []) : [];
  return Object.fromEntries(errors.map((e) => [e.path, e.message]));
}

/** The product page: `?product=<id>` or `?product=new` keeps the editor in the address. */
export function useAddress() {
  const read = () => new URLSearchParams(window.location.search);
  const go = (params: Record<string, string | null>, replace = false) => {
    const next = read();
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const url = `${window.location.pathname}${next.size > 0 ? `?${next}` : ''}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return { read, go };
}

/** "1 product", "3 products". */
export function productCount(
  t: (text: string, values?: Record<string, string | number>) => string,
  count: number,
) {
  return count === 1 ? t('1 product') : t('{count} products', { count });
}

/** Tax classes of products, with their labels (Italy's rates as a hint). */
export const TAX_CLASS_OPTIONS: [string, string][] = [
  ['', 'Standard'],
  ['reduced', 'Reduced (e.g. 10%)'],
  ['second-reduced', 'Second reduced (e.g. 5%)'],
  ['super-reduced', 'Super-reduced (e.g. 4%)'],
  ['zero', 'Zero'],
];
