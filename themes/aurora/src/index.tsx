import { readFileSync } from 'node:fs';
import {
  defineTheme,
  EntryContent,
  FormattedDate,
  Image,
  Menu,
  usePage,
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

function Layout({ head, css, children }: LayoutProps) {
  const page = usePage();
  const t = strings(page.locale);
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
      </head>
      <body>
        <a className="skip-link" href="#content">
          {t.skip}
        </a>
        <header className="site-header">
          <div className="container">
            <a className="site-title" href={page.urls.home}>
              {page.site.title}
              {page.site.tagline && <span className="site-tagline">{page.site.tagline}</span>}
            </a>
            {(page.menus.primary?.length ?? 0) > 0 && (
              <nav className="site-nav" aria-label={t.mainMenu}>
                <Menu items={page.menus.primary!} />
              </nav>
            )}
            <form className="search-form" role="search" action={page.urls.search} method="get">
              <label className="visually-hidden" htmlFor="search-q">
                {t.search}
              </label>
              <input id="search-q" type="search" name="q" placeholder={t.searchPlaceholder} />
              <button type="submit">{t.search}</button>
            </form>
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
        <main id="content">{children}</main>
        <footer className="site-footer">
          <div className="container">
            {(page.menus.footer?.length ?? 0) > 0 && (
              <nav className="footer-nav" aria-label={t.footerMenu}>
                <Menu items={page.menus.footer!} />
              </nav>
            )}
            <p>
              © {new Date().getFullYear()} {page.site.title} · {t.poweredBy}{' '}
              <a href="https://github.com/faghy/cleitext">Cleitext</a>
            </p>
          </div>
        </footer>
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
      );
    }
    case 'archive':
      return (
        <div className="container">
          <header className="page-header">
            <h1>{props.title}</h1>
            {props.term?.description && <p>{props.term.description}</p>}
          </header>
          <EntryList entries={props.entries} empty={t.nothingYet} />
          <PageLinks pagination={props.pagination} />
        </div>
      );
    case 'search':
      return (
        <div className="container">
          <header className="page-header">
            <h1>{props.query ? t.resultsFor(props.query) : t.search}</h1>
          </header>
          <EntryList entries={props.entries} empty={props.query ? t.noResults : t.typeToSearch} />
          <PageLinks pagination={props.pagination} />
        </div>
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
          {entry.excerpt && <p>{entry.excerpt}</p>}
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
  menuLocations: { primary: 'Main menu', footer: 'Footer menu' },
  templates: { index: Index },
  Layout,
  css: readFileSync(new URL('../style.css', import.meta.url), 'utf8'),
});

export default theme;
