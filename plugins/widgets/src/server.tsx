import {
  defineBlock,
  definePlugin,
  type BlockLoadContext,
  type PluginContext,
  type PluginTerm,
} from '@cleitext/plugin-sdk';
import type { ReactNode } from 'react';

/**
 * Widgets (official plugin, shipped on its own): the blog blocks of
 * WordPress sidebars and footers, for any page, pattern or theme area.
 * Recent posts (list, grid or magazine, by category or tag), recent
 * comments, a tag cloud, categories with their counts and a search form.
 * Server-rendered, no client JavaScript; one small stylesheet, only on the
 * pages that use them.
 */

type Texts = typeof TEXTS.en;

const TEXTS = {
  en: {
    recentPosts: 'Recent posts',
    recentComments: 'Recent comments',
    tags: 'Tags',
    categories: 'Categories',
    search: 'Search',
    searchPlaceholder: 'Search…',
    noPosts: 'No posts yet.',
    noComments: 'No comments yet.',
    on: 'on',
    by: 'by',
    posts: (n: number) => (n === 1 ? '1 post' : `${n} posts`),
    all: 'All',
    more: (name: string) => `More in ${name}`,
  },
  it: {
    recentPosts: 'Articoli recenti',
    recentComments: 'Commenti recenti',
    tags: 'Tag',
    categories: 'Categorie',
    search: 'Cerca',
    searchPlaceholder: 'Cerca…',
    noPosts: 'Ancora nessun articolo.',
    noComments: 'Ancora nessun commento.',
    on: 'su',
    by: 'di',
    posts: (n: number) => (n === 1 ? '1 articolo' : `${n} articoli`),
    all: 'Tutti',
    more: (name: string) => `Altro in ${name}`,
  },
};

function texts(locale: string): Texts {
  return locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const value = Number(n);
  if (!Number.isFinite(value) || value === 0) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

/** Slugs written by the author, e.g. "news, travel". */
function slugList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s));
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function Title({ text, url }: { text: string; url?: string | null }) {
  if (!text) return null;
  return <h2 className="cxw-widget__title">{url ? <a href={url}>{text}</a> : text}</h2>;
}

/** The title the author wrote, the default one when empty, none with "-". */
function titleOf(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text === '-' ? '' : text || fallback;
}

// ---- Recent posts ------------------------------------------------------------------

interface PostsAttrs {
  title: string;
  layout: 'list' | 'grid' | 'magazine';
  count: number;
  columns: number;
  filter: 'none' | 'category' | 'tag';
  terms: string;
  orderBy: 'date' | 'modified' | 'title' | 'random';
  image: boolean;
  date: boolean;
  author: boolean;
  excerpt: boolean;
  excludeCurrent: boolean;
  tabs: boolean;
}

interface PostTab {
  id: string;
  name: string;
  /** The term's archive, none for "All". */
  url: string | null;
  posts: PostItem[];
}

interface PostsData {
  posts: PostItem[];
  /** The archive of the only category or tag chosen, for the title. */
  link: string | null;
  /** A tab per category or tag, after "All" (with `tabs`). */
  tabs: PostTab[] | null;
}

interface PostItem {
  id: string;
  title: string;
  url: string;
  date: string;
  author: string;
  excerpt: string;
  image: { src: string; srcSet?: string; alt: string; width?: number; height?: number } | null;
}

/** A variant of the image near `width`, with the others for `srcset`. */
function pictureOf(
  image: {
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
    variants: { format: string; url: string; width: number; height: number }[];
  } | null,
  width: number,
): PostItem['image'] {
  if (!image) return null;
  const format = image.variants.find((v) => v.format === 'webp')
    ? 'webp'
    : image.variants[0]?.format;
  const variants = image.variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width);
  const chosen = variants.find((v) => v.width >= width) ?? variants.at(-1);
  if (!chosen) {
    return {
      src: image.url,
      alt: image.alt,
      ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
    };
  }
  return {
    src: chosen.url,
    alt: image.alt,
    width: chosen.width,
    height: chosen.height,
    ...(variants.length > 1
      ? { srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(', ') }
      : {}),
  };
}

async function loadPosts(
  ctx: PluginContext,
  attrs: PostsAttrs,
  context: BlockLoadContext,
): Promise<PostsData> {
  const count = clamp(attrs.count, 1, 24, 5);
  const taxonomy = attrs.filter === 'category' || attrs.filter === 'tag' ? attrs.filter : null;
  const slugs = taxonomy ? slugList(attrs.terms) : [];
  const current = attrs.excludeCurrent !== false ? context.entry?.id : undefined;
  const layout = attrs.layout ?? 'list';
  const query = async (only: string[]) => {
    const { entries } = await context.query({
      type: 'article',
      limit: count,
      orderBy: attrs.orderBy ?? 'date',
      ...(taxonomy && only.length ? { terms: { taxonomy, slugs: only } } : {}),
      ...(current ? { exclude: [current] } : {}),
    });
    return entries.map((entry, i) => ({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      date: formatDate(entry.publishedAt, context.locale),
      author: entry.author?.displayName ?? '',
      excerpt: entry.excerpt,
      image:
        attrs.image === false
          ? null
          : pictureOf(
              entry.image,
              layout === 'list' ? 160 : layout === 'magazine' && i === 0 ? 960 : 640,
            ),
    }));
  };
  const posts = await query(slugs);
  if (!taxonomy || slugs.length === 0) return { posts, link: null, tabs: null };
  context.tag('site');
  const found = await ctx.terms.find(context.siteId, {
    taxonomy,
    locale: context.locale,
    limit: 500,
  });
  const terms = slugs.flatMap((slug) => found.filter((term) => term.slug === slug));
  const link = slugs.length === 1 ? (terms[0]?.url ?? null) : null;
  if (!attrs.tabs || terms.length < 2) return { posts, link, tabs: null };
  const tabs: PostTab[] = [{ id: 'all', name: '', url: null, posts }];
  for (const term of terms) {
    tabs.push({ id: term.slug, name: term.name, url: term.url, posts: await query([term.slug]) });
  }
  return { posts, link, tabs };
}

function Post({
  post,
  attrs,
  t,
  lead,
}: {
  post: PostItem;
  attrs: PostsAttrs;
  t: Texts;
  lead?: boolean;
}) {
  const meta: ReactNode[] = [];
  if (attrs.date !== false && post.date) meta.push(<time key="d">{post.date}</time>);
  if (attrs.author && post.author) meta.push(<span key="a">{`${t.by} ${post.author}`}</span>);
  const Heading = lead ? 'h3' : 'h4';
  return (
    <li className={`cxw-posts__item${lead ? ' cxw-posts__item--lead' : ''}`}>
      {post.image ? (
        <a className="cxw-posts__image" href={post.url} tabIndex={-1} aria-hidden="true">
          <img
            src={post.image.src}
            srcSet={post.image.srcSet}
            sizes={lead ? '(max-width: 700px) 100vw, 60vw' : '(max-width: 700px) 100vw, 33vw'}
            alt=""
            width={post.image.width}
            height={post.image.height}
            loading="lazy"
            decoding="async"
          />
        </a>
      ) : null}
      <div className="cxw-posts__body">
        <Heading className="cxw-posts__title">
          <a href={post.url}>{post.title}</a>
        </Heading>
        {meta.length ? <p className="cxw-posts__meta">{meta}</p> : null}
        {(attrs.excerpt || lead) && post.excerpt ? (
          <p className="cxw-posts__excerpt">{post.excerpt}</p>
        ) : null}
      </div>
    </li>
  );
}

// ---- Recent comments ---------------------------------------------------------------

interface CommentsAttrs {
  title: string;
  count: number;
  excerpt: boolean;
  date: boolean;
}

interface CommentItem {
  id: string;
  author: string;
  text: string;
  date: string;
  entry: { title: string; url: string };
}

async function loadComments(
  ctx: PluginContext,
  attrs: CommentsAttrs,
  context: BlockLoadContext,
): Promise<CommentItem[]> {
  context.tag('comments');
  context.tag('search');
  const count = clamp(attrs.count, 1, 20, 5);
  // More than needed: comments of entries in other languages or unpublished are left out.
  const found = await ctx.comments.find(context.siteId, { type: 'comment', limit: count * 4 });
  const ids = [...new Set(found.map((c) => c.entryId))];
  if (ids.length === 0) return [];
  const entries = await ctx.content.find(context.siteId, {
    ids,
    locale: context.locale,
    limit: ids.length,
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  const items: CommentItem[] = [];
  for (const comment of found) {
    const entry = byId.get(comment.entryId);
    if (!entry) continue;
    const text = comment.content.replace(/\s+/g, ' ').trim();
    items.push({
      id: comment.id,
      author: comment.authorName,
      text: text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text,
      date: formatDate(comment.createdAt, context.locale),
      entry: { title: entry.title, url: `${entry.url}#comment-${comment.id}` },
    });
    if (items.length === count) break;
  }
  return items;
}

// ---- Terms -------------------------------------------------------------------------

interface CloudAttrs {
  title: string;
  taxonomy: 'tag' | 'category';
  count: number;
  counts: boolean;
  smallest: number;
  largest: number;
}

interface CategoriesAttrs {
  title: string;
  taxonomy: 'category' | 'tag';
  counts: boolean;
  hierarchy: boolean;
  hideEmpty: boolean;
}

interface TermItem {
  id: string;
  name: string;
  url: string;
  count: number;
  children: TermItem[];
}

async function loadTerms(
  ctx: PluginContext,
  taxonomy: string,
  context: BlockLoadContext,
): Promise<PluginTerm[]> {
  // Terms change with 'site', their counts with every published entry ('search').
  context.tag('site');
  context.tag('search');
  return ctx.terms.find(context.siteId, {
    taxonomy,
    locale: context.locale,
    withCounts: true,
    limit: 500,
  });
}

function TermTree({ items, counts, t }: { items: TermItem[]; counts: boolean; t: Texts }) {
  return (
    <ul>
      {items.map((term) => (
        <li key={term.id}>
          <a href={term.url}>{term.name}</a>
          {counts ? (
            <span className="cxw-terms__count" title={t.posts(term.count)}>
              {` (${term.count})`}
            </span>
          ) : null}
          {term.children.length ? <TermTree items={term.children} counts={counts} t={t} /> : null}
        </li>
      ))}
    </ul>
  );
}

// ---- Search ------------------------------------------------------------------------

interface SearchAttrs {
  title: string;
  label: string;
  placeholder: string;
  button: string;
  showLabel: boolean;
}

// ---- Shared attributes -------------------------------------------------------------

const titleField = (en: string, it: string) => ({
  name: 'title',
  type: 'text' as const,
  maxLength: 120,
  label: { en: 'Title', it: 'Titolo' },
  help: {
    en: `Empty: "${en}". Write "-" for none.`,
    it: `Vuoto: "${it}". Scrivi "-" per nessuno.`,
  },
});

const taxonomyField = (fallback: 'tag' | 'category') => ({
  name: 'taxonomy',
  type: 'select' as const,
  label: { en: 'Show', it: 'Mostra' },
  options: [
    { value: 'category', label: { en: 'Categories', it: 'Categorie' } },
    { value: 'tag', label: { en: 'Tags', it: 'Tag' } },
  ],
  default: fallback,
});

// ---- Plugin ------------------------------------------------------------------------

export default definePlugin({
  setup(ctx) {
    ctx.assets.enqueue({
      file: 'widgets.css',
      when: ({ html }) => html.includes('cxw-widget'),
    });

    ctx.blocks.register(
      defineBlock<PostsAttrs, PostsData>({
        type: 'widgets/recent-posts',
        title: { en: 'Recent posts', it: 'Articoli recenti' },
        description: {
          en: 'The latest posts as a list, a grid or a magazine layout, also of a category or tag.',
          it: 'Gli ultimi articoli in elenco, griglia o stile rivista, anche di una categoria o di un tag.',
        },
        icon: 'excerpt-view',
        category: 'widgets',
        attributes: [
          titleField('Recent posts', 'Articoli recenti'),
          {
            name: 'layout',
            type: 'select',
            label: { en: 'Layout', it: 'Disposizione' },
            options: [
              { value: 'list', label: { en: 'List', it: 'Elenco' } },
              { value: 'grid', label: { en: 'Grid', it: 'Griglia' } },
              {
                value: 'magazine',
                label: {
                  en: 'Magazine (a large first post)',
                  it: 'Rivista (il primo articolo in grande)',
                },
              },
            ],
            default: 'list',
          },
          {
            name: 'count',
            type: 'number',
            label: { en: 'Number of posts', it: 'Numero di articoli' },
            min: 1,
            max: 24,
            default: 5,
          },
          {
            name: 'columns',
            type: 'number',
            label: { en: 'Columns (grid)', it: 'Colonne (griglia)' },
            min: 1,
            max: 4,
            default: 3,
          },
          {
            name: 'filter',
            type: 'select',
            label: { en: 'Only posts of', it: 'Solo articoli di' },
            options: [
              { value: 'none', label: { en: 'All posts', it: 'Tutti gli articoli' } },
              { value: 'category', label: { en: 'Categories', it: 'Categorie' } },
              { value: 'tag', label: { en: 'Tags', it: 'Tag' } },
            ],
            default: 'none',
          },
          {
            name: 'terms',
            type: 'text',
            maxLength: 300,
            label: { en: 'Category or tag slugs', it: 'Slug delle categorie o dei tag' },
            help: {
              en: 'Separated by commas, e.g. "news, travel": posts with at least one of them.',
              it: 'Separati da virgole, es. "notizie, viaggi": gli articoli con almeno uno di essi.',
            },
          },
          {
            name: 'orderBy',
            type: 'select',
            label: { en: 'Order', it: 'Ordine' },
            options: [
              { value: 'date', label: { en: 'Newest first', it: 'Dal più recente' } },
              { value: 'modified', label: { en: 'Last updated', it: 'Ultimi aggiornati' } },
              { value: 'title', label: { en: 'By title', it: 'Per titolo' } },
              { value: 'random', label: { en: 'Random', it: 'Casuale' } },
            ],
            default: 'date',
          },
          {
            name: 'image',
            type: 'boolean',
            label: { en: 'Featured image', it: 'Immagine in evidenza' },
            default: true,
          },
          { name: 'date', type: 'boolean', label: { en: 'Date', it: 'Data' }, default: true },
          { name: 'author', type: 'boolean', label: { en: 'Author', it: 'Autore' } },
          { name: 'excerpt', type: 'boolean', label: { en: 'Excerpt', it: 'Riassunto' } },
          {
            name: 'excludeCurrent',
            type: 'boolean',
            label: {
              en: 'Leave out the post being read',
              it: 'Escludi l’articolo che si sta leggendo',
            },
            default: true,
          },
          {
            name: 'tabs',
            type: 'boolean',
            label: {
              en: 'A tab for each category or tag',
              it: 'Una scheda per ogni categoria o tag',
            },
            help: {
              en: 'With two or more slugs: "All" first, then a tab for each.',
              it: 'Con due o più slug: prima "Tutti", poi una scheda per ciascuno.',
            },
          },
        ],
        load: (attrs, context) => loadPosts(ctx, attrs, context),
        render({ attrs, data, block, context }) {
          const t = texts(context.locale);
          const layout = ['grid', 'magazine'].includes(attrs.layout) ? attrs.layout : 'list';
          const columns = clamp(attrs.columns, 1, 4, 3);
          const list = (posts: PostItem[]) =>
            posts.length === 0 ? (
              <p className="cxw-widget__empty">{t.noPosts}</p>
            ) : (
              <ul
                className="cxw-posts__list"
                style={
                  layout === 'grid'
                    ? ({ '--cxw-columns': columns } as Record<string, number>)
                    : undefined
                }
              >
                {posts.map((post, i) => (
                  <Post
                    key={post.id}
                    post={post}
                    attrs={attrs}
                    t={t}
                    lead={layout === 'magazine' && i === 0}
                  />
                ))}
              </ul>
            );
          const name = `cxw-tabs-${block.id}`;
          return (
            <section className={`cxw-widget cxw-posts cxw-posts--${layout}`}>
              <Title text={titleOf(attrs.title, t.recentPosts)} url={data.link} />
              {data.tabs ? (
                // Tabs without JavaScript: each radio shows the panel after its label.
                <div className="cxw-tabs">
                  {data.tabs.map((tab, i) => (
                    <div key={tab.id} className="cxw-tabs__tab">
                      <input
                        type="radio"
                        name={name}
                        id={`${name}-${tab.id}`}
                        defaultChecked={i === 0}
                        className="cxw-tabs__radio"
                      />
                      <label htmlFor={`${name}-${tab.id}`} className="cxw-tabs__label">
                        {tab.name || t.all}
                      </label>
                      <div className="cxw-tabs__panel">
                        {list(tab.posts)}
                        {tab.url ? (
                          <p className="cxw-tabs__more">
                            <a href={tab.url}>{`${t.more(tab.name)} →`}</a>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                list(data.posts)
              )}
            </section>
          );
        },
      }),
    );

    ctx.blocks.register(
      defineBlock<CommentsAttrs, CommentItem[]>({
        type: 'widgets/recent-comments',
        title: { en: 'Recent comments', it: 'Commenti recenti' },
        description: {
          en: 'The latest approved comments, with their post.',
          it: 'Gli ultimi commenti approvati, con il loro articolo.',
        },
        icon: 'admin-comments',
        category: 'widgets',
        attributes: [
          titleField('Recent comments', 'Commenti recenti'),
          {
            name: 'count',
            type: 'number',
            label: { en: 'Number of comments', it: 'Numero di commenti' },
            min: 1,
            max: 20,
            default: 5,
          },
          {
            name: 'excerpt',
            type: 'boolean',
            label: { en: 'Comment text', it: 'Testo del commento' },
            default: true,
          },
          { name: 'date', type: 'boolean', label: { en: 'Date', it: 'Data' }, default: true },
        ],
        load: (attrs, context) => loadComments(ctx, attrs, context),
        render({ attrs, data, context }) {
          const t = texts(context.locale);
          return (
            <section className="cxw-widget cxw-comments">
              <Title text={titleOf(attrs.title, t.recentComments)} />
              {data.length === 0 ? (
                <p className="cxw-widget__empty">{t.noComments}</p>
              ) : (
                <ul className="cxw-comments__list">
                  {data.map((c) => (
                    <li key={c.id}>
                      <span className="cxw-comments__author">{c.author}</span> {t.on}{' '}
                      <a href={c.entry.url}>{c.entry.title}</a>
                      {attrs.date !== false && c.date ? (
                        <time className="cxw-comments__date">{c.date}</time>
                      ) : null}
                      {attrs.excerpt !== false && c.text ? (
                        <p className="cxw-comments__text">{c.text}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        },
      }),
    );

    ctx.blocks.register(
      defineBlock<CloudAttrs, { items: TermItem[]; min: number; max: number }>({
        type: 'widgets/tag-cloud',
        title: { en: 'Tag cloud', it: 'Nuvola di tag' },
        description: {
          en: 'The most used tags (or categories), larger the more posts they have.',
          it: 'I tag (o le categorie) più usati, più grandi quanti più articoli hanno.',
        },
        icon: 'tag',
        category: 'widgets',
        attributes: [
          titleField('Tags', 'Tag'),
          taxonomyField('tag'),
          {
            name: 'count',
            type: 'number',
            label: { en: 'At most', it: 'Al massimo' },
            min: 1,
            max: 100,
            default: 45,
          },
          {
            name: 'counts',
            type: 'boolean',
            label: { en: 'Number of posts', it: 'Numero di articoli' },
          },
          {
            name: 'smallest',
            type: 'number',
            label: { en: 'Smallest size (%)', it: 'Dimensione minima (%)' },
            min: 50,
            max: 200,
            default: 80,
          },
          {
            name: 'largest',
            type: 'number',
            label: { en: 'Largest size (%)', it: 'Dimensione massima (%)' },
            min: 80,
            max: 400,
            default: 180,
          },
        ],
        async load(attrs, context) {
          const terms = await loadTerms(
            ctx,
            attrs.taxonomy === 'category' ? 'category' : 'tag',
            context,
          );
          const used = terms
            .filter((term) => (term.count ?? 0) > 0)
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
            .slice(0, clamp(attrs.count, 1, 100, 45))
            .sort((a, b) => a.name.localeCompare(b.name, context.locale));
          const counts = used.map((term) => term.count ?? 0);
          return {
            items: used.map((term) => ({
              id: term.id,
              name: term.name,
              url: term.url,
              count: term.count ?? 0,
              children: [],
            })),
            min: Math.min(...counts),
            max: Math.max(...counts),
          };
        },
        render({ attrs, data, context }) {
          const t = texts(context.locale);
          if (data.items.length === 0) return null;
          const small = clamp(attrs.smallest, 50, 200, 80);
          const large = Math.max(clamp(attrs.largest, 80, 400, 180), small);
          const size = (n: number) =>
            data.max === data.min
              ? (small + large) / 2
              : small + ((large - small) * (n - data.min)) / (data.max - data.min);
          const fallback = attrs.taxonomy === 'category' ? t.categories : t.tags;
          return (
            <section className="cxw-widget cxw-cloud">
              <Title text={titleOf(attrs.title, fallback)} />
              <ul className="cxw-cloud__list">
                {data.items.map((term) => (
                  <li key={term.id}>
                    <a
                      href={term.url}
                      style={{ fontSize: `${Math.round(size(term.count))}%` }}
                      aria-label={`${term.name} (${t.posts(term.count)})`}
                    >
                      {term.name}
                      {attrs.counts ? (
                        <span className="cxw-terms__count">{` (${term.count})`}</span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        },
      }),
    );

    ctx.blocks.register(
      defineBlock<CategoriesAttrs, TermItem[]>({
        type: 'widgets/categories',
        title: { en: 'Categories', it: 'Categorie' },
        description: {
          en: 'The categories (or tags) with links to their posts and how many there are.',
          it: 'Le categorie (o i tag) con i link ai loro articoli e quanti sono.',
        },
        icon: 'category',
        category: 'widgets',
        attributes: [
          titleField('Categories', 'Categorie'),
          taxonomyField('category'),
          {
            name: 'counts',
            type: 'boolean',
            label: { en: 'Number of posts', it: 'Numero di articoli' },
            default: true,
          },
          {
            name: 'hierarchy',
            type: 'boolean',
            label: {
              en: 'Subcategories under their parent',
              it: 'Sottocategorie sotto la loro principale',
            },
            default: true,
          },
          {
            name: 'hideEmpty',
            type: 'boolean',
            label: { en: 'Hide those without posts', it: 'Nascondi quelle senza articoli' },
            default: true,
          },
        ],
        async load(attrs, context) {
          const terms = await loadTerms(
            ctx,
            attrs.taxonomy === 'tag' ? 'tag' : 'category',
            context,
          );
          const items = new Map<string, TermItem & { parentId: string | null }>(
            terms.map((term) => [
              term.id,
              {
                id: term.id,
                name: term.name,
                url: term.url,
                count: term.count ?? 0,
                parentId: term.parentId,
                children: [],
              },
            ]),
          );
          const roots: TermItem[] = [];
          for (const item of items.values()) {
            const parent =
              attrs.hierarchy !== false && item.parentId ? items.get(item.parentId) : undefined;
            (parent ? parent.children : roots).push(item);
          }
          // Empty ones stay when a subcategory has posts.
          const prune = (list: TermItem[]): TermItem[] =>
            list
              .map((term) => ({ ...term, children: prune(term.children) }))
              .filter((term) => term.count > 0 || term.children.length > 0);
          const tree = attrs.hideEmpty !== false ? prune(roots) : roots;
          const clean = (list: TermItem[]): TermItem[] =>
            list.map(({ id, name, url, count, children }) => ({
              id,
              name,
              url,
              count,
              children: clean(children),
            }));
          return clean(tree);
        },
        render({ attrs, data, context }) {
          const t = texts(context.locale);
          if (data.length === 0) return null;
          const fallback = attrs.taxonomy === 'tag' ? t.tags : t.categories;
          return (
            <section className="cxw-widget cxw-terms">
              <Title text={titleOf(attrs.title, fallback)} />
              <TermTree items={data} counts={attrs.counts !== false} t={t} />
            </section>
          );
        },
      }),
    );

    ctx.blocks.register(
      defineBlock<SearchAttrs>({
        type: 'widgets/search',
        title: { en: 'Search form', it: 'Modulo di ricerca' },
        description: {
          en: 'A search box for the site’s content.',
          it: 'Una casella per cercare nei contenuti del sito.',
        },
        icon: 'search',
        category: 'widgets',
        attributes: [
          {
            name: 'title',
            type: 'text',
            maxLength: 120,
            label: { en: 'Title', it: 'Titolo' },
          },
          {
            name: 'label',
            type: 'text',
            maxLength: 80,
            label: { en: 'Label', it: 'Etichetta' },
            help: { en: 'Empty: "Search".', it: 'Vuoto: "Cerca".' },
          },
          {
            name: 'showLabel',
            type: 'boolean',
            label: { en: 'Show the label', it: 'Mostra l’etichetta' },
          },
          {
            name: 'placeholder',
            type: 'text',
            maxLength: 80,
            label: { en: 'Placeholder', it: 'Testo segnaposto' },
          },
          {
            name: 'button',
            type: 'text',
            maxLength: 40,
            label: { en: 'Button text', it: 'Testo del pulsante' },
          },
        ],
        render({ attrs, block, context }) {
          const t = texts(context.locale);
          const id = `cxw-search-${block.id}`;
          const label = attrs.label?.trim() || t.search;
          const action = `${context.page.site.home.replace(/\/+$/, '')}/search`;
          return (
            <section className="cxw-widget cxw-search">
              {attrs.title?.trim() ? <Title text={attrs.title.trim()} /> : null}
              <form role="search" method="get" action={action}>
                <label
                  htmlFor={id}
                  className={attrs.showLabel ? 'cxw-search__label' : 'cxw-widget__sr-only'}
                >
                  {label}
                </label>
                <div className="cxw-search__row">
                  <input
                    id={id}
                    type="search"
                    name="q"
                    required
                    maxLength={200}
                    placeholder={attrs.placeholder?.trim() || t.searchPlaceholder}
                    defaultValue={context.page.search?.query ?? ''}
                  />
                  <button type="submit">{attrs.button?.trim() || t.search}</button>
                </div>
              </form>
            </section>
          );
        },
      }),
    );
  },
});
