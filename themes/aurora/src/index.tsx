import { readFileSync } from 'node:fs';
import {
  BlockArea,
  defineTheme,
  EntryContent,
  FormattedDate,
  HeadTags,
  Image,
  Location,
  Menu,
  usePage,
  useThemeSettings,
  type LayoutProps,
  type Pagination,
  type PublicEntrySummary,
  type TemplateProps,
} from '@cleitext/theme-sdk';
import { strings } from './strings.js';

/** Default site icon, inline so browsers do not request /favicon.ico. */
const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b5cad"/><path d="M21.5 11.5a7 7 0 1 0 0 9" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></svg>',
)}`;

/** Aurora: Cleitext's default theme (RF-THM-05). Accessible, fast, no JavaScript. */

interface Settings extends Record<string, unknown> {
  logo?: string;
  accentColor?: string;
  showTagline?: boolean;
  showSearch?: boolean;
  footerText?: string;
}

/** Only plain hex colors reach the stylesheet. */
const HEX = /^#[0-9a-f]{6}$/i;

function Layout({ head, css, children }: LayoutProps) {
  const page = usePage();
  const t = strings(page.locale);
  const settings = useThemeSettings<Settings>();
  const logo = settings.logo ? page.media.get(settings.logo) : undefined;
  const accent =
    settings.accentColor && HEX.test(settings.accentColor) ? settings.accentColor : null;
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href={ICON} />
        <title>{head.title}</title>
        {head.description && <meta name="description" content={head.description} />}
        {head.robots && <meta name="robots" content={head.robots} />}
        {head.canonical && <link rel="canonical" href={head.canonical} />}
        {head.alternates.map((alt) => (
          <link key={alt.hreflang} rel="alternate" hrefLang={alt.hreflang} href={alt.href} />
        ))}
        {Object.entries(head.og).map(([property, content]) => (
          <meta key={property} property={property} content={content} />
        ))}
        <meta
          name="twitter:card"
          content={head.og['og:image'] ? 'summary_large_image' : 'summary'}
        />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {accent && (
          <style
            dangerouslySetInnerHTML={{
              __html: `@media (prefers-color-scheme: light) { :root { --accent: ${accent}; } }`,
            }}
          />
        )}
        <HeadTags tags={head.tags} />
      </head>
      <body>
        <a className="skip-link" href="#content">
          {t.skip}
        </a>
        <Location name="header">
          <header className="site-header">
            <div className="container">
              <a className="site-title" href={page.urls.home}>
                {logo ? (
                  <img className="site-logo" src={logo.url} alt={page.site.title} />
                ) : (
                  page.site.title
                )}
                {settings.showTagline !== false && page.site.tagline && (
                  <span className="site-tagline">{page.site.tagline}</span>
                )}
              </a>
              {(page.menus.primary?.length ?? 0) > 0 && (
                <nav className="site-nav" aria-label={t.mainMenu}>
                  <Menu items={page.menus.primary!} />
                </nav>
              )}
              {settings.showSearch === true && (
                <form className="search-form" role="search" action={page.urls.search} method="get">
                  <label className="visually-hidden" htmlFor="search-q">
                    {t.search}
                  </label>
                  <input id="search-q" type="search" name="q" placeholder={t.searchPlaceholder} />
                  <button type="submit">{t.search}</button>
                </form>
              )}
              {page.locales.length > 1 && (
                <nav className="languages" aria-label={t.languages}>
                  <ul>
                    {page.locales.map((locale) => (
                      <li key={locale.code}>
                        <a
                          href={locale.url}
                          hrefLang={locale.code}
                          lang={locale.code}
                          aria-current={locale.current ? 'true' : undefined}
                        >
                          {locale.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          </header>
        </Location>
        <main id="content">{children}</main>
        <Location name="footer">
          <footer className="site-footer">
            <BlockArea name="footer" className="container footer-area" />
            <div className="container">
              {(page.menus.footer?.length ?? 0) > 0 && (
                <nav className="footer-nav" aria-label={t.footerMenu}>
                  <Menu items={page.menus.footer!} />
                </nav>
              )}
              <p>
                {settings.footerText || `© ${new Date().getFullYear()} ${page.site.title}`} ·{' '}
                {t.poweredBy} <a href="https://github.com/faghy/cleitext">Cleitext</a>
              </p>
            </div>
          </footer>
        </Location>
      </body>
    </html>
  );
}

function Index(props: TemplateProps) {
  const page = usePage();
  const t = strings(page.locale);
  switch (props.kind) {
    case 'entry': {
      const { entry } = props;
      const isArticle = entry.type === 'article';
      return (
        <Location name="single" entry={entry}>
          <article className="container">
            <header className="page-header">
              <h1>{entry.title}</h1>
              {isArticle && entry.publishedAt && (
                <p className="entry-meta">
                  <FormattedDate iso={entry.publishedAt} />
                  {entry.author && ` · ${entry.author.displayName}`}
                </p>
              )}
            </header>
            {entry.featuredImage && (
              <figure className="entry-featured">
                <Image media={entry.featuredImage} eager sizes="(min-width: 70rem) 70rem, 100vw" />
              </figure>
            )}
            <div className="entry-content">
              <EntryContent document={entry.document} />
            </div>
            {Object.keys(entry.terms).length > 0 && (
              <footer className="entry-terms page-header">
                {Object.entries(entry.terms).map(([taxonomy, terms]) => (
                  <p key={taxonomy}>
                    {taxonomy === 'category' ? t.categories : t.tags}:{' '}
                    {terms.map((term, i) => (
                      <span key={term.slug}>
                        {i > 0 && ', '}
                        <a href={term.url}>{term.name}</a>
                      </span>
                    ))}
                  </p>
                ))}
              </footer>
            )}
          </article>
        </Location>
      );
    }
    case 'archive':
      return (
        <Location name="archive">
          <div className="container">
            <header className="page-header">
              <h1>{props.title}</h1>
              {props.term?.description && <p>{props.term.description}</p>}
            </header>
            <EntryList entries={props.entries} empty={t.nothingYet} />
            <PageLinks pagination={props.pagination} />
          </div>
        </Location>
      );
    case 'search':
      return (
        <Location name="archive">
          <div className="container">
            <header className="page-header">
              <h1>{props.query ? t.resultsFor(props.query) : t.search}</h1>
            </header>
            <EntryList entries={props.entries} empty={props.query ? t.noResults : t.typeToSearch} />
            <PageLinks pagination={props.pagination} />
          </div>
        </Location>
      );
    case '404':
      return (
        <div className="container page-header">
          <h1>{t.notFoundTitle}</h1>
          <p>{t.notFoundText}</p>
          <p>
            <a href={page.urls.home}>{t.backHome}</a>
          </p>
        </div>
      );
    case 'maintenance':
      return (
        <div className="container page-header">
          <h1>{t.maintenanceTitle}</h1>
          <p>{t.maintenanceText}</p>
        </div>
      );
  }
}

function EntryList({ entries, empty }: { entries: PublicEntrySummary[]; empty: string }) {
  if (entries.length === 0) return <p className="page-header">{empty}</p>;
  return (
    <ul className="entry-list">
      {entries.map((entry, index) => (
        <li key={entry.id} className="card">
          {entry.image && (
            <a href={entry.url} tabIndex={-1} aria-hidden="true">
              <Image
                media={entry.image}
                alt=""
                eager={index === 0}
                sizes="(max-width: 760px) 100vw, 704px"
              />
            </a>
          )}
          {entry.publishedAt && (
            <p className="card-meta">
              <FormattedDate iso={entry.publishedAt} />
            </p>
          )}
          <h2>
            <a href={entry.url}>{entry.title}</a>
          </h2>
          {entry.highlight ? (
            <p>
              {entry.highlight.map((part, i) =>
                part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
              )}
            </p>
          ) : (
            entry.excerpt && <p>{entry.excerpt}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function PageLinks({ pagination }: { pagination: Pagination }) {
  const t = strings(usePage().locale);
  if (pagination.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label={t.pagination}>
      {pagination.prevUrl ? <a href={pagination.prevUrl}>← {t.newer}</a> : <span />}
      <span>{t.pageOf(pagination.page, pagination.totalPages)}</span>
      {pagination.nextUrl ? <a href={pagination.nextUrl}>{t.older} →</a> : <span />}
    </nav>
  );
}

export const theme = defineTheme({
  slug: 'aurora',
  name: 'Aurora',
  version: '0.1.0',
  description: 'Clean and readable, light and dark, without JavaScript.',
  menuLocations: { primary: 'Main menu', footer: 'Footer menu' },
  settings: [
    { name: 'logo', type: 'media', label: { en: 'Logo', it: 'Logo' } },
    {
      name: 'accentColor',
      type: 'text',
      label: { en: 'Accent color', it: 'Colore principale' },
      help: { en: 'Hexadecimal, e.g. #0b5cad', it: 'Esadecimale, es. #0b5cad' },
      maxLength: 7,
    },
    {
      name: 'showTagline',
      type: 'boolean',
      label: { en: 'Show the tagline', it: 'Mostra il motto' },
      default: true,
    },
    {
      name: 'showSearch',
      type: 'boolean',
      label: { en: 'Show the search box', it: 'Mostra la ricerca' },
      default: false,
    },
    {
      name: 'footerText',
      type: 'text',
      label: { en: 'Footer text', it: 'Testo del piè di pagina' },
      maxLength: 200,
    },
  ],
  areas: { footer: 'Footer' },
  templates: { index: Index },
  Layout,
  css: readFileSync(new URL('../style.css', import.meta.url), 'utf8'),
  editorCss: readFileSync(new URL('../editor.css', import.meta.url), 'utf8'),
  aiGuide: `Aurora is a quiet, readable theme: one column of text (about 44rem), light and dark.
- Build pages with core blocks only: headings in order, short paragraphs, lists, images, quotes, buttons.
- Images and groups may use \`"align":"wide"\` (70rem) or \`"align":"full"\` (edge to edge).
- Columns stack on phones; keep them to two or three.
- There are no special section classes: keep layouts simple and let the content lead.`,
});

export default theme;
