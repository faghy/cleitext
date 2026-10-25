/**
 * The language switcher (Multilingual 1.6.0), one component for every place:
 * the block, themes' `<LanguageSwitcher>`, the bottom of the page. Server
 * rendered and usable without JavaScript: a dropdown is a `<details>` (a
 * small script closes it on Escape and outside clicks), lists are links.
 * Accessible: a `nav` with a label, `lang` and `hreflang` on each link,
 * `aria-current` on the page's language, full names for screen readers when
 * codes are shown, flags hidden from them.
 */
import { flagSvg } from './flags';
import {
  labelOf,
  visibleLocales,
  type SwitcherLocale,
  type SwitcherLook,
  type SwitcherNames,
} from './options';

const TEXTS: Record<string, { languages: string; language: (name: string) => string }> = {
  en: { languages: 'Languages', language: (name) => `Language: ${name}` },
  it: { languages: 'Lingue', language: (name) => `Lingua: ${name}` },
  de: { languages: 'Sprachen', language: (name) => `Sprache: ${name}` },
  fr: { languages: 'Langues', language: (name) => `Langue : ${name}` },
  es: { languages: 'Idiomas', language: (name) => `Idioma: ${name}` },
  pt: { languages: 'Idiomas', language: (name) => `Idioma: ${name}` },
  nl: { languages: 'Talen', language: (name) => `Taal: ${name}` },
};

export function switcherTexts(locale: string) {
  return TEXTS[locale.slice(0, 2).toLowerCase()] ?? TEXTS.en!;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function Flag({ code }: { code: string }) {
  const inner = flagSvg(code);
  if (!inner) return null;
  return (
    <svg
      className="ml-switcher__flag"
      viewBox="0 0 20 15"
      width="20"
      height="15"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

function Label({
  locale,
  names,
  flags,
  pageLocale,
}: {
  locale: SwitcherLocale;
  names: SwitcherNames;
  flags: boolean;
  pageLocale: string;
}) {
  const { text, full } = labelOf(locale, names, pageLocale);
  return (
    <>
      {flags && <Flag code={locale.code} />}
      {text === full ? (
        <span className="ml-switcher__name">{text}</span>
      ) : (
        <>
          <span className="ml-switcher__name" aria-hidden="true">
            {text}
          </span>
          <span className="ml-switcher__sr">{full}</span>
        </>
      )}
    </>
  );
}

function Item(props: {
  locale: SwitcherLocale;
  names: SwitcherNames;
  flags: boolean;
  pageLocale: string;
}) {
  const { locale } = props;
  return (
    <li
      className={cx(
        'ml-switcher__item',
        locale.current && 'is-current',
        !locale.translated && 'is-untranslated',
      )}
    >
      <a
        href={locale.url}
        hrefLang={locale.code}
        lang={locale.code}
        aria-current={locale.current ? 'true' : undefined}
      >
        <Label {...props} />
      </a>
    </li>
  );
}

export interface SwitcherViewProps {
  locales: SwitcherLocale[];
  look: SwitcherLook;
  /** The page's language, for translated names and the labels. */
  pageLocale: string;
  /** e.g. `header`, `block`, `footer-auto`, `floating` (a class). */
  placement?: string;
  className?: string;
  /** Extra classes, e.g. the side of a floating switcher. */
  extra?: string;
}

/** The switcher; nothing when fewer than two languages would show. */
export function SwitcherView({
  locales,
  look,
  pageLocale,
  placement,
  className,
  extra,
}: SwitcherViewProps) {
  const shown = visibleLocales(locales, look);
  if (locales.length < 2 || shown.length < 2) return null;
  const t = switcherTexts(pageLocale);
  const current = shown.find((l) => l.current) ?? shown[0]!;
  const classes = cx(
    'ml-switcher',
    `ml-switcher--${look.style}`,
    look.flags && 'ml-switcher--flags',
    placement && `ml-switcher--at-${placement.replace(/[^\w-]/g, '')}`,
    extra,
    className,
  );
  const item = (locale: SwitcherLocale) => (
    <Item
      key={locale.code}
      locale={locale}
      names={look.names}
      flags={look.flags}
      pageLocale={pageLocale}
    />
  );
  if (look.style === 'dropdown') {
    const { full } = labelOf(current, look.names, pageLocale);
    return (
      <nav className={classes} aria-label={t.languages}>
        <details className="ml-switcher__dropdown">
          <summary
            className="ml-switcher__toggle"
            aria-label={t.language(full)}
            lang={current.code}
          >
            <Label locale={current} names={look.names} flags={look.flags} pageLocale={pageLocale} />
            <span className="ml-switcher__caret" aria-hidden="true" />
          </summary>
          <ul className="ml-switcher__list">{shown.filter((l) => l !== current).map(item)}</ul>
        </details>
      </nav>
    );
  }
  return (
    <nav className={classes} aria-label={t.languages}>
      <ul className="ml-switcher__list">
        {shown.filter((l) => look.showCurrent || !l.current).map(item)}
      </ul>
    </nav>
  );
}
