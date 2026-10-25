import {
  CONTENT_TYPE_FEATURES,
  labelText,
  type CoreSettings,
  type ContentTypeView,
  type FieldDefinition,
  type FieldGroupInput,
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
  comments: 'Comments',
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
      {me.capabilities.includes('manage_settings') && <AddressesCard />}
      {me.capabilities.includes('manage_content_types') && <ContentTypesCard />}
      {me.capabilities.includes('manage_taxonomies') && <TaxonomiesCard />}
      {me.capabilities.includes('manage_content_types') && <FieldGroupsCard />}
    </div>
  );
}

/** A new field group, as a starting point for the JSON editor. */
const NEW_GROUP: FieldGroupInput = {
  id: 'details',
  title: 'Details',
  fields: [{ name: 'subtitle', type: 'text', label: 'Subtitle' }],
  location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
  position: 'side',
};

/**
 * Field groups of the site (plugin API 1.47), shown in the editor where
 * their rules match: a list and a JSON editor, for administrators who know
 * the format (docs/PLUGINS.md). A visual builder comes with a plugin.
 */
function FieldGroupsCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['field-groups'],
    queryFn: () => api<FieldGroupInput[]>('GET', '/field-groups'),
  });
  const [editing, setEditing] = useState<{ id: string | null; json: string } | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['field-groups'] });
    void queryClient.invalidateQueries({ queryKey: ['field-screens'] });
    void queryClient.invalidateQueries({ queryKey: ['content-types'] });
  };
  const save = useMutation({
    mutationFn: (input: { id: string | null; json: string }) => {
      const group = JSON.parse(input.json) as FieldGroupInput;
      return input.id
        ? api<FieldGroupInput>('PUT', `/field-groups/${encodeURIComponent(input.id)}`, group)
        : api<FieldGroupInput>('POST', '/field-groups', group);
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/field-groups/${encodeURIComponent(id)}`),
    onSuccess: refresh,
  });
  const where = (group: FieldGroupInput) =>
    group.location
      .map((and) => and.map((r) => `${r.param} ${r.operator} ${r.value}`).join(' & '))
      .join(` ${t('or')} `);
  return (
    <Card id="field-groups" title={t('Field groups')}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">
          {t(
            'Extra fields shown in the editor where their rules match (a content type, a page template, a category…). Written in JSON, as described in the plugin guide.',
          )}
        </p>
        {(groups.error ?? remove.error) && (
          <Alert>{errorMessage(groups.error ?? remove.error)}</Alert>
        )}
        {groups.data && groups.data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {groups.data.map((group) => (
              <li
                key={group.id}
                aria-label={labelText(group.title, me.user.locale)}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <span className="font-medium">{labelText(group.title, me.user.locale)}</span>
                <code className="text-xs text-slate-500">{group.id}</code>
                <span className="text-xs text-slate-500">
                  {t('{count} fields', { count: group.fields.length })} · {where(group)}
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setEditing({ id: group.id, json: JSON.stringify(group, null, 2) })
                    }
                  >
                    {t('Edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm(t('Delete this field group? Values already saved stay.')))
                        remove.mutate(group.id);
                    }}
                  >
                    {t('Delete')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {editing ? (
          <form
            className="space-y-2"
            aria-label={t('Field group')}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            <label className="block space-y-1">
              <span className="block font-medium text-slate-800">{t('Definition (JSON)')}</span>
              <textarea
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                rows={16}
                spellCheck={false}
                value={editing.json}
                onChange={(e) => setEditing({ ...editing, json: e.target.value })}
              />
            </label>
            {save.error && <Alert>{errorMessage(save.error)}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                {t('Save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setEditing({ id: null, json: JSON.stringify(NEW_GROUP, null, 2) })}
          >
            {t('Add field group')}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * How every public address ends (RF-SET-03): with a slash, as WordPress's
 * (`/about/`), or without (`/about`). The other form redirects (301).
 */
function AddressesCard() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings', 'core'],
    queryFn: () => api<CoreSettings>('GET', '/settings/core'),
  });
  const save = useMutation({
    mutationFn: (trailingSlash: boolean) =>
      api<CoreSettings>('PATCH', '/settings/core', { trailingSlash }),
    onSuccess: (next) => queryClient.setQueryData(['settings', 'core'], next),
  });
  const enabled = settings.data?.trailingSlash ?? false;
  return (
    <Card id="addresses" title={t('Addresses')}>
      <div className="space-y-2 text-sm">
        {(settings.error ?? save.error) && (
          <Alert>{errorMessage(settings.error ?? save.error)}</Alert>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!settings.data || save.isPending}
            onChange={(e) => save.mutate(e.target.checked)}
          />
          <span>
            <span className="block font-medium text-slate-800">
              {t('End addresses with a slash')}
            </span>
            <span className="text-xs text-slate-500">
              {t(
                'Like WordPress: /about/ instead of /about. Turn it on for sites moved from WordPress, so the addresses search engines know stay the same. The other form redirects (301); files such as /sitemap.xml do not change.',
              )}
            </span>
          </span>
        </label>
      </div>
    </Card>
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
  // With a language plugin: what a translation does with the field (like WPML).
  const multilingual = useMe().site.locales.length > 1;
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
                  ...(field.translation ? { translation: field.translation } : {}),
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
          {multilingual && (
            <label className="space-y-1">
              <span className="block text-xs text-slate-600">{t('In other languages')}</span>
              <select
                className={selectClass}
                value={field.translation ?? 'translate'}
                onChange={(e) =>
                  update(index, {
                    translation: e.target.value as NonNullable<FieldDefinition['translation']>,
                  })
                }
              >
                <option value="translate">{t('Translated')}</option>
                <option value="copy">{t('Same as the original')}</option>
                <option value="ignore">{t('Left empty')}</option>
              </select>
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
                    <span className="font-mono text-xs text-slate-500">
                      {taxonomy.base === '' ? '/…' : `/${taxonomy.base ?? taxonomy.slug}/…`}
                    </span>
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
  // Archives' addresses: under the slug (default), without a base, or under another word.
  const [base, setBase] = useState<'slug' | 'none' | 'word'>(
    taxonomy?.base === '' ? 'none' : taxonomy?.base ? 'word' : 'slug',
  );
  const [word, setWord] = useState(taxonomy?.base ?? '');
  const ownAddresses = taxonomy && !taxonomy.source.startsWith('plugin:');
  const save = useMutation({
    mutationFn: () => {
      const name = Object.fromEntries(Object.entries(names).filter(([, v]) => v.trim()));
      const addresses = ownAddresses
        ? { base: base === 'slug' ? null : base === 'none' ? '' : word.trim() }
        : {};
      return taxonomy
        ? api('PATCH', `/taxonomies/${taxonomy.slug}`, { name, contentTypes: linked, ...addresses })
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
      {ownAddresses && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium text-slate-800">{t('Archive addresses')}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={base === 'slug'} onChange={() => setBase('slug')} />
            <span className="font-mono text-xs">/{taxonomy.slug}/news</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={base === 'none'} onChange={() => setBase('none')} />
            <span>
              <span className="font-mono text-xs">/news</span>{' '}
              <span className="text-xs text-slate-600">
                {t('without a base, as WordPress sites with the category base stripped')}
              </span>
            </span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" checked={base === 'word'} onChange={() => setBase('word')} />
            <span className="font-mono text-xs">/</span>
            <input
              type="text"
              className="w-40 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
              aria-label={t('Another word')}
              value={word}
              onFocus={() => setBase('word')}
              onChange={(e) => setWord(e.target.value.toLowerCase())}
            />
            <span className="font-mono text-xs">/news</span>
          </label>
          <p className="text-xs text-slate-600">
            {t(
              'The old addresses redirect to the new ones. Without a base, pages and posts with the same address come first.',
            )}
          </p>
        </fieldset>
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
