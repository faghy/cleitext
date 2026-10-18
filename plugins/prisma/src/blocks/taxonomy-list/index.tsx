import type { Sheet } from '@cleitext/design';
import { createElement, useEffect, useState, type ReactNode } from 'react';
import { blockClass } from '../../lib/css';
import { border, borderDefaults, DEVICES, emit, px, typography } from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { apiGet, postTypeOf, taxonomyOf } from '../post-grid/posts';

/** A term as the list shows it, with its children. */
export interface TaxonomyTerm {
  id: string;
  name: string;
  url: string;
  count: number;
  children: TaxonomyTerm[];
}
export interface TaxonomyData {
  terms: TaxonomyTerm[];
  locale: string;
}

function typo(p: string, extra: Attrs = {}): Attrs {
  return {
    [`${p}FontSize`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}FontSizeMobile`]: '',
    [`${p}FontSizeTablet`]: '',
    [`${p}FontFamily`]: '',
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LineHeight`]: '',
    [`${p}LineHeightTablet`]: '',
    [`${p}LineHeightMobile`]: '',
    [`${p}LoadGoogleFonts`]: false,
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}LetterSpacing`]: '',
    [`${p}LetterSpacingTablet`]: '',
    [`${p}LetterSpacingMobile`]: '',
    [`${p}LetterSpacingType`]: 'px',
    ...extra,
  };
}

const DEFAULTS: Attrs = {
  postType: 'article',
  taxonomyType: 'category',
  titleTag: '',
  categories: '',
  order: 'desc',
  orderBy: 'date',
  postsToShow: 8,
  layout: 'grid',
  columns: 3,
  tcolumns: 2,
  mcolumns: 1,
  bgColor: '#f5f5f5',
  titleColor: '#3b3b3b',
  countColor: '#777777',
  listTextColor: '#3b3b3b',
  hoverlistTextColor: '#3b3b3b',
  listStyleColor: '#3b3b3b',
  hoverlistStyleColor: '#3b3b3b',
  rowGap: 20,
  rowGapTablet: '',
  rowGapMobile: '',
  columnGap: 20,
  columnGapTablet: '',
  columnGapMobile: '',
  contentPadding: 20,
  contentPaddingMobile: 15,
  contentPaddingTablet: 15,
  contentPaddingUnit: 'px',
  mobileContentPaddingUnit: 'px',
  tabletContentPaddingUnit: 'px',
  contentPaddingLink: false,
  titleBottomSpace: 5,
  titleBottomSpaceTablet: '',
  titleBottomSpaceMobile: '',
  listBottomMargin: 10,
  alignment: 'center',
  listStyle: 'disc',
  boxShadowColor: '#00000070',
  boxShadowHOffset: 0,
  boxShadowVOffset: 0,
  boxShadowBlur: '',
  boxShadowSpread: '',
  boxShadowPosition: 'outset',
  ...typo('title', { titleLetterSpacing: 0 }),
  ...typo('count'),
  ...typo('list'),
  noTaxDisplaytext: 'Taxonomy Not Available.',
  showCount: true,
  showEmptyTaxonomy: false,
  showhierarchy: false,
  listDisplayStyle: 'list',
  seperatorStyle: 'none',
  seperatorWidth: 100,
  seperatorThickness: 1,
  seperatorColor: '#b2b4b5',
  seperatorHoverColor: '#b2b4b5',
  // The box border, as the editor sets it from the older single border.
  ...borderDefaults('overall'),
  overallBorderStyle: 'solid',
  overallBorderTopWidth: 1,
  overallBorderRightWidth: 1,
  overallBorderBottomWidth: 1,
  overallBorderLeftWidth: 1,
  overallBorderTopLeftRadius: 0,
  overallBorderTopRightRadius: 0,
  overallBorderBottomLeftRadius: 0,
  overallBorderBottomRightRadius: 0,
  overallBorderColor: '#E0E0E0',
  borderStyle: 'solid',
  borderWidth: 1,
  borderRadius: 0,
  borderColor: '#E0E0E0',
};

const pick = (v: unknown, fallback: unknown) => (v === undefined || v === null ? fallback : v);

function css(a: Attrs, B: string, sheet: Sheet): void {
  const GRID = `${B}.pr-taxonomy-list--grid`;
  const LIST = `${B}.pr-taxonomy-list--list`;
  for (const device of DEVICES) {
    const d = device === 'desktop';
    const s = d ? '' : device === 'tablet' ? 'Tablet' : 'Mobile';
    const cols = d ? a.columns : device === 'tablet' ? a.tcolumns : a.mcolumns;
    const fallback = a[`contentPadding${s}`];
    const unit = d ? a.contentPaddingUnit : a[`${device}ContentPaddingUnit`];
    emit(sheet, device, GRID, {
      ...(d ? { display: 'grid' } : {}),
      'grid-template-columns': `repeat(${Math.max(1, Math.trunc(Number(cols)) || 1)}, 1fr)`,
      'grid-column-gap': px(a[`columnGap${s}`]),
      'grid-row-gap': px(a[`rowGap${s}`]),
    });
    emit(sheet, device, `${GRID} .pr-taxonomy-list__box`, {
      'padding-left': px(pick(a[`contentLeftPadding${s}`], fallback), unit),
      'padding-right': px(pick(a[`contentRightPadding${s}`], fallback), unit),
      'padding-top': px(pick(a[`contentTopPadding${s}`], fallback), unit),
      'padding-bottom': px(pick(a[`contentBottomPadding${s}`], fallback), unit),
    });
    emit(sheet, device, `${GRID} .pr-taxonomy-list__title`, {
      'margin-bottom': px(a[`titleBottomSpace${s}`]),
    });
    emit(sheet, device, `${B} .pr-taxonomy-list__box`, border(a, 'overall', device));
    emit(sheet, device, `${GRID} .pr-taxonomy-list__title`, typography(a, 'title', device));
    emit(sheet, device, `${GRID} .pr-taxonomy-list__link`, typography(a, 'count', device));
    emit(sheet, device, `${LIST} .pr-taxonomy-list__item`, typography(a, 'list', device));
  }
  const position = a.boxShadowPosition === 'outset' ? '' : String(a.boxShadowPosition ?? '');
  const shadow = [
    px(a.boxShadowHOffset),
    px(a.boxShadowVOffset),
    px(a.boxShadowBlur),
    px(a.boxShadowSpread),
  ]
    .filter(Boolean)
    .join(' ');
  emit(sheet, 'desktop', `${GRID} .pr-taxonomy-list__box`, {
    'grid-column-gap': px(a.columnGap),
    'background-color': a.bgColor,
    'text-align': a.alignment,
    'box-shadow': `${shadow} ${String(a.boxShadowColor ?? '')} ${position}`.trim(),
  });
  emit(sheet, 'desktop', `${GRID} .pr-taxonomy-list__title`, {
    color: a.titleColor,
    'margin-top': '0',
  });
  emit(sheet, 'desktop', `${GRID} .pr-taxonomy-list__link`, { color: a.countColor });
  emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__item`, {
    'list-style': a.listStyle,
    color: a.listStyleColor,
  });
  emit(
    sheet,
    'desktop',
    `${LIST} .pr-taxonomy-list__item:hover, ${LIST} .pr-taxonomy-list__link-wrap:hover`,
    {
      color: a.hoverlistStyleColor,
    },
  );
  emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__item a.pr-taxonomy-list__link`, {
    color: a.listTextColor,
  });
  emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__item a.pr-taxonomy-list__link:hover`, {
    color: a.hoverlistTextColor,
  });
  emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__item .pr-taxonomy-list__link-wrap`, {
    'margin-bottom': px(a.listBottomMargin),
  });
  if (a.seperatorStyle !== 'none') {
    emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__separator`, {
      'border-top-color': a.seperatorColor,
      'border-top-style': a.seperatorStyle,
      'border-top-width': px(a.seperatorThickness),
      width: px(a.seperatorWidth, '%'),
    });
  }
  emit(sheet, 'desktop', `${LIST} .pr-taxonomy-list__separator:hover`, {
    'border-top-color': a.seperatorHoverColor,
  });
  emit(sheet, 'desktop', `${B} .pr-taxonomy-list__box:hover`, {
    'border-color': a.overallBorderHColor,
  });
}

/** Terms by parent: the top level, each with its children. */
export function termTree(
  terms: { id: string; name: string; url: string; count?: number; parentId: string | null }[],
  showEmpty: boolean,
): TaxonomyTerm[] {
  const byName = [...terms].sort((x, y) => x.name.localeCompare(y.name));
  const visible = byName.filter((t) => showEmpty || (t.count ?? 0) > 0);
  const ids = new Set(visible.map((t) => t.id));
  const make = (parent: string | null): TaxonomyTerm[] =>
    visible
      .filter((t) =>
        parent === null ? !t.parentId || !ids.has(t.parentId) : t.parentId === parent,
      )
      .map((t) => ({
        id: t.id,
        name: t.name,
        url: t.url,
        count: t.count ?? 0,
        children: make(t.id),
      }));
  return make(null);
}

/** "Post"/"Posts" (or a page's), as WordPress's labels of the content type. */
function countLabel(type: string, count: number, locale: string): string {
  const it = locale.startsWith('it');
  const one = count === 1;
  if (type === 'page') return it ? (one ? 'Pagina' : 'Pagine') : one ? 'Page' : 'Pages';
  if (type === 'article') return it ? (one ? 'Articolo' : 'Articoli') : one ? 'Post' : 'Posts';
  return it ? (one ? 'Elemento' : 'Elementi') : one ? 'Item' : 'Items';
}

/** The terms in the editor, through the admin API. */
function useEditorTerms(a: Attrs, editing: boolean): TaxonomyData | undefined {
  const taxonomy = taxonomyOf(a.taxonomyType);
  const key = editing ? `${taxonomy}|${String(a.showEmptyTaxonomy)}` : '';
  const [state, setState] = useState<{ key: string; data: TaxonomyData } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    apiGet<{ id: string; name: string; parentId: string | null; count: number }[]>(
      `/taxonomies/${encodeURIComponent(taxonomy)}/terms`,
    )
      .then((terms) => terms.map((t) => ({ ...t, url: '#' })))
      .catch(() => [])
      .then((terms) => {
        if (live)
          setState({
            key,
            data: {
              terms: termTree(terms, Boolean(a.showEmptyTaxonomy)),
              locale: document.documentElement.lang || 'en',
            },
          });
      });
    return () => {
      live = false;
    };
  }, [key]);
  return state && state.key === key ? state.data : undefined;
}

const GRID_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'];

function ListItems({ terms, a, tag }: { terms: TaxonomyTerm[]; a: Attrs; tag: string }): ReactNode {
  return terms.map((term) => (
    <li key={term.id} className="pr-taxonomy-list__item">
      {createElement(
        tag,
        { className: 'pr-taxonomy-list__link-wrap' },
        <a className="pr-taxonomy-list__link" href={term.url}>
          {term.name}
        </a>,
        a.showCount ? ` (${term.count}) ` : ' ',
      )}
      <div className="pr-taxonomy-list__separator" />
      {a.showhierarchy && term.children.length ? (
        <ul className="pr-taxonomy-list__children">
          <ListItems terms={term.children} a={a} tag={tag} />
        </ul>
      ) : null}
    </li>
  ));
}

function View({ attrs: a, id, root, editing, data }: ViewProps) {
  const fetched = useEditorTerms(a, editing);
  const given = data as TaxonomyData | undefined;
  const tax = editing ? fetched : given && Array.isArray(given.terms) ? given : undefined;
  const terms = tax?.terms ?? [];
  const layout = a.layout === 'list' ? 'list' : 'grid';
  const locale = tax?.locale ?? 'en';
  const tag = GRID_TAGS.includes(String(a.titleTag))
    ? String(a.titleTag)
    : layout === 'grid'
      ? 'h4'
      : 'div';
  const type = postTypeOf(a.postType);
  let content: ReactNode;
  if (terms.length === 0) {
    content = (
      <div className="pr-taxonomy-list__empty">
        {editing && !tax ? 'Loading…' : String(a.noTaxDisplaytext ?? '')}
      </div>
    );
  } else if (layout === 'grid') {
    content = terms.map((term) => (
      <div key={term.id} className="pr-taxonomy-list__box">
        <a className="pr-taxonomy-list__link" href={term.url}>
          {createElement(tag, { className: 'pr-taxonomy-list__title' }, term.name)}
          {a.showCount ? `${term.count} ${countLabel(type, term.count, locale)}` : null}
        </a>
      </div>
    ));
  } else if (a.listDisplayStyle === 'dropdown') {
    content = (
      <select
        className="pr-taxonomy-list__dropdown"
        data-pr-taxonomy-list=""
        aria-label="Select"
        defaultValue=""
      >
        <option value=""> -- Select -- </option>
        {terms.map((term) => (
          <option key={term.id} value={term.url}>
            {term.name}
            {a.showCount ? ` (${term.count})` : ''}
          </option>
        ))}
      </select>
    );
  } else {
    content = (
      <ul className="pr-taxonomy-list__list">
        <ListItems terms={terms} a={a} tag={tag} />
      </ul>
    );
  }
  return root(
    'div',
    {
      className: `wp-block-prisma-taxonomy-list pr-taxonomy-list pr-taxonomy-list--${layout} ${blockClass(id)}`,
    },
    content,
  );
}

export const taxonomyList: PrismaBlock = {
  name: 'taxonomy-list',
  title: 'Taxonomy List',
  description: 'The categories or tags of the site, as boxes or a list, with their post counts.',
  keywords: ['taxonomy', 'categories', 'tags', 'terms', 'list'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'taxonomy-list.js', marker: 'data-pr-taxonomy-list' },
  load: async (a, context, ctx) => {
    // Terms change with the site, their counts with every published entry.
    context.tag('site');
    context.tag('search');
    const terms = await ctx.terms.find(context.siteId, {
      taxonomy: taxonomyOf(a.taxonomyType),
      locale: context.locale,
      withCounts: true,
      limit: 500,
    });
    return {
      terms: termTree(terms, Boolean(a.showEmptyTaxonomy)),
      locale: context.locale,
    } satisfies TaxonomyData;
  },
  spectra: {
    'uagb/taxonomy-list': (a, src) => {
      const attrs: Attrs = { ...a };
      if (a.postType === 'post') attrs.postType = 'article';
      if (a.taxonomyType === 'post_tag') attrs.taxonomyType = 'tag';
      // Boxes saved before the border settings keep the older single border.
      if (attrs.overallBorderStyle === undefined && a.borderStyle !== undefined) {
        attrs.overallBorderStyle = a.borderStyle;
        for (const side of ['Top', 'Right', 'Bottom', 'Left'])
          attrs[`overallBorder${side}Width`] = a.borderThickness ?? a.borderWidth ?? 1;
        for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'])
          attrs[`overallBorder${corner}Radius`] = a.borderRadius ?? 0;
        if (a.borderColor !== undefined) attrs.overallBorderColor = a.borderColor;
      }
      return [src.block('taxonomy-list', attrs)];
    },
  },
};
