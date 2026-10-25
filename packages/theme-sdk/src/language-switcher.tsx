import { Blocks } from '@cleitext/renderer';
import type { ReactNode } from 'react';
import { usePage } from './context.js';
import type { LocaleLink } from './types.js';

/**
 * The look a theme suggests for its language switcher (core 0.83): the
 * language plugin follows it where its settings let themes choose.
 */
export interface LanguageSwitcherHint {
  /** A dropdown, the languages side by side, or one under the other. */
  style?: 'dropdown' | 'inline' | 'list';
  /** Each language's own name (`Deutsch`), its name in the page's language, or its code (`DE`). */
  names?: 'native' | 'translated' | 'code';
  flags?: boolean;
}

export interface LanguageSwitcherProps {
  /** Where the theme places it, e.g. `header`, `footer`, `mobile` (a class and a hint for the plugin). */
  placement?: string;
  hint?: LanguageSwitcherHint;
  /** Extra class names on the switcher's outer element. */
  className?: string;
  /**
   * What to show when no plugin gives a switcher: the theme's own markup.
   * Without it, a plain list of links.
   */
  fallback?: ReactNode;
}

/**
 * The site's languages and whether a language plugin draws the switcher
 * (core 0.83). `locales` has one item on sites with one language.
 */
export function useLanguageSwitcher(): { locales: LocaleLink[]; shared: boolean } {
  const page = usePage();
  const slot = page.languageSwitcher;
  return {
    locales: page.locales,
    shared: Boolean(slot && page.blockRenderers?.has(slot.type)),
  };
}

/**
 * The language switcher (core 0.83): the one of the site's language plugin
 * (Multilingual's: one look and one set of options for every theme), or,
 * without one, the theme's `fallback`. Nothing on sites with one language.
 */
export function LanguageSwitcher({ placement, hint, className, fallback }: LanguageSwitcherProps) {
  const page = usePage();
  if (page.locales.length < 2) return null;
  const slot = page.languageSwitcher;
  if (!slot || !page.blockRenderers?.has(slot.type)) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <PlainSwitcher
        locales={page.locales}
        label={LABELS[page.locale.slice(0, 2)] ?? 'Languages'}
      />
    );
  }
  const attrs: Record<string, unknown> = { placement: placement || 'theme' };
  if (hint) attrs.hint = { ...hint };
  if (className) attrs.className = className;
  return (
    <Blocks
      document={{ schema: 1, blocks: [{ id: slot.id, type: slot.type, v: 1, attrs }] }}
      context={{ media: page.media, locale: page.locale, renderers: page.blockRenderers }}
    />
  );
}

const LABELS: Record<string, string> = {
  en: 'Languages',
  it: 'Lingue',
  de: 'Sprachen',
  fr: 'Langues',
  es: 'Idiomas',
  pt: 'Idiomas',
  nl: 'Talen',
};

/** Links to the page in each language, for themes that give no fallback of their own. */
function PlainSwitcher({ locales, label }: { locales: LocaleLink[]; label: string }) {
  return (
    <nav className="cx-language-switcher" aria-label={label}>
      <ul>
        {locales.map((locale) => (
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
  );
}
