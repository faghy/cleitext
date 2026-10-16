import { FieldsForm } from '@cleitext/admin-sdk';
import type { FieldValues, TaxonomyView, TermView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { entryTree } from '../entry-tree';
import { PlaceholderPage } from './dashboard';
import { PluginCell, usePluginColumnData, usePluginColumns } from '../plugins';

export const taxonomiesQuery = {
  queryKey: ['taxonomies'],
  queryFn: () => api<TaxonomyView[]>('GET', '/taxonomies'),
  staleTime: 60_000,
};

export function taxonomyLabel(taxonomy: TaxonomyView, locale: string): string {
  return taxonomy.name[locale] ?? taxonomy.name.en ?? taxonomy.slug;
}

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';

/** Posts → Categories, Tags… (RF-TAX-01/03): terms of a taxonomy, per language. */
export function TermsPage({ slug }: { slug: string }) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const taxonomies = useQuery(taxonomiesQuery);
  const [locale, setLocale] = useState(me.site.defaultLocale);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const taxonomy = taxonomies.data?.find((tx) => tx.slug === slug);

  const termsKey = ['terms', slug, locale];
  const terms = useQuery({
    queryKey: termsKey,
    queryFn: () => api<TermView[]>('GET', `/taxonomies/${slug}/terms?locale=${locale}`),
    enabled: Boolean(taxonomy),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['terms', slug] });
  // Columns of plugins, e.g. the translations of the language plugin.
  const columns = usePluginColumns('term', slug);
  const listRows = (terms.data ?? []).map((term) => ({
    id: term.id,
    locale: term.locale,
    title: term.name,
  }));
  const columnData = usePluginColumnData(columns, slug, listRows);

  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/terms/${id}`),
    onSuccess: refresh,
  });
  if (taxonomies.isPending) return <p className="text-sm text-slate-600">{t('Loading…')}</p>;
  if (!taxonomy) return <PlaceholderPage path={`/taxonomies/${slug}`} />;

  const name = taxonomyLabel(taxonomy, me.user.locale);
  const multilingual = me.site.locales.length > 1;
  const all = terms.data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? all
        .filter((term) => `${term.name} ${term.slug}`.toLowerCase().includes(needle))
        .map((entry) => ({ entry, depth: 0 }))
    : taxonomy.hierarchical
      ? entryTree(all.map((term) => ({ ...term, title: term.name })))
      : all.map((entry) => ({ entry, depth: 0 }));
  const error = remove.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{name}</h1>
        {multilingual && (
          <label className="flex items-center gap-2 text-sm">
            <span>{t('Language')}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value);
                setEditing(null);
              }}
            >
              {me.site.locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <Alert>{errorMessage(error)}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card title={t('Add new')}>
          <TermForm
            key={`${slug}-${locale}`}
            taxonomy={taxonomy}
            locale={locale}
            terms={all}
            onSaved={async (term) => {
              await refresh();
              setMessage(t('Added: {name}', { name: term.name }));
            }}
          />
        </Card>

        <Card>
          <div className="mb-3 flex justify-end">
            <label className="sr-only" htmlFor="terms-search">
              {t('Search {title}', { title: name.toLowerCase() })}
            </label>
            <input
              id="terms-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search')}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {terms.isPending ? (
            <p className="text-sm text-slate-600">{t('Loading…')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-600">{t('Nothing found.')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2 font-medium">{t('Name')}</th>
                  <th className="py-2 font-medium">{t('Slug')}</th>
                  <th className="py-2 font-medium">{t('Count')}</th>
                  {columns.map((column) => (
                    <th key={column.key} className="py-2 font-medium">
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry: term, depth }) =>
                  editing === term.id ? (
                    <tr key={term.id} className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={3 + columns.length} className="p-3">
                        <TermForm
                          taxonomy={taxonomy}
                          locale={locale}
                          terms={all}
                          term={term}
                          onSaved={async () => {
                            await refresh();
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={term.id} className="group border-b border-slate-100 align-top">
                      <td className="py-2">
                        <span className="font-medium">
                          {depth > 0 && <span aria-hidden="true">{'— '.repeat(depth)}</span>}
                          {term.name}
                        </span>
                        {term.description && (
                          <p className="text-xs text-slate-500">{term.description}</p>
                        )}
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            className="text-sky-700 hover:underline"
                            onClick={() => setEditing(term.id)}
                          >
                            {t('Edit')}
                            <span className="sr-only"> {term.name}</span>
                          </button>
                          <button
                            type="button"
                            className="text-red-700 hover:underline"
                            onClick={() => {
                              if (window.confirm(t('Delete "{name}"?', { name: term.name })))
                                remove.mutate(term.id);
                            }}
                          >
                            {t('Delete')}
                            <span className="sr-only"> {term.name}</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-2 text-slate-600">{term.slug}</td>
                      <td className="py-2">{term.count}</td>
                      {columns.map((column) => (
                        <td key={column.key} className="py-2">
                          <PluginCell
                            column={column}
                            row={{ id: term.id, locale: term.locale, title: term.name }}
                            data={columnData.data?.[column.key]?.[term.id]}
                            refresh={() => {
                              void columnData.refetch();
                              void refresh();
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Adds a term, or edits one (`term`). */
function TermForm({
  taxonomy,
  locale,
  terms,
  term,
  onSaved,
  onCancel,
}: {
  taxonomy: TaxonomyView;
  locale: string;
  terms: TermView[];
  term?: TermView;
  onSaved: (term: TermView) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(term?.name ?? '');
  const [slug, setSlug] = useState(term?.slug ?? '');
  const [parentId, setParentId] = useState(term?.parentId ?? '');
  const [description, setDescription] = useState(term?.description ?? '');
  // Custom fields of the taxonomy, e.g. an image (plugin taxonomies).
  const [fields, setFields] = useState<FieldValues>((term?.fields ?? {}) as FieldValues);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        ...(taxonomy.hierarchical ? { parentId: parentId || null } : {}),
        description,
        ...(taxonomy.fields.length > 0 ? { fields } : {}),
      };
      return term
        ? api<TermView>('PATCH', `/terms/${term.id}`, body)
        : api<TermView>('POST', `/taxonomies/${taxonomy.slug}/terms`, { ...body, locale });
    },
    onSuccess: async (saved) => {
      if (!term) {
        setName('');
        setSlug('');
        setDescription('');
        setFields({});
      }
      await onSaved(saved);
    },
  });

  // A term cannot be moved under itself or its children.
  const excluded = new Set<string>();
  if (term) {
    excluded.add(term.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of terms) {
        if (other.parentId && excluded.has(other.parentId) && !excluded.has(other.id)) {
          excluded.add(other.id);
          grew = true;
        }
      }
    }
  }
  const parents = entryTree(
    terms
      .filter((other) => !excluded.has(other.id))
      .map((other) => ({ ...other, title: other.name })),
  );

  return (
    <form
      className="space-y-3"
      aria-label={term ? t('Edit {name}', { name: term.name }) : t('Add new')}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label={t('Slug')}
        value={slug}
        placeholder={term ? undefined : t('Generated from the name')}
        onChange={(e) => setSlug(e.target.value)}
      />
      {taxonomy.hierarchical && (
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t('Parent')}</span>
          <select
            className={selectClass}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">{t('None')}</option>
            {parents.map((row) => (
              <option key={row.entry.id} value={row.entry.id}>
                {'— '.repeat(row.depth)}
                {row.entry.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span className="block font-medium text-slate-800">{t('Description')}</span>
        <textarea
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {taxonomy.fields.length > 0 && (
        <FieldsForm fields={taxonomy.fields} values={fields} locale={locale} onChange={setFields} />
      )}
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !name.trim()}>
          {term ? t('Update') : t('Add')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
