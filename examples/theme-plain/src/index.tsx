import {
  BlockArea,
  defineTheme,
  EntryContent,
  HeadTags,
  Menu,
  usePage,
  useThemeSettings,
  type LayoutProps,
  type TemplateProps,
} from '@cleitext/theme-sdk';

/** Example theme (docs/THEMES.md): React components rendered on the server. */

const css = `
body { margin: 0 auto; max-width: 42rem; padding: 1rem; font: 1.1rem/1.6 system-ui, sans-serif; }
header, footer { padding-block: 1rem; }
header a { font-weight: 700; text-decoration: none; }
`;

function Layout({ head, children }: LayoutProps) {
  const page = usePage();
  const { headline } = useThemeSettings<{ headline?: string }>();
  return (
    <html lang={page.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{head.title}</title>
        {head.canonical && <link rel="canonical" href={head.canonical} />}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <HeadTags tags={head.tags} />
      </head>
      <body>
        <header>
          <a href={page.urls.home}>{page.site.title}</a>
          {headline && <p>{headline}</p>}
          {page.menus.primary && (
            <nav aria-label="Menu">
              <Menu items={page.menus.primary} />
            </nav>
          )}
        </header>
        <main>{children}</main>
        <footer>
          <BlockArea name="footer" />
        </footer>
      </body>
    </html>
  );
}

function Index(props: TemplateProps) {
  switch (props.kind) {
    case 'entry':
      return (
        <article>
          <h1>{props.entry.title}</h1>
          <EntryContent document={props.entry.document} />
        </article>
      );
    case 'archive':
      return (
        <section>
          <h1>{props.title}</h1>
          <ul>
            {props.entries.map((entry) => (
              <li key={entry.id}>
                <a href={entry.url}>{entry.title}</a>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'search':
      return <h1>{props.query}</h1>;
    default:
      return <h1>{props.kind === '404' ? 'Not found' : 'Back soon'}</h1>;
  }
}

export default defineTheme({
  slug: 'plain',
  name: 'Plain',
  version: '1.0.0',
  menuLocations: { primary: 'Main menu' },
  settings: [{ name: 'headline', type: 'text', label: { en: 'Headline', it: 'Sottotitolo' } }],
  areas: { footer: 'Footer' },
  templates: { index: Index },
  Layout,
  css,
});
