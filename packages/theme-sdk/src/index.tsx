import { Blocks, ResponsiveImage, type RenderMedia } from '@cleitext/renderer';
import type { CxdDocument } from '@cleitext/blocks';
import { createContext, useContext, type ReactNode } from 'react';
import type {
  HeadTag,
  MenuItemView,
  PageContext,
  TemplateProps,
  ThemeDefinition,
  TemplateComponent,
  ThemeLocation,
} from './types.js';

export * from './types.js';
export { Inline, safeUrl, type RenderMedia } from '@cleitext/renderer';

const PageContextReact = createContext<PageContext | null>(null);

export function PageProvider({ value, children }: { value: PageContext; children: ReactNode }) {
  return <PageContextReact.Provider value={value}>{children}</PageContextReact.Provider>;
}

/** Site, language, menus and URL helpers of the page being rendered. */
export function usePage(): PageContext {
  const value = useContext(PageContextReact);
  if (!value) throw new Error('usePage() must be used inside a Cleitext page');
  return value;
}

/** The content of an entry, with the page's preloaded media. */
export function EntryContent({ document }: { document: CxdDocument }) {
  const page = usePage();
  // A visual editor (plugin) renders the content itself, in the site's own layout.
  if (page.editorFrame) return <div data-cx-editor-canvas="" />;
  return (
    <Blocks
      document={document}
      context={{
        media: page.media,
        locale: page.locale,
        eagerFirstImage: true,
        ...(page.blockRenderers ? { renderers: page.blockRenderers } : {}),
        ...(page.patterns ? { patterns: page.patterns } : {}),
      }}
    />
  );
}

/** Values of the active theme's settings (RF-THM-03), defaults included. */
export function useThemeSettings<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return (usePage().themeSettings ?? {}) as T;
}

/**
 * A part of the page a plugin may replace (theme builders): what it gives
 * for the location, or the theme's own markup (`children`).
 */
export function Location({
  name,
  entry,
  children,
}: {
  name: ThemeLocation;
  /** On single entries: their content, for the template's entry-content block. */
  entry?: { document: CxdDocument };
  children?: ReactNode;
}) {
  const page = usePage();
  const document = page.locations?.[name];
  if (!document) return <>{children}</>;
  return (
    <div className={`cx-location cx-location-${name}`}>
      <Blocks
        document={document}
        context={{
          media: page.media,
          locale: page.locale,
          ...(page.blockRenderers ? { renderers: page.blockRenderers } : {}),
          ...(page.patterns ? { patterns: page.patterns } : {}),
          ...(entry ? { entry } : {}),
          ...(page.editorFrame ? { editorFrame: true } : {}),
        }}
      />
    </div>
  );
}

/** A block area of the theme (RF-THM-04); nothing when it is empty. */
export function BlockArea({ name, className }: { name: string; className?: string }) {
  const page = usePage();
  const document = page.areas?.[name];
  if (!document || document.blocks.length === 0) return null;
  return (
    <div className={className ?? `block-area block-area-${name}`}>
      <Blocks
        document={document}
        context={{
          media: page.media,
          locale: page.locale,
          ...(page.blockRenderers ? { renderers: page.blockRenderers } : {}),
          ...(page.patterns ? { patterns: page.patterns } : {}),
        }}
      />
    </div>
  );
}

/** Extra `<head>` tags added by plugins. Layouts render it inside `<head>`. */
export function HeadTags({ tags }: { tags: HeadTag[] | undefined }) {
  return (tags ?? []).map((tag, index) => {
    if (tag.tag === 'meta') return <meta key={index} {...tag.attrs} />;
    if (tag.tag === 'link') return <link key={index} {...tag.attrs} />;
    // `<` is escaped so that the data cannot close the script element.
    const json = JSON.stringify(tag.data).replace(/</g, '\\u003c');
    return (
      <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    );
  });
}

/** A responsive image of the media library. */
export function Image({
  media,
  alt,
  eager = false,
  sizes,
}: {
  media: RenderMedia;
  alt?: string;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <ResponsiveImage
      media={media}
      src={media.url}
      alt={alt ?? media.alt}
      eager={eager}
      {...(sizes ? { sizes } : {})}
    />
  );
}

/** A menu as nested lists, with `aria-current` on the current item. */
export function Menu({ items, className }: { items: MenuItemView[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.id} className={item.current ? 'is-current' : undefined}>
          <a
            href={item.url}
            aria-current={item.current ? 'page' : undefined}
            target={item.target}
            rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
          >
            {item.label}
          </a>
          {item.children.length > 0 && <Menu items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

/** Formats an ISO date in the page's language. */
/** A date in the site's time zone and date style. */
export function FormattedDate({ iso }: { iso: string }) {
  const { locale, site } = usePage();
  const date = new Date(iso);
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString(locale, { dateStyle: site.dateStyle, timeZone: site.timezone })}
    </time>
  );
}

/**
 * Template hierarchy (docs/ARCHITECTURE.md §12.2), most specific first:
 * entry-{type}-{slug} → entry-{type} → entry → index, and the equivalents for
 * archives, taxonomies, search and 404.
 */
export function templateCandidates(
  props: TemplateProps,
  extra: { slug?: string; type?: string; taxonomy?: string; termSlug?: string } = {},
): string[] {
  switch (props.kind) {
    case 'entry':
      return [
        ...(props.isFrontPage ? ['front-page'] : []),
        `entry-${props.entry.type}-${props.entry.slug}`,
        `entry-${props.entry.type}`,
        'entry',
        'index',
      ];
    case 'archive':
      if (props.term && extra.taxonomy) {
        return [
          `taxonomy-${extra.taxonomy}-${extra.termSlug}`,
          `taxonomy-${extra.taxonomy}`,
          'taxonomy',
          'archive',
          'index',
        ];
      }
      return [
        ...(props.isHome ? ['home'] : []),
        ...(extra.type ? [`archive-${extra.type}`] : []),
        'archive',
        'index',
      ];
    case 'search':
      return ['search', 'index'];
    case '404':
      return ['404', 'index'];
    case 'maintenance':
      return ['maintenance', 'index'];
  }
}

export function resolveTemplate(theme: ThemeDefinition, candidates: string[]): TemplateComponent {
  for (const name of candidates) {
    const template = theme.templates[name];
    if (template) return template;
  }
  return theme.templates.index;
}

/** Identity helper giving theme authors type checking. */
export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  return theme;
}
