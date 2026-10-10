import type { EntryListResponse, MenuView, ThemeInfo } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, TextField } from '../components/ui';
import {
  canIndent,
  flatten,
  indent,
  moveDown,
  moveUp,
  newKey,
  outdent,
  remove,
  toTree,
  type FlatItem,
} from '../menu-tree';

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';

/** Appearance → Menus (RF-NAV-01/02/03). Themes come with the plugin system. */
export function AppearancePage() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState(me.site.defaultLocale);
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const theme = useQuery({
    queryKey: ['theme'],
    queryFn: () => api<ThemeInfo>('GET', '/themes/current'),
  });
  const menus = useQuery({
    queryKey: ['menus', locale],
    queryFn: () => api<MenuView[]>('GET', `/menus?locale=${encodeURIComponent(locale)}`),
  });
  const current = menus.data?.find((m) => m.id === selected) ?? menus.data?.[0] ?? null;

  const create = useMutation({
    mutationFn: () => api<MenuView>('POST', '/menus', { name: newName, locale }),
    onSuccess: (menu) => {
      setNewName('');
      // Show the new menu right away, not the first one until the list reloads.
      queryClient.setQueryData<MenuView[]>(['menus', locale], (list) => [...(list ?? []), menu]);
      setSelected(menu.id);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('Menus')}</h1>
          {theme.data && (
            <p className="text-sm text-slate-600">
              {t('Theme: {name} {version}', {
                name: theme.data.name,
                version: theme.data.version,
              })}
            </p>
          )}
        </div>
        {me.site.locales.length > 1 && (
          <label className="text-sm">
            <span className="mr-2 font-medium">{t('Language')}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value);
                setSelected(null);
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

      {menus.error && <Alert>{errorMessage(menus.error)}</Alert>}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          {menus.data && menus.data.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t('Menu to edit')}</span>
              <select
                className={selectClass}
                value={current?.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {menus.data.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.location && theme.data
                      ? ` (${theme.data.menuLocations[m.location] ?? m.location})`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) create.mutate();
            }}
          >
            <TextField
              label={t('New menu')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={create.isPending || !newName.trim()}
            >
              {t('Create')}
            </Button>
          </form>
        </div>
        {create.error && (
          <div className="mt-3">
            <Alert>{errorMessage(create.error)}</Alert>
          </div>
        )}
      </Card>

      {current && theme.data && (
        <MenuEditor
          key={current.id}
          menu={current}
          theme={theme.data}
          onDeleted={() => setSelected(null)}
        />
      )}
      {menus.data?.length === 0 && (
        <p className="text-sm text-slate-600">
          {t('No menus in this language yet: create the first one.')}
        </p>
      )}
    </div>
  );
}

function MenuEditor({
  menu,
  theme,
  onDeleted,
}: {
  menu: MenuView;
  theme: ThemeInfo;
  onDeleted: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState(menu.name);
  const [location, setLocation] = useState(menu.location ?? '');
  const [items, setItems] = useState<FlatItem[]>(() => flatten(menu.items));
  const [saved, setSaved] = useState(false);

  useEffect(() => setSaved(false), [items, name, location]);

  const save = useMutation({
    mutationFn: async () => {
      await api<MenuView>('PATCH', `/menus/${menu.id}`, { name, location: location || null });
      return api<MenuView>('PUT', `/menus/${menu.id}/items`, { items: toTree(items) });
    },
    onSuccess: async (view) => {
      setItems(flatten(view.items));
      await queryClient.invalidateQueries({ queryKey: ['menus', menu.locale] });
      setSaved(true);
    },
  });
  const destroy = useMutation({
    mutationFn: () => api<void>('DELETE', `/menus/${menu.id}`),
    onSuccess: async () => {
      onDeleted();
      await queryClient.invalidateQueries({ queryKey: ['menus', menu.locale] });
    },
  });

  const update = (index: number, changes: Partial<FlatItem>) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...changes } : item)));

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <AddItems locale={menu.locale} onAdd={(item) => setItems((list) => [...list, item])} />

      <Card title={t('Menu structure')}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('Menu name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="block space-y-1 text-sm">
            <span className="block font-medium text-slate-800">{t('Display location')}</span>
            <select
              className={selectClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">{t('None')}</option>
              {Object.entries(theme.menuLocations).map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-600">{t('Add items from the column on the left.')}</p>
        ) : (
          <ol className="space-y-2" aria-label={t('Menu items')}>
            {items.map((item, index) => (
              <li
                key={item.key}
                style={{ marginLeft: `${item.depth * 1.5}rem` }}
                className="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase text-slate-500">
                    {t(KIND_LABELS[item.kind])}
                  </span>
                  <label className="sr-only" htmlFor={`label-${item.key}`}>
                    {t('Navigation label')}
                  </label>
                  <input
                    id={`label-${item.key}`}
                    className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    value={item.label ?? ''}
                    placeholder={item.title}
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                  <TreeButton label={t('Move up')} onClick={() => setItems(moveUp(items, index))}>
                    ↑
                  </TreeButton>
                  <TreeButton
                    label={t('Move down')}
                    onClick={() => setItems(moveDown(items, index))}
                  >
                    ↓
                  </TreeButton>
                  <TreeButton
                    label={t('Make sub-item')}
                    disabled={!canIndent(items, index)}
                    onClick={() => setItems(indent(items, index))}
                  >
                    →
                  </TreeButton>
                  <TreeButton
                    label={t('Move out of sub-items')}
                    disabled={item.depth === 0}
                    onClick={() => setItems(outdent(items, index))}
                  >
                    ←
                  </TreeButton>
                  <TreeButton label={t('Remove')} onClick={() => setItems(remove(items, index))}>
                    ✕
                  </TreeButton>
                </div>
                {item.kind === 'url' && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex flex-1 items-center gap-2">
                      <span>{t('URL')}</span>
                      <input
                        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1"
                        value={item.url ?? ''}
                        onChange={(e) => update(index, { url: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={item.target === '_blank'}
                        onChange={(e) =>
                          update(index, { target: e.target.checked ? '_blank' : null })
                        }
                      />
                      {t('Open in a new tab')}
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 space-y-3">
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          {destroy.error && <Alert>{errorMessage(destroy.error)}</Alert>}
          {saved && <Alert kind="success">{t('Menu saved.')}</Alert>}
          <div className="flex justify-between gap-3">
            <Button
              variant="danger"
              disabled={destroy.isPending}
              onClick={() => {
                if (window.confirm(t('Delete the menu "{name}"?', { name: menu.name })))
                  destroy.mutate();
              }}
            >
              {t('Delete menu')}
            </Button>
            <Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
              {t('Save menu')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

const KIND_LABELS: Record<FlatItem['kind'], string> = {
  entry: 'Content',
  term: 'Category',
  url: 'Link',
  custom: 'Text',
};

function TreeButton({
  label,
  children,
  ...props
}: {
  label: string;
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="h-7 w-7 rounded border border-slate-300 bg-white text-sm hover:bg-slate-100 disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

function AddItems({ locale, onAdd }: { locale: string; onAdd: (item: FlatItem) => void }) {
  const { t } = useT();
  const [url, setUrl] = useState('https://');
  const [label, setLabel] = useState('');

  const linkItem = (kind: FlatItem['kind'], fields: Partial<FlatItem>): FlatItem => ({
    key: newKey(),
    depth: 0,
    kind,
    entryId: null,
    termId: null,
    url: null,
    label: null,
    target: null,
    title: '',
    ...fields,
  });

  return (
    <div className="space-y-4">
      <EntryPicker type="page" title={t('Pages')} locale={locale} onAdd={onAdd} make={linkItem} />
      <EntryPicker
        type="article"
        title={t('Posts')}
        locale={locale}
        onAdd={onAdd}
        make={linkItem}
      />
      <Card title={t('Custom link')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(linkItem('url', { url: url.trim(), label: label.trim(), title: label.trim() }));
            setUrl('https://');
            setLabel('');
          }}
        >
          <TextField label={t('URL')} value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField
            label={t('Link text')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!label.trim() || url.trim().length < 2}
          >
            {t('Add to menu')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function EntryPicker({
  type,
  title,
  locale,
  onAdd,
  make,
}: {
  type: string;
  title: string;
  locale: string;
  onAdd: (item: FlatItem) => void;
  make: (kind: FlatItem['kind'], fields: Partial<FlatItem>) => FlatItem;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const entries = useQuery({
    queryKey: ['menu-picker', type, locale, q],
    queryFn: () =>
      api<EntryListResponse>(
        'GET',
        `/entries?type=${type}&status=published&locale=${encodeURIComponent(locale)}&limit=20${
          q ? `&q=${encodeURIComponent(q)}` : ''
        }`,
      ),
  });
  return (
    <Card title={title}>
      <label className="sr-only" htmlFor={`search-${type}`}>
        {t('Search {title}', { title: title.toLowerCase() })}
      </label>
      <input
        id={`search-${type}`}
        type="search"
        placeholder={t('Search')}
        className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {entries.error && <Alert>{errorMessage(entries.error)}</Alert>}
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {entries.data?.items.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-2">
            <span className="truncate">{entry.title}</span>
            <button
              type="button"
              className="shrink-0 text-sky-700 hover:underline"
              aria-label={t('Add {title} to the menu', { title: entry.title })}
              onClick={() => onAdd(make('entry', { entryId: entry.id, title: entry.title }))}
            >
              {t('Add')}
            </button>
          </li>
        ))}
        {entries.data?.items.length === 0 && (
          <li className="text-slate-500">{t('Nothing published.')}</li>
        )}
      </ul>
    </Card>
  );
}
