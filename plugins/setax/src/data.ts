/**
 * The data of a filter: the entries with their types (terms of a taxonomy)
 * and their place (a text field), the choices of the two selects, the
 * entries matching a choice, and the choices that have entries (the pages
 * worth showing to search engines).
 */

export interface Choice {
  slug: string;
  name: string;
}

export interface Item {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  types: Choice[];
  /** The place as written, e.g. "Cairo Montenotte"; empty when none. */
  place: string;
}

/** A value as it goes in an address: "Cairo Montenotte" → "cairo-montenotte". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const byName = (a: Choice, b: Choice) =>
  a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });

/** The types and places that some entry has, sorted by name. */
export function choices(items: Item[]): { types: Choice[]; places: Choice[] } {
  const types = new Map<string, Choice>();
  const places = new Map<string, Choice>();
  for (const item of items) {
    for (const type of item.types) if (!types.has(type.slug)) types.set(type.slug, type);
    const name = item.place.trim();
    const slug = slugify(name);
    if (slug && !places.has(slug)) places.set(slug, { slug, name });
  }
  return { types: [...types.values()].sort(byName), places: [...places.values()].sort(byName) };
}

/** The entries of a type, of a place, or of both (by their slugs), sorted by title. */
export function select(items: Item[], type: string | null, place: string | null): Item[] {
  return items
    .filter(
      (item) =>
        (!type || item.types.some((t) => t.slug === type)) &&
        (!place || slugify(item.place) === place),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }));
}

export interface Combination {
  type: Choice | null;
  place: Choice | null;
  count: number;
}

/** Every choice with entries: each type, each place, and each type in each place. */
export function combinations(items: Item[]): Combination[] {
  const { types, places } = choices(items);
  const out: Combination[] = [];
  for (const type of types) {
    out.push({ type, place: null, count: select(items, type.slug, null).length });
    for (const place of places) {
      const count = select(items, type.slug, place.slug).length;
      if (count > 0) out.push({ type, place, count });
    }
  }
  for (const place of places)
    out.push({ type: null, place, count: select(items, null, place.slug).length });
  return out;
}

/** Fills `{tipo}` and `{zona}` (also `{type}` and `{place}`) in a heading template. */
export function fillTemplate(template: string, type: Choice | null, place: Choice | null): string {
  // Italian: "ad Albenga", not "a Albenga".
  const placeName = place?.name ?? '';
  const withAd = /^[aà]/i.test(placeName)
    ? template.replace(/\ba (\{(?:zona|place)\})/g, 'ad $1')
    : template;
  return withAd
    .replace(/\{(tipo|type)\}/g, type?.name ?? '')
    .replace(/\{(zona|place)\}/g, place?.name ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface Wording {
  /** Both chosen, e.g. "{tipo} a {zona}". */
  both: string;
  /** Only the type, e.g. "{tipo}: tutte le zone". */
  typeOnly: string;
  /** Only the place, e.g. "Tutti i tipi a {zona}". */
  placeOnly: string;
}

/** The heading of a choice. */
export function headingOf(wording: Wording, type: Choice | null, place: Choice | null): string {
  if (type && place) return fillTemplate(wording.both, type, place);
  if (type) return fillTemplate(wording.typeOnly, type, null);
  if (place) return fillTemplate(wording.placeOnly, null, place);
  return '';
}

/** The address of a choice: the page's own, with the parameters in a fixed order. */
export function choiceUrl(
  base: string,
  params: { type: string; place: string },
  type: string | null,
  place: string | null,
): string {
  const query = [
    ...(type ? [`${encodeURIComponent(params.type)}=${encodeURIComponent(type)}`] : []),
    ...(place ? [`${encodeURIComponent(params.place)}=${encodeURIComponent(place)}`] : []),
  ].join('&');
  return query ? `${base}?${query}` : base;
}

/** Fills `{n}` with how many, with the noun after it in the singular for one ("1 risultato"). */
export function fillCount(text: string, n: number): string {
  const filled = text.replace(/\{n\}/g, String(n));
  if (n !== 1) return filled;
  return filled
    .replace(/(^|[^\d])1 risultati\b/g, '$11 risultato')
    .replace(/(^|[^\d])1 results\b/g, '$11 result')
    .replace(/(^|[^\d])1 servizi\b/g, '$11 servizio');
}
