import {
  choiceUrl,
  combinations,
  headingOf,
  select,
  type Choice,
  type Item,
  type Wording,
} from './data';

/** The block's settings (Setax filter), with their defaults. */
export interface FilterAttrs {
  /** The taxonomy of the first select (its terms), e.g. `elettrodomestici`. */
  taxonomy: string;
  /** The content types listed, comma-separated (default `page`). */
  types: string;
  labelType: string;
  labelPlace: string;
  /** The names of the address's parameters, e.g. `tipo` and `comune`. */
  paramType: string;
  paramPlace: string;
  button: string;
  headingBoth: string;
  headingType: string;
  headingPlace: string;
  /** The meta description of a choice, with `{tipo}`, `{zona}` and `{n}` (how many). */
  description: string;
  noResults: string;
  /** What each result shows: its excerpt, or the title only. */
  show: 'excerpt' | 'title';
  /** Links to every choice with results, under the form (for visitors and search engines). */
  index: boolean;
  indexTitle: string;
}

export const DEFAULT_ATTRS: FilterAttrs = {
  taxonomy: '',
  types: 'page',
  labelType: 'Scegli il tipo',
  labelPlace: 'Scegli la zona',
  paramType: 'tipo',
  paramPlace: 'zona',
  button: 'Cerca',
  headingBoth: '{tipo} a {zona}',
  headingType: '{tipo}: tutte le zone',
  headingPlace: 'Tutti i servizi a {zona}',
  description: '{tipo} a {zona}: {n} risultati.',
  noResults: 'Nessun risultato trovato.',
  show: 'excerpt',
  index: true,
  indexTitle: 'Tutte le zone, per tipo',
};

const PARAM_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/** The attributes as saved, cleaned and completed with the defaults. */
export function attrsOf(raw: Record<string, unknown> | undefined): FilterAttrs {
  const a = { ...DEFAULT_ATTRS, ...(raw ?? {}) } as Record<string, unknown>;
  const text = (key: keyof FilterAttrs) =>
    typeof a[key] === 'string' && (a[key] as string).trim() !== ''
      ? (a[key] as string).trim()
      : (DEFAULT_ATTRS[key] as string);
  const param = (key: 'paramType' | 'paramPlace') =>
    PARAM_RE.test(String(a[key] ?? '')) ? String(a[key]) : DEFAULT_ATTRS[key];
  return {
    taxonomy: typeof a.taxonomy === 'string' ? a.taxonomy.trim() : '',
    types: text('types'),
    labelType: text('labelType'),
    labelPlace: text('labelPlace'),
    paramType: param('paramType'),
    paramPlace: param('paramPlace') === param('paramType') ? 'zona' : param('paramPlace'),
    button: text('button'),
    headingBoth: text('headingBoth'),
    headingType: text('headingType'),
    headingPlace: text('headingPlace'),
    description: text('description'),
    noResults: text('noResults'),
    show: a.show === 'title' ? 'title' : 'excerpt',
    index: a.index !== false,
    indexTitle: text('indexTitle'),
  };
}

export const wordingOf = (a: FilterAttrs): Wording => ({
  both: a.headingBoth,
  typeOnly: a.headingType,
  placeOnly: a.headingPlace,
});

/** The choice in the address, when it names a type and/or a place that exist. */
export function chosen(
  a: FilterAttrs,
  params: Record<string, string> | undefined,
  options: { types: Choice[]; places: Choice[] },
): { type: Choice | null; place: Choice | null; asked: boolean; invalid: boolean } {
  const rawType = params?.[a.paramType]?.trim() ?? '';
  const rawPlace = params?.[a.paramPlace]?.trim() ?? '';
  const type = options.types.find((t) => t.slug === rawType) ?? null;
  const place = options.places.find((p) => p.slug === rawPlace) ?? null;
  return {
    type,
    place,
    asked: rawType !== '' || rawPlace !== '',
    // A value given that names no type or place, e.g. `?tipo=xxx&zona=albenga`.
    invalid: (rawType !== '' && !type) || (rawPlace !== '' && !place),
  };
}

export function Filter({
  attrs,
  items,
  options,
  params,
  path,
}: {
  attrs: FilterAttrs;
  items: Item[];
  options: { types: Choice[]; places: Choice[] };
  params: Record<string, string> | undefined;
  /** The page's own path, e.g. `/zone/`. */
  path: string;
}) {
  const { type, place, asked } = chosen(attrs, params, options);
  const results =
    asked && (type || place) ? select(items, type?.slug ?? null, place?.slug ?? null) : [];
  const heading = headingOf(wordingOf(attrs), type, place);
  const p = { type: attrs.paramType, place: attrs.paramPlace };
  const combos = attrs.index ? combinations(items).filter((c) => c.type && c.place) : [];
  const byType = new Map<string, { type: Choice; places: { place: Choice; count: number }[] }>();
  for (const c of combos) {
    const group = byType.get(c.type!.slug) ?? { type: c.type!, places: [] };
    group.places.push({ place: c.place!, count: c.count });
    byType.set(c.type!.slug, group);
  }
  return (
    <div className="setax">
      <form className="setax-form" method="get" action={path} role="search">
        <label className="setax-field">
          <span>{attrs.labelType}</span>
          <select name={attrs.paramType} defaultValue={type?.slug ?? ''}>
            <option value="">—</option>
            {options.types.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="setax-field">
          <span>{attrs.labelPlace}</span>
          <select name={attrs.paramPlace} defaultValue={place?.slug ?? ''}>
            <option value="">—</option>
            {options.places.map((pl) => (
              <option key={pl.slug} value={pl.slug}>
                {pl.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="setax-button">
          {attrs.button}
        </button>
      </form>

      {asked && (
        <section className="setax-results" aria-live="polite">
          {heading && <h2 className="setax-heading">{heading}</h2>}
          {results.length === 0 ? (
            <p className="setax-none">{attrs.noResults}</p>
          ) : (
            <ul className="setax-list">
              {results.map((item) => (
                <li key={item.id} className="setax-item">
                  <h3>
                    <a href={item.url}>{item.title}</a>
                  </h3>
                  {attrs.show === 'excerpt' && item.excerpt && <p>{item.excerpt}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {byType.size > 0 && (
        <nav className="setax-index" aria-label={attrs.indexTitle}>
          <h2>{attrs.indexTitle}</h2>
          {[...byType.values()].map((group) => (
            <p key={group.type.slug}>
              <a href={choiceUrl(path, p, group.type.slug, null)}>
                <strong>{group.type.name}</strong>
              </a>
              {': '}
              {group.places.map((pl, i) => (
                <span key={pl.place.slug}>
                  {i > 0 && ' · '}
                  <a href={choiceUrl(path, p, group.type.slug, pl.place.slug)}>{pl.place.name}</a>
                </span>
              ))}
            </p>
          ))}
        </nav>
      )}
      <style dangerouslySetInnerHTML={{ __html: SETAX_CSS }} />
    </div>
  );
}

/** Default look: themes can override the `setax-` classes. */
export const SETAX_CSS =
  `.setax-form{display:flex;flex-wrap:wrap;gap:.75rem 1rem;align-items:flex-end;margin:1.5rem 0}
.setax-field{display:flex;flex-direction:column;gap:.3rem;flex:1 1 14rem;font-weight:600}
.setax-field select{font:inherit;font-weight:400;padding:.55em .7em;border:1px solid rgba(127,127,127,.45);border-radius:6px;background:transparent;color:inherit}
.setax-button{font:inherit;font-weight:600;padding:.6em 1.4em;border:0;border-radius:6px;background:var(--cx-accent,#0e7490);color:#fff;cursor:pointer}
.setax-list{list-style:none;margin:0;padding:0;display:grid;gap:1rem}.setax-item h3{margin:0 0 .25rem;font-size:1.1em}.setax-item p{margin:0}
.setax-index{margin-top:2.5rem;font-size:.95em}.setax-index h2{font-size:1.15em}.setax-index p{margin:.4rem 0}`.replace(
    /\n/g,
    '',
  );
