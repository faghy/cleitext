import type { EntryView, HideOnScreen, TaxonomyView, TermView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
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
  const tree = buildTree(terms.data ?? []);
  const error = assign.error ?? create.error;

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{label(taxonomy, me.user.locale)}</h3>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <ul className="max-h-48 space-y-1 overflow-y-auto">
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
            if (name.trim()) create.mutate();
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
            {t('Add')}
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
  const [value, setValue] = useState('');
  const assign = useAssign(props);
  const current = entry.terms[taxonomy.slug] ?? [];

  const add = () => {
    const names = value
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setValue('');
    assign.mutate([...current.map((term) => term.id), ...names.map((n) => ({ name: n }))]);
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
        <input
          value={value}
          disabled={assign.isPending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={t('Add tags, separated by commas')}
          aria-label={t('Add {name}', {
            name: label(taxonomy, 'en').toLowerCase(),
            taxonomy: label(taxonomy, me.user.locale).toLowerCase(),
          })}
          className="w-full rounded border border-slate-300 px-2 py-1"
        />
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
