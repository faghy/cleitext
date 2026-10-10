import {
  CONTENT_TYPE_FEATURES,
  labelText,
  type ContentTypeView,
  type FieldDefinition,
  type TaxonomyView,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField, useT } from '../components/ui';
import { contentTypesQuery } from '../plugins';
import { taxonomiesQuery } from './terms';

const FEATURE_LABELS: Record<(typeof CONTENT_TYPE_FEATURES)[number], string> = {
  blocks: 'Block editor',
  featured_image: 'Featured image',
  excerpt: 'Excerpt',
  parent: 'Parent page',
};

const FIELD_TYPES: { value: FieldDefinition['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'url', label: 'Web address' },
  { value: 'select', label: 'Choice' },
  { value: 'media', label: 'Media file' },
];

const SOURCE_LABELS: Record<string, string> = { core: 'built-in', user: 'custom' };

const selectClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

/** Settings → Content structure: types, fields, permalinks, taxonomies. */
export function StructurePage() {
  const { t } = useT();
  const me = useMe();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Content structure')}</h1>
      {me.capabilities.includes('manage_content_types') && <ContentTypesCard />}
      {me.capabilities.includes('manage_taxonomies') && <TaxonomiesCard />}
    </div>
  );
}

function useNames() {
  const me = useMe();
  return me.site.locales.map((l) => ({ code: l.code, name: l.name }));
}

function ContentTypesCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const types = useQuery(contentTypesQuery);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: contentTypesQuery.queryKey });
  const remove = useMutation({
    mutationFn: (slug: string) => api<void>('DELETE', `/content-types/${slug}`),
    onSuccess: refresh,
  });

  return (
    <Card title={t('Content types')}>
      <div className="space-y-3 text-sm">
        {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
        <table className="w-full text-left">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2 font-medium">{t('Name')}</th>
              <th className="py-2 font-medium">{t('Permalink')}</th>
              <th className="py-2 font-medium">{t('Source')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {types.data?.map((type) =>
              editing === type.slug ? (
                <tr key={type.slug}>
                  <td colSpan={4} className="py-2">
                    <TypeForm
                      type={type}
                      onDone={async () => {
                        setEditing(null);
                        await refresh();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={type.slug}
                  aria-label={labelText(type.name, me.user.locale)}
                  className="border-b border-slate-100"
                >
                  <td className="py-2">
                    <span className="font-medium">{labelText(type.name, me.user.locale)}</span>
                    <span className="block font-mono text-xs text-slate-500">{type.slug}</span>
                  </td>
                  <td className="py-2 font-mono text-xs">{type.permalink}</td>
                  <td className="py-2">{t(SOURCE_LABELS[type.source] ?? type.source)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button variant="secondary" onClick={() => setEditing(type.slug)}>
                      {t('Edit')}
                    </Button>{' '}
                    {type.source === 'user' && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (
                            window.confirm(
                              t('Delete the content type "{name}"?', { name: type.slug }),
                            )
                          )
                            remove.mutate(type.slug);
                        }}
                      >
                        {t('Delete')}
                      </Button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {adding ? (
          <TypeForm
            onDone={async () => {
              setAdding(false);
              await refresh();
            }}
          />
        ) : (
          <Button onClick={() => setAdding(true)}>{t('Add content type')}</Button>
        )}
      </div>
    </Card>
  );
}

/** New type, or changes to one (only the permalink for built-in and plugin types). */
function TypeForm({ type, onDone }: { type?: ContentTypeView; onDone: () => Promise<void> }) {
  const { t } = useT();
  const locales = useNames();
  const own = !type || type.source === 'user';
  const [slug, setSlug] = useState(type?.slug ?? '');
  const [names, setNames] = useState<Record<string, string>>(type?.name ?? {});
  const [hierarchical, setHierarchical] = useState(type?.hierarchical ?? false);
  const [supports, setSupports] = useState<string[]>(
    type?.supports.filter((s) => (CONTENT_TYPE_FEATURES as readonly string[]).includes(s)) ?? [
      'blocks',
    ],
  );
  const [permalink, setPermalink] = useState(type?.permalink ?? '');
  const [fields, setFields] = useState<FieldDefinition[]>(type?.fields ?? []);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const cleanNames = Object.fromEntries(Object.entries(names).filter(([, v]) => v.trim()));
      if (!type) {
        await api('POST', '/content-types', {
          slug,
          name: cleanNames,
          hierarchical,
          supports,
          ...(permalink.trim() ? { permalink: permalink.trim() } : {}),
          fields,
        });
        return null;
      }
      return api<{ redirects: number }>('PATCH', `/content-types/${type.slug}`, {
        ...(own ? { name: cleanNames, supports, fields } : {}),
        ...(permalink !== type.permalink ? { permalink } : {}),
      });
    },
    onSuccess: async (result) => {
      if (result?.redirects) {
        setMessage(
          t('{count} old addresses now redirect to the new ones.', { count: result.redirects }),
        );
      }
      await onDone();
    },
  });

  return (
    <form
      className="space-y-3 rounded border border-slate-200 p-3"
      aria-label={type ? t('Edit {name}', { name: type.slug }) : t('New content type')}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {message && <Alert kind="success">{message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        {!type && (
          <TextField
            label={t('Identifier')}
            hint={t('Lowercase letters and digits, e.g. event. It cannot change later.')}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        {own &&
          locales.map((locale) => (
            <TextField
              key={locale.code}
              label={t('Name ({language})', { language: locale.name })}
              value={names[locale.code] ?? ''}
              onChange={(e) => setNames({ ...names, [locale.code]: e.target.value })}
            />
          ))}
        <TextField
          label={t('Permalink')}
          hint={
            (type?.hierarchical ?? hierarchical)
              ? t('Ends with {path} (the address of the parents, then the slug).', {
                  path: '{path}',
                })
              : t('Ends with {slug}; may contain words, {year} and {month}.', {
                  slug: '{slug}',
                  year: '{year}',
                  month: '{month}',
                })
          }
          placeholder={
            type ? undefined : `/${slug || 'event'}/${hierarchical ? '{path}' : '{slug}'}`
          }
          value={permalink}
          onChange={(e) => setPermalink(e.target.value)}
        />
      </div>
      {!type && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hierarchical}
            onChange={(e) => setHierarchical(e.target.checked)}
          />
          {t('Hierarchical (entries can have a parent, like pages)')}
        </label>
      )}
      {own && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 font-medium text-slate-800">{t('Features')}</legend>
          {CONTENT_TYPE_FEATURES.map((feature) => (
            <label key={feature} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={supports.includes(feature)}
                onChange={(e) =>
                  setSupports(
                    e.target.checked
                      ? [...supports, feature]
                      : supports.filter((s) => s !== feature),
                  )
                }
              />
              {t(FEATURE_LABELS[feature])}
            </label>
          ))}
        </fieldset>
      )}
      {own && <FieldsEditor fields={fields} onChange={setFields} />}
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || (!type && !slug.trim())}>
          {type ? t('Save') : t('Add content type')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onDone()}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Custom fields of a type: name, label, kind, required. */
function FieldsEditor({
  fields,
  onChange,
}: {
  fields: FieldDefinition[];
  onChange: (fields: FieldDefinition[]) => void;
}) {
  const { t } = useT();
  const update = (index: number, changes: Partial<FieldDefinition>) =>
    onChange(fields.map((f, i) => (i === index ? ({ ...f, ...changes } as FieldDefinition) : f)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 font-medium text-slate-800">{t('Custom fields')}</legend>
      {fields.map((field, index) => (
        <div
          key={index}
          className="flex flex-wrap items-end gap-2"
          aria-label={t('Field {n}', { n: index + 1 })}
        >
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">{t('Key')}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1"
              value={field.name}
              onChange={(e) => update(index, { name: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">{t('Label')}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1"
              value={typeof field.label === 'string' ? field.label : labelText(field.label)}
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-600">{t('Kind')}</span>
            <select
              className={selectClass}
              value={field.type}
              onChange={(e) => {
                const type = e.target.value as FieldDefinition['type'];
                const next = {
                  name: field.name,
                  label: field.label,
                  required: field.required,
                  type,
                } as FieldDefinition;
                if (type === 'select')
                  (next as { options: unknown }).options = [{ value: 'a', label: 'A' }];
                onChange(fields.map((f, i) => (i === index ? next : f)));
              }}
            >
              {FIELD_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>
          {field.type === 'select' && (
            <label className="space-y-1">
              <span className="block text-xs text-slate-600">{t('Choices (comma separated)')}</span>
              <input
                className="rounded border border-slate-300 px-2 py-1"
                value={field.options.map((o) => o.value).join(', ')}
                onChange={(e) =>
                  update(index, {
                    options: e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                      .map((v) => ({ value: v, label: v })),
                  } as Partial<FieldDefinition>)
                }
              />
            </label>
          )}
          <label className="flex items-center gap-1 pb-1">
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(e) => update(index, { required: e.target.checked })}
            />
            {t('Required')}
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange(fields.filter((_, i) => i !== index))}
          >
            {t('Remove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange([...fields, { name: `field${fields.length + 1}`, label: '', type: 'text' }])
        }
      >
        {t('Add field')}
      </Button>
    </fieldset>
  );
}

function TaxonomiesCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const taxonomies = useQuery(taxonomiesQuery);
  const types = useQuery(contentTypesQuery);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: taxonomiesQuery.queryKey });
  const remove = useMutation({
    mutationFn: (slug: string) => api<void>('DELETE', `/taxonomies/${slug}`),
    onSuccess: refresh,
  });
  const typeName = (slug: string) => {
    const type = types.data?.find((ty) => ty.slug === slug);
    return type ? labelText(type.name, me.user.locale) : slug;
  };

  return (
    <Card title={t('Taxonomies')}>
      <div className="space-y-3 text-sm">
        {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
        <ul className="divide-y divide-slate-100" aria-label={t('Taxonomies')}>
          {taxonomies.data?.map((taxonomy) => (
            <li
              key={taxonomy.slug}
              aria-label={labelText(taxonomy.name, me.user.locale)}
              className="py-2"
            >
              {editing === taxonomy.slug ? (
                <TaxonomyForm
                  taxonomy={taxonomy}
                  types={types.data ?? []}
                  onDone={async () => {
                    setEditing(null);
                    await refresh();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-medium">{labelText(taxonomy.name, me.user.locale)}</span>{' '}
                    <span className="font-mono text-xs text-slate-500">/{taxonomy.slug}/…</span>
                    <span className="block text-xs text-slate-600">
                      {taxonomy.hierarchical ? t('Hierarchical') : t('Flat')} ·{' '}
                      {taxonomy.contentTypes.map(typeName).join(', ') || t('No content types')}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing(taxonomy.slug)}>
                      {t('Edit')}
                    </Button>
                    {!['category', 'tag'].includes(taxonomy.slug) && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (
                            window.confirm(
                              t('Delete the taxonomy "{name}"?', { name: taxonomy.slug }),
                            )
                          )
                            remove.mutate(taxonomy.slug);
                        }}
                      >
                        {t('Delete')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {adding ? (
          <TaxonomyForm
            types={types.data ?? []}
            onDone={async () => {
              setAdding(false);
              await refresh();
            }}
          />
        ) : (
          <Button onClick={() => setAdding(true)}>{t('Add taxonomy')}</Button>
        )}
      </div>
    </Card>
  );
}

function TaxonomyForm({
  taxonomy,
  types,
  onDone,
}: {
  taxonomy?: TaxonomyView;
  types: ContentTypeView[];
  onDone: () => Promise<void>;
}) {
  const { t } = useT();
  const me = useMe();
  const locales = useNames();
  const [slug, setSlug] = useState(taxonomy?.slug ?? '');
  const [names, setNames] = useState<Record<string, string>>(taxonomy?.name ?? {});
  const [hierarchical, setHierarchical] = useState(taxonomy?.hierarchical ?? false);
  const [linked, setLinked] = useState<string[]>(taxonomy?.contentTypes ?? []);
  const save = useMutation({
    mutationFn: () => {
      const name = Object.fromEntries(Object.entries(names).filter(([, v]) => v.trim()));
      return taxonomy
        ? api('PATCH', `/taxonomies/${taxonomy.slug}`, { name, contentTypes: linked })
        : api('POST', '/taxonomies', { slug, name, hierarchical, contentTypes: linked });
    },
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-3 rounded border border-slate-200 p-3"
      aria-label={taxonomy ? t('Edit {name}', { name: taxonomy.slug }) : t('New taxonomy')}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!taxonomy && (
          <TextField
            label={t('Identifier')}
            hint={t('Also the start of its archive addresses, e.g. /genre/…')}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        )}
        {locales.map((locale) => (
          <TextField
            key={locale.code}
            label={t('Name ({language})', { language: locale.name })}
            value={names[locale.code] ?? ''}
            onChange={(e) => setNames({ ...names, [locale.code]: e.target.value })}
          />
        ))}
      </div>
      {!taxonomy && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hierarchical}
            onChange={(e) => setHierarchical(e.target.checked)}
          />
          {t('Hierarchical (terms can have a parent, like categories)')}
        </label>
      )}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 font-medium text-slate-800">{t('Used by')}</legend>
        {types.map((type) => (
          <label key={type.slug} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={linked.includes(type.slug)}
              onChange={(e) =>
                setLinked(
                  e.target.checked ? [...linked, type.slug] : linked.filter((s) => s !== type.slug),
                )
              }
            />
            {labelText(type.name, me.user.locale)}
          </label>
        ))}
      </fieldset>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || (!taxonomy && !slug.trim())}>
          {taxonomy ? t('Save') : t('Add taxonomy')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onDone()}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
