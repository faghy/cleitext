/**
 * Fonts in the editor (Diorama 1.2): the picker of a layer's font (the
 * theme's, the site's, every Google font with a search, Diorama's stacks)
 * and the fonts the canvas and the preview show. The admin may load fonts
 * only from the site, so they come from a page of the site in its theme
 * (`FONTS_PATH`): its copies of the theme's and the plugins' fonts, its
 * `@font-face` rules, the fonts of its headings and texts (read in a hidden
 * frame), and the copies Cleitext makes of the Google fonts asked for.
 * The theme's settings and Fresco's global fonts add the site's other
 * fonts. Anything that cannot be read is left out: the editor still works.
 */
import { api, pluginApi, useT } from '@cleitext/admin-sdk';
import { googleFonts } from '@cleitext/shared/google-fonts';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  cleanFamily,
  familyName,
  fontsMarker,
  FONTS_PATH,
  isGoogleFont,
  isPreset,
  namedFamily,
  pageFonts,
  settingsFamilies,
  sliderGoogleFonts,
  THEME_HEADING,
} from '../model/fonts';
import type { FontFamily, SliderData } from '../model/types';

export interface SiteFonts {
  /** The theme's fonts for headings and texts (CSS `font-family`), when they could be read. */
  theme: { heading: string | null; text: string | null };
  /** The site's families, by name. */
  families: string[];
  /** Stylesheets of the site's copies, to load in the editor. */
  links: string[];
  /** `@font-face` rules of the theme. */
  faces: string;
}

const EMPTY: SiteFonts = {
  theme: { heading: null, text: null },
  families: [],
  links: [],
  faces: '',
};

/** The fonts of the probes of a page, read in a hidden frame of the editor. */
function measure(html: string): Promise<SiteFonts['theme']> {
  const none = { heading: null, text: null };
  if (typeof DOMParser === 'undefined') return Promise.resolve(none);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script, iframe, img, video, audio, picture, object, embed, noscript')
    .forEach((el) => el.remove());
  const base = doc.createElement('base');
  base.href = `${location.origin}/`;
  doc.head.prepend(base);
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText =
      'position:absolute;left:-10000px;top:0;width:1200px;height:600px;border:0;visibility:hidden';
    let finished = false;
    const done = (value: SiteFonts['theme']) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      frame.remove();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(none), 8000);
    frame.onload = () => {
      try {
        const inner = frame.contentDocument!;
        const read = (kind: string) => {
          const el = inner.querySelector(`[data-dio-probe="${kind}"]`);
          return el ? inner.defaultView!.getComputedStyle(el).fontFamily || null : null;
        };
        done({ heading: read('heading'), text: read('text') });
      } catch {
        done(none);
      }
    };
    frame.srcdoc = `<!doctype html>${doc.documentElement.outerHTML}`;
    document.body.appendChild(frame);
  });
}

async function load(google: string): Promise<SiteFonts> {
  const [page, theme, kit] = await Promise.all([
    fetch(`${FONTS_PATH}${google ? `?f=${encodeURIComponent(google)}` : ''}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.text() : ''))
      .catch(() => ''),
    api<{ values?: Record<string, unknown> }>('GET', '/themes/active').catch(() => null),
    pluginApi('fresco')<{ fonts?: { family?: unknown }[]; googleFonts?: unknown[] }>(
      'GET',
      '/kit',
    ).catch(() => null),
  ]);
  const found = page ? pageFonts(page, location.origin) : { families: [], links: [], faces: '' };
  const asked = new Set(google.split('|').map((item) => item.split(':')[0]));
  const families: string[] = [];
  const add = (name: string, known: boolean) => {
    const clean = cleanFamily(familyName(name));
    if (!clean || !namedFamily(clean) || families.includes(clean)) return;
    // A setting's value is a font only when Google has it or the site loads it.
    if (known || isGoogleFont(clean) || found.families.includes(clean)) families.push(clean);
  };
  for (const name of settingsFamilies(theme?.values ?? {})) add(name, false);
  for (const font of kit?.fonts ?? []) if (typeof font.family === 'string') add(font.family, false);
  for (const name of kit?.googleFonts ?? []) if (typeof name === 'string') add(name, false);
  // The page's own fonts, but not those only the editor asked for.
  for (const name of found.families) if (!asked.has(name)) add(name, true);
  return {
    theme: page ? await measure(page) : EMPTY.theme,
    families,
    links: [...new Set(found.links.map((l) => l.href))],
    faces: found.faces,
  };
}

const cache = new Map<string, Promise<SiteFonts>>();

/** The site's fonts, with the editor's copies of the Google fonts in `google` (`Rubik:400;700|…`). */
export function siteFonts(google: string): Promise<SiteFonts> {
  let found = cache.get(google);
  if (!found) {
    found = load(google).catch(() => EMPTY);
    cache.set(google, found);
  }
  return found;
}

/** The CSS of the theme's fonts in a drawn slider (the canvas, the preview). */
export function themeFontsCss(fonts: SiteFonts, scope: string): string {
  const out = [fonts.faces];
  if (fonts.theme.text) out.push(`${scope}{font-family:${fonts.theme.text}}`);
  if (fonts.theme.heading) out.push(`${scope} .dio-fh{font-family:${fonts.theme.heading}}`);
  return out.join('\n');
}

/** Adds the site's fonts to a document (the admin's, or the preview's frame). */
export function applyFonts(doc: Document, fonts: SiteFonts, scope: string): void {
  for (const href of fonts.links) {
    if (doc.head.querySelector(`link[data-dio-font="${CSS.escape(href)}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-dio-font', href);
    doc.head.appendChild(link);
  }
  let style = doc.getElementById('dio-site-fonts');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'dio-site-fonts';
    doc.head.appendChild(style);
  }
  style.textContent = themeFontsCss(fonts, scope);
}

/** The site's fonts for the editor, with the Google fonts the slider uses: added to the admin. */
export function useSiteFonts(slider: SliderData): SiteFonts {
  const google = useMemo(() => fontsMarker(sliderGoogleFonts(slider)), [slider]);
  const [fonts, setFonts] = useState<SiteFonts>(EMPTY);
  useEffect(() => {
    let live = true;
    // A moment after the last change: picking fonts one after another asks once.
    const timer = window.setTimeout(() => {
      void siteFonts(google).then((found) => {
        if (!live) return;
        applyFonts(document, found, '.dio--canvas');
        setFonts(found);
      });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [google]);
  return fonts;
}

// ---- The picker ----------------------------------------------------------------------

interface Option {
  value: FontFamily;
  label: string;
  group: 'theme' | 'site' | 'google' | 'stack';
}

const STACKS: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'mono', label: 'Monospace' },
];

/** The name a value shows with. */
export function fontLabel(value: FontFamily, t: (text: string) => string): string {
  if (value === 'inherit') return t('Theme font for texts');
  if (value === THEME_HEADING) return t('Theme font for headings');
  const stack = STACKS.find((s) => s.value === value);
  return stack ? t(stack.label) : value;
}

/** A layer's font: the theme's, the site's, Google's (searched), or a stack. */
export function FontPicker({
  value,
  site,
  onChange,
  label,
}: {
  value: FontFamily;
  site: string[];
  onChange: (value: FontFamily) => void;
  label: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const google = useMemo(() => [...googleFonts().keys()], []);
  const q = query.trim().toLowerCase();
  const options = useMemo(() => {
    const match = (text: string) => !q || text.toLowerCase().includes(q);
    const all: Option[] = [];
    for (const v of ['inherit', THEME_HEADING] as FontFamily[]) {
      const text = fontLabel(v, t);
      if (match(text)) all.push({ value: v, label: text, group: 'theme' });
    }
    for (const name of site) if (match(name)) all.push({ value: name, label: name, group: 'site' });
    let shown = 0;
    for (const name of google) {
      if (shown >= 150) break;
      if (site.includes(name) || !match(name)) continue;
      all.push({ value: name, label: name, group: 'google' });
      shown++;
    }
    for (const s of STACKS) {
      const text = t(s.label);
      if (match(text)) all.push({ value: s.value, label: text, group: 'stack' });
    }
    return all;
  }, [q, site, google, t]);
  const groups: Record<Option['group'], string> = {
    theme: t('Theme'),
    site: t('This site’s fonts'),
    google: t('Google Fonts'),
    stack: t('System fonts'),
  };
  const choose = (next: FontFamily) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  };
  const current =
    isPreset(value) || value === THEME_HEADING || site.includes(value) || isGoogleFont(value)
      ? fontLabel(value, t)
      : value;
  return (
    <div className="dst-font">
      <button
        ref={buttonRef}
        type="button"
        className="dst-select dst-font__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current}`}
        data-testid="dio-font"
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
      >
        <span style={namedFamily(value) ? { fontFamily: `"${value}"` } : undefined}>{current}</span>
      </button>
      {open && (
        <div className="dst-font__panel">
          <input
            autoFocus
            className="dst-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
            aria-label={t('Search fonts')}
            placeholder={t('Search fonts')}
            data-testid="dio-font-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(options.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (options[active]) choose(options[active].value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
              }
            }}
          />
          <ul id={listId} role="listbox" aria-label={label} className="dst-font__list">
            {options.map((o, i) => (
              <Fragment key={`${o.group}:${o.value}`}>
                {(i === 0 || options[i - 1]!.group !== o.group) && (
                  <li role="presentation" className="dst-font__group">
                    {groups[o.group]}
                  </li>
                )}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={i === active ? 'is-active' : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                >
                  {o.label}
                </li>
              </Fragment>
            ))}
            {options.length === 0 && <li className="dst-help">{t('No font found.')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
