import { createPublicKey, verify } from 'node:crypto';
import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';

/**
 * Catalog showcase (official plugin, shipped on its own): the "Catalog"
 * block lists the plugins or themes of the Cleitext catalog, read from its
 * signed index — the directory pages of cleitext.com are made with it.
 */

const OFFICIAL_URL =
  'https://github.com/faghy/cleitext-catalog/releases/download/catalog/catalog.json';
const OFFICIAL_KEY = 'MCowBQYDK2VwAyEAqg+tdu3CRzfBy9RInH4I0fcFvfgkppCNihY2uQ+pxXA=';
const TTL_MS = 60 * 60 * 1000;
const CACHE_TAG = 'showcase';

interface Item {
  type: 'plugin' | 'theme';
  slug: string;
  name: string;
  summary: Record<string, string>;
  tags: string[];
  /** Plugins only: editor, tools, seo, analytics, shop… */
  category?: string;
  icon: string | null;
  screenshots: string[];
  version: string;
  apiVersion?: string;
  requires?: string;
  author: string;
  license: string;
  download: string;
  size: number;
  homepage?: string;
  updatedAt: string;
  /** Paid themes (RF-CAT-03): bought on the store, tried as a demo from the admin. */
  paid?: {
    price: { amount: number; currency: string };
    updatesMonths: number;
    purchaseUrl: string;
  };
}

interface Attrs {
  kind: 'plugin' | 'theme' | 'all';
  /** Address of each item's own page, `{slug}` replaced (e.g. `/plugins/{slug}`). */
  link?: string;
  /** Page slugs that differ from the catalog's: `shop=cleishop, …`. */
  aliases?: string;
  /** Buttons above the list to show one category at a time. */
  filters?: boolean;
}

/** The page of an item, when the block has a link pattern. */
function itemPage(attrs: Attrs, slug: string): string | null {
  const pattern = typeof attrs.link === 'string' ? attrs.link.trim() : '';
  if (!pattern.includes('{slug}') || !/^(\/(?!\/)|https?:\/\/)/.test(pattern)) return null;
  const aliases = new Map(
    String(attrs.aliases ?? '')
      .split(',')
      .map((pair) => pair.split('=').map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0] && pair[1])),
  );
  return pattern.replace('{slug}', encodeURIComponent(aliases.get(slug) ?? slug));
}

/** The category buttons, hidden until the script shows them. */
function filterBar(items: Item[], it: boolean, t: (typeof TEXTS)['en']) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(filterKey(item), (counts.get(filterKey(item)) ?? 0) + 1);
  if (counts.size < 2) return null;
  const label = (key: string) =>
    key === 'themes'
      ? t.themes
      : (CATEGORIES[key]?.[it ? 'it' : 'en'] ?? key.charAt(0).toUpperCase() + key.slice(1));
  // Most items first; themes last.
  const keys = [...counts.keys()].sort((a, b) =>
    a === 'themes' ? 1 : b === 'themes' ? -1 : counts.get(b)! - counts.get(a)!,
  );
  return (
    <div className="cx-catalog-filters" role="group" aria-label={t.filterBy} hidden>
      <button type="button" data-filter="all" aria-pressed="true">
        {t.all}
        <span>{items.length}</span>
      </button>
      {keys.map((key) => (
        <button key={key} type="button" data-filter={key} aria-pressed="false">
          {label(key)}
          <span>{counts.get(key)}</span>
        </button>
      ))}
    </div>
  );
}

const indexes = new Map<string, { items: Item[]; generatedAt: string; at: number }>();
/** Sites that showed the catalog: their pages are refreshed when it changes. */
const sites = new Set<string>();

async function catalog(ctx: PluginContext, url: string, key: string): Promise<Item[]> {
  const cached = indexes.get(url);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.items;
  try {
    const [body, signature] = await Promise.all(
      [url, `${url}.sig`].map(async (address) => {
        const res = await fetch(address, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`${address}: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      }),
    );
    const publicKey = createPublicKey({
      key: Buffer.from(key, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (
      !verify(null, body!, publicKey, Buffer.from(signature!.toString('utf8').trim(), 'base64'))
    ) {
      throw new Error('the signature does not match');
    }
    const parsed = JSON.parse(body!.toString('utf8')) as { generatedAt: string; items: Item[] };
    const changed = cached && cached.generatedAt !== parsed.generatedAt;
    indexes.set(url, { items: parsed.items, generatedAt: parsed.generatedAt, at: Date.now() });
    if (changed) {
      for (const siteId of sites) await ctx.cache.invalidate(siteId, [CACHE_TAG]);
    }
    return parsed.items;
  } catch (error) {
    ctx.log.warn('The catalog could not be read', { error: String(error) });
    if (cached) cached.at = Date.now() - TTL_MS + 5 * 60 * 1000; // try again in 5 minutes
    return cached?.items ?? [];
  }
}

const TEXTS = {
  en: {
    version: 'Version',
    by: 'by',
    download: 'Download',
    buy: 'Buy',
    perSite: 'per site',
    monthsOfUpdates: 'months of updates',
    demo: 'Try the demo from your admin: Appearance → Themes → Add New Theme, then Live Preview.',
    details: 'Details',
    needs: 'Needs Cleitext',
    install: 'Install it from your admin: Plugins → Add New.',
    installTheme: 'Install it from your admin: Appearance → Themes → Add New Theme.',
    empty: 'The catalog cannot be shown right now.',
    plugin: 'Plugin',
    theme: 'Theme',
    all: 'All',
    filterBy: 'Show',
    themes: 'Themes',
  },
  it: {
    version: 'Versione',
    by: 'di',
    download: 'Scarica',
    buy: 'Acquista',
    perSite: 'per sito',
    monthsOfUpdates: 'mesi di aggiornamenti',
    demo: 'Prova la demo dall’admin: Aspetto → Temi → Aggiungi nuovo tema, poi Anteprima dal vivo.',
    details: 'Dettagli',
    needs: 'Richiede Cleitext',
    install: 'Installalo dall’admin: Plugin → Aggiungi nuovo.',
    installTheme: 'Installalo dall’admin: Aspetto → Temi → Aggiungi nuovo tema.',
    empty: 'Il catalogo non è disponibile in questo momento.',
    plugin: 'Plugin',
    theme: 'Tema',
    all: 'Tutti',
    filterBy: 'Mostra',
    themes: 'Temi',
  },
};

/** Names of the catalog's categories; others are shown as they are, capitalised. */
const CATEGORIES: Record<string, { en: string; it: string }> = {
  editor: { en: 'Editor and content', it: 'Editor e contenuti' },
  tools: { en: 'Tools', it: 'Strumenti' },
  seo: { en: 'SEO', it: 'SEO' },
  analytics: { en: 'Analytics', it: 'Statistiche' },
  shop: { en: 'Shop', it: 'Negozio' },
};

/** The filter key of an item: its category, or `themes` for themes. */
const filterKey = (item: Item) => (item.type === 'theme' ? 'themes' : item.category || 'other');

/** Shows the cards of the pressed category; without JavaScript every card stays visible. */
const FILTER_SCRIPT = `document.querySelectorAll('.cx-catalog-filters').forEach(function(bar){var list=bar.nextElementSibling;bar.hidden=false;bar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;bar.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});var k=b.getAttribute('data-filter');list.querySelectorAll(':scope>li').forEach(function(li){li.hidden=k!=='all'&&li.getAttribute('data-filter')!==k})})})`;

const STYLE = `.cx-catalog{list-style:none;padding:0;display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr));margin:1.5rem 0;text-align:left}
.cx-catalog__card{position:relative;display:flex;flex-direction:column;background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);transition:transform .15s,box-shadow .15s}
.cx-catalog__card:has(.cx-catalog__link):hover{transform:translateY(-3px);box-shadow:0 2px 6px rgba(15,23,42,.08),0 16px 32px rgba(15,23,42,.12)}
.cx-catalog__link{color:inherit;text-decoration:none}
.cx-catalog__link::after{content:"";position:absolute;inset:0;z-index:1}
.cx-catalog__link:focus-visible{outline:none}
.cx-catalog__card:has(.cx-catalog__link:focus-visible){outline:3px solid #0f4c81;outline-offset:2px}
.cx-catalog__shot{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-bottom:1px solid #e5e7eb}
.cx-catalog__body{display:flex;flex-direction:column;gap:.75rem;padding:1.25rem;flex:1}
.cx-catalog__head{display:flex;gap:.85rem;align-items:center}
.cx-catalog__icon{width:3rem;height:3rem;border-radius:.75rem;flex:none}
.cx-catalog__name{margin:0;font-size:1.15rem;line-height:1.3}
.cx-catalog__meta{margin:0;font-size:.85rem;color:#6b7280}
.cx-catalog__summary{margin:0;flex:1;font-size:.95rem;line-height:1.55}
.cx-catalog__tags{display:flex;flex-wrap:wrap;gap:.35rem;margin:0;padding:0;list-style:none}
.cx-catalog__tags li{font-size:.75rem;background:#f1f5f9;color:#334155;border-radius:999px;padding:.15rem .6rem}
.cx-catalog__how{margin:0;font-size:.8rem;color:#6b7280}
.cx-catalog__price{margin:0;font-size:.95rem}
.cx-catalog__price strong{font-size:1.2rem}
.cx-catalog__actions{position:relative;z-index:2;display:flex;gap:.5rem;flex-wrap:wrap}
.cx-catalog__button{display:inline-block;padding:.55rem 1rem;border-radius:.5rem;font-weight:600;font-size:.9rem;text-decoration:none;border:2px solid #0f4c81;background:#0f4c81;color:#fff}
.cx-catalog__button--plain{background:transparent;color:#0f4c81}
.cx-catalog__button:hover{filter:brightness(1.1)}
.cx-catalog-filters{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;margin:1.5rem 0 0}
.cx-catalog-filters button{font:inherit;font-size:.9rem;font-weight:600;padding:.45rem 1rem;border-radius:999px;border:1px solid #cbd5e1;background:#fff;color:#334155;cursor:pointer}
.cx-catalog-filters button:hover{border-color:#0f4c81;color:#0f4c81}
.cx-catalog-filters button[aria-pressed="true"]{background:#0f4c81;border-color:#0f4c81;color:#fff}
.cx-catalog-filters button span{opacity:.7;font-weight:500;margin-left:.3rem}
.cx-catalog>li[hidden]{display:none}`;

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(
      [
        {
          name: 'url',
          type: 'text',
          label: { en: 'Catalog address', it: 'Indirizzo del catalogo' },
          help: {
            en: 'Empty: the official Cleitext catalog.',
            it: 'Vuoto: il catalogo ufficiale di Cleitext.',
          },
          maxLength: 300,
        },
      ],
      { title: { en: 'Catalog showcase', it: 'Vetrina del catalogo' } },
    );

    ctx.blocks.register(
      defineBlock<Attrs, Item[]>({
        type: 'showcase/catalog',
        title: { en: 'Catalog', it: 'Catalogo' },
        description: {
          en: 'The plugins or themes of the Cleitext catalog, always up to date.',
          it: 'I plugin o i temi del catalogo di Cleitext, sempre aggiornati.',
        },
        icon: 'screenoptions',
        category: 'widgets',
        attributes: [
          {
            name: 'kind',
            type: 'select',
            label: { en: 'Show', it: 'Mostra' },
            options: [
              { value: 'plugin', label: { en: 'Plugins', it: 'Plugin' } },
              { value: 'theme', label: { en: 'Themes', it: 'Temi' } },
              { value: 'all', label: { en: 'Plugins and themes', it: 'Plugin e temi' } },
            ],
            default: 'plugin',
          },
          {
            name: 'link',
            type: 'text',
            label: { en: 'Page of each item', it: 'Pagina di ogni elemento' },
            help: {
              en: 'Optional: the address of its page, with {slug} (e.g. /plugins/{slug}). The whole box then opens it.',
              it: 'Facoltativo: l’indirizzo della sua pagina, con {slug} (es. /plugin/{slug}). Tutto il riquadro la apre.',
            },
            maxLength: 200,
          },
          {
            name: 'aliases',
            type: 'text',
            label: { en: 'Different page names', it: 'Nomi di pagina diversi' },
            help: {
              en: 'Optional: slug=page, separated by commas (e.g. shop=cleishop).',
              it: 'Facoltativo: slug=pagina, separati da virgole (es. shop=cleishop).',
            },
            maxLength: 500,
          },
          {
            name: 'filters',
            type: 'boolean',
            label: { en: 'Filter by category', it: 'Filtro per categorie' },
            help: {
              en: 'Buttons above the list to show one category at a time.',
              it: 'Pulsanti sopra l’elenco per mostrare una categoria alla volta.',
            },
            default: false,
          },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          sites.add(context.siteId);
          const { url } = await ctx.settings.get(context.siteId);
          const custom = typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
          // The server's own catalog settings, when it has them.
          const items = await catalog(
            ctx,
            custom ?? (process.env.CATALOG_URL || OFFICIAL_URL),
            process.env.CATALOG_PUBLIC_KEY || OFFICIAL_KEY,
          );
          return items.filter(
            (item) => attrs.kind === 'all' || item.type === (attrs.kind ?? 'plugin'),
          );
        },
        render({ data, context, attrs }) {
          const it = context.locale.toLowerCase().startsWith('it');
          const t = it ? TEXTS.it : TEXTS.en;
          if (!data || data.length === 0) return <p>{t.empty}</p>;
          return (
            <>
              <style>{STYLE}</style>
              {attrs.filters && filterBar(data, it, t)}
              <ul className="cx-catalog">
                {data.map((item) => {
                  const page = itemPage(attrs, item.slug);
                  return (
                    <li
                      key={`${item.type}-${item.slug}`}
                      className="cx-catalog__card"
                      data-filter={filterKey(item)}
                    >
                      {item.screenshots[0] && (
                        <img
                          className="cx-catalog__shot"
                          src={item.screenshots[0]}
                          alt=""
                          loading="lazy"
                          width={1280}
                          height={800}
                        />
                      )}
                      <div className="cx-catalog__body">
                        <div className="cx-catalog__head">
                          {item.icon && (
                            <img
                              className="cx-catalog__icon"
                              src={item.icon}
                              alt=""
                              width={48}
                              height={48}
                            />
                          )}
                          <div>
                            <h3 className="cx-catalog__name">
                              {page ? (
                                <a className="cx-catalog__link" href={page}>
                                  {item.name}
                                </a>
                              ) : (
                                item.name
                              )}
                            </h3>
                            <p className="cx-catalog__meta">
                              {item.type === 'plugin' ? t.plugin : t.theme} · {t.version}{' '}
                              {item.version} · {t.by} {item.author}
                            </p>
                          </div>
                        </div>
                        <p className="cx-catalog__summary">
                          {item.summary[it ? 'it' : 'en'] ?? item.summary.en}
                        </p>
                        {item.tags.length > 0 && (
                          <ul className="cx-catalog__tags">
                            {item.tags.map((tag) => (
                              <li key={tag}>{tag}</li>
                            ))}
                          </ul>
                        )}
                        {item.paid && (
                          <p className="cx-catalog__price">
                            <strong>
                              {new Intl.NumberFormat(it ? 'it-IT' : 'en-GB', {
                                style: 'currency',
                                currency: item.paid.price.currency,
                                maximumFractionDigits: item.paid.price.amount % 1 === 0 ? 0 : 2,
                              }).format(item.paid.price.amount)}
                            </strong>{' '}
                            {t.perSite}
                            {item.paid.updatesMonths > 0 &&
                              ` · ${item.paid.updatesMonths} ${t.monthsOfUpdates}`}
                          </p>
                        )}
                        <p className="cx-catalog__how">
                          {item.paid ? t.demo : item.type === 'plugin' ? t.install : t.installTheme}
                          {item.requires ? ` ${t.needs} ${item.requires.replace('>=', '≥ ')}.` : ''}
                        </p>
                        <div className="cx-catalog__actions">
                          {item.paid ? (
                            <a className="cx-catalog__button" href={item.paid.purchaseUrl}>
                              {t.buy}
                            </a>
                          ) : (
                            <a className="cx-catalog__button" href={item.download}>
                              {t.download} ({Math.max(1, Math.round(item.size / 1024))} KB)
                            </a>
                          )}
                          {(page ?? item.homepage) && (
                            <a
                              className="cx-catalog__button cx-catalog__button--plain"
                              href={page ?? item.homepage}
                            >
                              {t.details}
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {attrs.filters && <script dangerouslySetInnerHTML={{ __html: FILTER_SCRIPT }} />}
            </>
          );
        },
      }),
    );
  },
});
