import type { EntryView, HideOnScreen, TaxonomyView, TermView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@cleitext/admin-sdk';
import { useId, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert } from '../components/ui';

/** Categories and tags of an entry (RF-TAX-01), saved immediately. */
export function EntryTerms({
  entry,
  readOnly,
  onSaved,
  hidden,
}: {
  entry: EntryView;
  readOnly: boolean;
  onSaved: (view: EntryView) => void;
  /** Taxonomies hidden by field groups (plugin API 1.49): values are kept. */
  hidden?: ReadonlySet<HideOnScreen>;
}) {
  const taxonomies = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => api<TaxonomyView[]>('GET', '/taxonomies'),
  });
  const applicable =
    taxonomies.data?.filter(
      (t) =>
        t.contentTypes.includes(entry.type) &&
        !hidden?.has('taxonomies') &&
        !(t.slug === 'category' && hidden?.has('categories')) &&
        !(t.slug === 'tag' && hidden?.has('tags')),
    ) ?? [];
  return (
    <>
      {applicable.map((taxonomy) =>
        taxonomy.hierarchical ? (
          <HierarchicalTerms
            key={taxonomy.slug}
            taxonomy={taxonomy}
            entry={entry}
            readOnly={readOnly}
            onSaved={onSaved}
          />
        ) : (
          <FlatTerms
            key={taxonomy.slug}
            taxonomy={taxonomy}
            entry={entry}
            readOnly={readOnly}
            onSaved={onSaved}
          />
        ),
      )}
    </>
  );
}

interface TermsProps {
  taxonomy: TaxonomyView;
  entry: EntryView;
  readOnly: boolean;
  onSaved: (view: EntryView) => void;
}

function useAssign({ taxonomy, entry, onSaved }: TermsProps) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: (string | { name: string })[]) =>
      api<EntryView>('PATCH', `/entries/${entry.id}`, { terms: { [taxonomy.slug]: values } }),
    onSuccess: (view) => {
      onSaved(view);
      void queryClient.invalidateQueries({ queryKey: ['terms', taxonomy.slug] });
    },
  });
}

/** For matching what is typed: lowercase, without accents. */
export function plain(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Existing terms whose name contains what is typed, those starting with it first (#53). */
export function suggestTerms(
  terms: TermView[],
  typed: string,
  exclude: string[] = [],
  max = 8,
): TermView[] {
  const q = plain(typed);
  if (!q) return [];
  return terms
    .filter((term) => !exclude.includes(term.id) && plain(term.name).includes(q))
    .sort(
      (a, b) =>
        Number(!plain(a.name).startsWith(q)) - Number(!plain(b.name).startsWith(q)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, max);
}

function label(taxonomy: TaxonomyView, locale: string): string {
  return taxonomy.name[locale] ?? taxonomy.name.en ?? taxonomy.slug;
}

function HierarchicalTerms(props: TermsProps) {
  const { taxonomy, entry, readOnly } = props;
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const terms = useQuery({
    queryKey: ['terms', taxonomy.slug, entry.locale],
    queryFn: () =>
      api<TermView[]>('GET', `/taxonomies/${taxonomy.slug}/terms?locale=${entry.locale}`),
  });
  const assign = useAssign(props);
  const create = useMutation({
    mutationFn: () =>
      api<TermView>('POST', `/taxonomies/${taxonomy.slug}/terms`, { name, locale: entry.locale }),
    onSuccess: async (term) => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['terms', taxonomy.slug] });
      assign.mutate([...selectedIds, term.id]);
    },
  });

  const selectedIds = (entry.terms[taxonomy.slug] ?? []).map((t) => t.id);
  // While a name is typed, the list shows the categories that match it (#53).
  const typed = plain(name);
  const tree = buildTree(terms.data ?? []).filter(
    ({ term }) => !typed || plain(term.name).includes(typed),
  );
  const same = typed ? terms.data?.find((term) => plain(term.name) === typed) : undefined;
  const error = assign.error ?? create.error;

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{label(taxonomy, me.user.locale)}</h3>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {typed && tree.length === 0 && (
          <li className="text-sm text-slate-500">{t('None yet: Add creates it.')}</li>
        )}
        {tree.map(({ term, depth }) => (
          <li key={term.id} style={{ paddingLeft: depth * 16 }}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={readOnly || assign.isPending}
                checked={selectedIds.includes(term.id)}
                onChange={(e) =>
                  assign.mutate(
                    e.target.checked
                      ? [...selectedIds, term.id]
                      : selectedIds.filter((id) => id !== term.id),
                  )
                }
              />
              {term.name}
            </label>
          </li>
        ))}
      </ul>
      {!readOnly && me.capabilities.includes('manage_terms') && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            // One with that name already: select it instead of making a twin.
            if (same) {
              setName('');
              if (!selectedIds.includes(same.id)) assign.mutate([...selectedIds, same.id]);
            } else create.mutate();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('New {name}', {
              name: label(taxonomy, 'en').toLowerCase().replace(/ies$/, 'y').replace(/s$/, ''),
              taxonomy: label(taxonomy, me.user.locale).toLowerCase(),
            })}
            aria-label={t('Add new to {name}', {
              name: label(taxonomy, 'en'),
              taxonomy: label(taxonomy, me.user.locale),
            })}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
          />
          <button
            type="submit"
            className="text-sky-700 hover:underline"
            disabled={create.isPending}
          >
            {same ? t('Select') : t('Add')}
          </button>
        </form>
      )}
    </section>
  );
}

function FlatTerms(props: TermsProps) {
  const { taxonomy, entry, readOnly } = props;
  const { t } = useT();
  const me = useMe();
  const id = useId();
  const [value, setValue] = useState('');
  // No suggestion is picked until the arrows reach one: Enter adds what was typed.
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const assign = useAssign(props);
  const current = entry.terms[taxonomy.slug] ?? [];
  const all = useQuery({
    queryKey: ['terms', taxonomy.slug, entry.locale],
    queryFn: () =>
      api<TermView[]>('GET', `/taxonomies/${taxonomy.slug}/terms?locale=${entry.locale}`),
    enabled: !readOnly,
  });
  // The tag being typed is the last piece after a comma (#53).
  const piece = value.split(',').at(-1) ?? '';
  const suggestions = open
    ? suggestTerms(
        all.data ?? [],
        piece,
        current.map((term) => term.id),
      )
    : [];

  const add = (picked?: TermView) => {
    const pieces = value.split(',').map((n) => n.trim());
    if (picked) pieces.pop();
    const names = pieces.filter(Boolean);
    if (names.length === 0 && !picked) return;
    setValue('');
    setActive(-1);
    // A typed name that exists is that tag, not a new one.
    const known = all.data ?? [];
    const values: (string | { name: string })[] = current.map((term) => term.id);
    for (const n of names) {
      const same = known.find((term) => plain(term.name) === plain(n));
      if (same) {
        if (!values.includes(same.id)) values.push(same.id);
      } else values.push({ name: n });
    }
    if (picked && !values.includes(picked.id)) values.push(picked.id);
    assign.mutate(values);
  };

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{label(taxonomy, me.user.locale)}</h3>
      {assign.error && <Alert>{errorMessage(assign.error)}</Alert>}
      <ul className="flex flex-wrap gap-1">
        {current.map((term) => (
          <li key={term.id} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
            {term.name}
            {!readOnly && (
              <button
                type="button"
                aria-label={t('Remove {name}', { name: term.name })}
                className="text-slate-500 hover:text-red-700"
                onClick={() =>
                  assign.mutate(current.filter((c) => c.id !== term.id).map((c) => c.id))
                }
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="relative">
          <input
            value={value}
            disabled={assign.isPending}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              suggestions[active] ? `${id}-${suggestions[active].id}` : undefined
            }
            onChange={(e) => {
              setValue(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault();
                setActive(active + 1 >= suggestions.length ? 0 : active + 1);
              } else if (e.key === 'ArrowUp' && suggestions.length) {
                e.preventDefault();
                setActive(active <= 0 ? suggestions.length - 1 : active - 1);
              } else if (e.key === 'Escape') {
                setOpen(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                add(active >= 0 ? suggestions[active] : undefined);
              }
            }}
            onBlur={() => {
              setOpen(false);
              add();
            }}
            placeholder={t('Add tags, separated by commas')}
            aria-label={t('Add {name}', {
              name: label(taxonomy, 'en').toLowerCase(),
              taxonomy: label(taxonomy, me.user.locale).toLowerCase(),
            })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
          {suggestions.length > 0 && (
            <ul
              id={`${id}-list`}
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded border border-slate-200 bg-white py-1 shadow-lg"
            >
              {suggestions.map((term, i) => (
                <li
                  key={term.id}
                  id={`${id}-${term.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`cursor-pointer px-2 py-1 text-sm ${i === active ? 'bg-sky-100' : 'hover:bg-slate-50'}`}
                  // Before the input's blur, so the click is not lost.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(term);
                  }}
                >
                  {term.name}
                  {typeof term.count === 'number' && (
                    <span className="ml-1 text-xs text-slate-500">({term.count})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Depth-first order of a term tree. */
function buildTree(terms: TermView[]): { term: TermView; depth: number }[] {
  const children = new Map<string | null, TermView[]>();
  for (const term of terms) {
    const key = term.parentId && terms.some((t) => t.id === term.parentId) ? term.parentId : null;
    children.set(key, [...(children.get(key) ?? []), term]);
  }
  const out: { term: TermView; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const term of children.get(parent) ?? []) {
      out.push({ term, depth });
      walk(term.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
