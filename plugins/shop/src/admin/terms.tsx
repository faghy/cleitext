import {
  Alert,
  errorMessage,
  FieldsForm,
  useT,
  type AdminPageProps,
  type FieldDefinition,
  type FieldValues,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { core, productCount, termTree, type Term } from './shared';
import { CSS } from './styles';

interface TermRow extends Term {
  count: number;
}

const CATEGORY_FIELDS: FieldDefinition[] = [
  { name: 'image', type: 'media', label: { en: 'Image', it: 'Immagine' } },
];
const BRAND_FIELDS: FieldDefinition[] = [
  { name: 'logo', type: 'media', label: { en: 'Logo', it: 'Logo' } },
  { name: 'website', type: 'url', label: { en: 'Website', it: 'Sito web' } },
];

export function CategoriesPage(props: AdminPageProps) {
  const { t } = useT();
  return (
    <TermsManager
      {...props}
      taxonomy="product-category"
      hierarchical
      title={t('Product categories')}
      fields={CATEGORY_FIELDS}
    />
  );
}

export function BrandsPage(props: AdminPageProps) {
  const { t } = useT();
  return (
    <TermsManager
      {...props}
      taxonomy="brand"
      hierarchical={false}
      title={t('Brands')}
      fields={BRAND_FIELDS}
    />
  );
}

type Drop = { id: string; where: 'before' | 'inside' | 'after' };

/**
 * Categories as a real tree (Cleito's, improved): drag a category onto
 * another to put it inside, above or below; arrows to do it with the
 * keyboard; product counts; image and description in place.
 */
function TermsManager({
  site,
  taxonomy,
  hierarchical,
  title,
  fields,
}: AdminPageProps & {
  taxonomy: string;
  hierarchical: boolean;
  title: string;
  fields: FieldDefinition[];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState(site.defaultLocale);
  const key = ['shop', 'terms', taxonomy, locale];
  const terms = useQuery({
    queryKey: key,
    queryFn: () => core<TermRow[]>('GET', `/taxonomies/${taxonomy}/terms?locale=${locale}`),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['shop', 'terms', taxonomy] });
    await queryClient.invalidateQueries({ queryKey: ['shop', 'setup'] });
  };

  const add = useMutation({
    mutationFn: () =>
      core('POST', `/taxonomies/${taxonomy}/terms`, {
        name: name.trim(),
        locale,
        ...(parent ? { parentId: parent } : {}),
        position: (terms.data ?? []).filter((x) => (x.parentId ?? '') === parent).length,
      }),
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });

  /** Puts a term inside another, or before/after it, renumbering its new siblings. */
  const move = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: Drop }) => {
      const all = terms.data ?? [];
      const moving = all.find((x) => x.id === id)!;
      const over = all.find((x) => x.id === target.id)!;
      const parentId = target.where === 'inside' ? over.id : over.parentId;
      const siblings = termTree(all)
        .map((r) => r.term)
        .filter((x) => x.parentId === parentId && x.id !== id);
      const at =
        target.where === 'inside'
          ? siblings.length
          : siblings.findIndex((x) => x.id === over.id) + (target.where === 'after' ? 1 : 0);
      siblings.splice(at, 0, moving);
      for (const [position, term] of siblings.entries()) {
        const changes: Record<string, unknown> = {};
        if (term.position !== position) changes.position = position;
        if (term.id === id && term.parentId !== parentId) changes.parentId = parentId;
        if (Object.keys(changes).length > 0) await core('PATCH', `/terms/${term.id}`, changes);
      }
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => core('DELETE', `/terms/${id}`),
    onSuccess: refresh,
  });

  const rows = hierarchical
    ? termTree(terms.data ?? [])
    : (terms.data ?? []).map((term) => ({ term, depth: 0 }));
  const byId = new Map((terms.data ?? []).map((x) => [x.id, x]));
  /** A term cannot go inside itself or its descendants. */
  const inside = (id: string, ancestor: string) => {
    let cursor = byId.get(id);
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor.id === ancestor) return true;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return false;
  };
  const siblingsOf = (term: Term) =>
    rows.map((r) => r.term).filter((x) => x.parentId === term.parentId);

  return (
    <div className="sh sh-stack">
      <style>{CSS}</style>
      <div className="sh-row sh-between">
        <h1>{title}</h1>
        {site.locales.length > 1 && (
          <select
            aria-label={t('Language')}
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            {site.locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <form
        className="sh-card sh-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate();
        }}
      >
        <input
          type="text"
          aria-label={t('Name')}
          placeholder={t('Name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {hierarchical && (
          <select
            aria-label={t('Parent')}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">{t('At the top')}</option>
            {rows.map(({ term, depth }) => (
              <option key={term.id} value={term.id}>
                {'— '.repeat(depth)}
                {term.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="sh-btn sh-btn-primary"
          disabled={!name.trim() || add.isPending}
        >
          {t('Add')}
        </button>
        {add.error && <span className="sh-error">{errorMessage(add.error)}</span>}
      </form>

      {(move.error || remove.error) && <Alert>{errorMessage(move.error ?? remove.error)}</Alert>}
      {hierarchical && rows.length > 1 && (
        <p className="sh-small sh-muted">
          {t(
            'Drag a category onto another to put it inside; near its top or bottom edge to put it before or after.',
          )}
        </p>
      )}

      <ul className="sh-tree sh-card" style={{ padding: 0, margin: 0 }} aria-busy={move.isPending}>
        {terms.isPending && (
          <li className="sh-muted" style={{ padding: '1rem' }}>
            {t('Loading…')}
          </li>
        )}
        {terms.data?.length === 0 && (
          <li className="sh-muted" style={{ padding: '1rem' }}>
            {t('Nothing here yet.')}
          </li>
        )}
        {rows.map(({ term, depth }) => {
          const image = (term.fields.image ?? term.fields.logo) as string | undefined;
          const siblings = siblingsOf(term);
          const index = siblings.findIndex((x) => x.id === term.id);
          const dropClass = drop?.id === term.id ? ` drop-${drop.where}` : '';
          return (
            <li key={term.id}>
              <div
                className={`sh-tree-row${dropClass}`}
                style={{ paddingLeft: `${0.5 + depth * 1.5}rem` }}
                draggable
                onDragStart={(e) => {
                  setDragging(term.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!dragging || dragging === term.id || inside(term.id, dragging)) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  const y = (e.clientY - box.top) / box.height;
                  const where = !hierarchical
                    ? y < 0.5
                      ? 'before'
                      : 'after'
                    : y < 0.25
                      ? 'before'
                      : y > 0.75
                        ? 'after'
                        : 'inside';
                  if (drop?.id !== term.id || drop.where !== where) setDrop({ id: term.id, where });
                }}
                onDragLeave={() => setDrop(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && drop) move.mutate({ id: dragging, target: drop });
                  setDragging(null);
                  setDrop(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDrop(null);
                }}
              >
                <span aria-hidden="true" className="sh-muted">
                  ⠿
                </span>
                {image ? <TermImage id={image} /> : null}
                <strong style={{ flex: 1 }}>{term.name}</strong>
                <span className="sh-muted sh-small">{productCount(t, term.count)}</span>
                <button
                  type="button"
                  className="sh-btn"
                  aria-label={t('Move {name} up', { name: term.name })}
                  disabled={index <= 0 || move.isPending}
                  onClick={() =>
                    move.mutate({
                      id: term.id,
                      target: { id: siblings[index - 1]!.id, where: 'before' },
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="sh-btn"
                  aria-label={t('Move {name} down', { name: term.name })}
                  disabled={index >= siblings.length - 1 || move.isPending}
                  onClick={() =>
                    move.mutate({
                      id: term.id,
                      target: { id: siblings[index + 1]!.id, where: 'after' },
                    })
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="sh-btn"
                  onClick={() => setEditing(editing === term.id ? null : term.id)}
                >
                  {t('Edit')}
                </button>
                <button
                  type="button"
                  className="sh-btn sh-btn-danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        t('Delete "{name}"? Its products stay, without it.', { name: term.name }),
                      )
                    )
                      remove.mutate(term.id);
                  }}
                >
                  {t('Delete')}
                </button>
              </div>
              {editing === term.id && (
                <TermEditor
                  term={term}
                  terms={rows}
                  hierarchical={hierarchical}
                  fields={fields}
                  locale={locale}
                  onDone={async () => {
                    setEditing(null);
                    await refresh();
                  }}
                  inside={inside}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TermImage({ id }: { id: string }) {
  const media = useQuery({
    queryKey: ['shop', 'media', id],
    queryFn: () => core<{ url: string }>('GET', `/media/${id}`),
    staleTime: Infinity,
  });
  return media.data ? <img src={media.data.url} alt="" /> : null;
}

function TermEditor({
  term,
  terms,
  hierarchical,
  fields,
  locale,
  onDone,
  inside,
}: {
  term: TermRow;
  terms: { term: Term; depth: number }[];
  hierarchical: boolean;
  fields: FieldDefinition[];
  locale: string;
  onDone: () => void;
  inside: (id: string, ancestor: string) => boolean;
}) {
  const { t } = useT();
  const [name, setName] = useState(term.name);
  const [slug, setSlug] = useState(term.slug);
  const [description, setDescription] = useState(term.description ?? '');
  const [parentId, setParentId] = useState(term.parentId ?? '');
  const [values, setValues] = useState<FieldValues>(term.fields as FieldValues);
  const save = useMutation({
    mutationFn: () =>
      core('PATCH', `/terms/${term.id}`, {
        name,
        slug,
        description,
        fields: values,
        ...(hierarchical ? { parentId: parentId || null } : {}),
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="sh-card sh-stack"
      style={{ margin: '.5rem', borderStyle: 'dashed' }}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="sh-grid-2">
        <label className="sh-field">
          <span>{t('Name')}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="sh-field">
          <span>{t('Slug')}</span>
          <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        {hierarchical && (
          <label className="sh-field">
            <span>{t('Parent')}</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('At the top')}</option>
              {terms
                .filter(({ term: other }) => !inside(other.id, term.id))
                .map(({ term: other, depth }) => (
                  <option key={other.id} value={other.id}>
                    {'— '.repeat(depth)}
                    {other.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <label className="sh-field">
        <span>{t('Description')}</span>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <FieldsForm fields={fields} values={values} locale={locale} onChange={setValues} />
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="sh-row">
        <button
          type="submit"
          className="sh-btn sh-btn-primary"
          disabled={save.isPending || !name.trim()}
        >
          {t('Save')}
        </button>
        <button type="button" className="sh-btn" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
