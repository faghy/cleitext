import type { AdminSearchResult, EntryView } from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useMe } from '../auth';
import { visibleSections } from '../navigation';
import { usePluginMenu } from '../plugins';
import { useT } from './ui';

interface Command {
  id: string;
  label: string;
  group: string;
  run: () => void | Promise<void>;
}

/**
 * Command palette (RF-ADM-05): Ctrl/Cmd+K, then type to go anywhere in the
 * admin, run a quick action or open content found by the global search.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const me = useMe();
  const navigate = useNavigate();
  const plugins = usePluginMenu();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api<AdminSearchResult>('GET', `/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2,
  });

  const go = (to: string) => {
    onClose();
    void navigate({ to });
  };
  const create = (type: string) => async () => {
    onClose();
    const entry = await api<EntryView>('POST', '/entries', { type, title: '' });
    await navigate({ to: '/entries/$id', params: { id: entry.id } });
  };

  const commands = useMemo(() => {
    const list: Command[] = [];
    const navigation = t('Go to');
    for (const section of visibleSections(me.capabilities)) {
      list.push({
        id: `nav:${section.to}`,
        label: t(section.label),
        group: navigation,
        run: () => go(section.to),
      });
    }
    for (const item of [...plugins.types, ...plugins.pages]) {
      list.push({
        id: `nav:${item.to}`,
        label: item.label,
        group: navigation,
        run: () => go(item.to),
      });
    }
    if (me.capabilities.includes('edit_entries')) {
      const actions = t('Actions');
      list.push({
        id: 'new:article',
        label: t('New post'),
        group: actions,
        run: create('article'),
      });
      list.push({ id: 'new:page', label: t('New page'), group: actions, run: create('page') });
    }
    return list;
    // `go` and `create` only close over stable values.
  }, [me.capabilities, plugins.types, plugins.pages, t]);

  const needle = query.trim().toLowerCase();
  const results: Command[] = [
    ...commands.filter((command) => !needle || command.label.toLowerCase().includes(needle)),
    ...(search.data && debounced.length >= 2
      ? [
          ...search.data.entries.map((entry) => ({
            id: `entry:${entry.id}`,
            label: entry.title || t('(no title)'),
            group: t('Content'),
            run: () => {
              onClose();
              void navigate({ to: '/entries/$id', params: { id: entry.id } });
            },
          })),
          ...search.data.media.map((item) => ({
            id: `media:${item.id}`,
            label: item.filename,
            group: t('Media'),
            run: () => go('/media'),
          })),
          ...search.data.terms.map((term) => ({
            id: `term:${term.id}`,
            label: term.name,
            group: t('Categories and tags'),
            run: () => go(`/taxonomies/${term.taxonomy}`),
          })),
          ...search.data.users.map((user) => ({
            id: `user:${user.id}`,
            label: `${user.displayName} · ${user.email}`,
            group: t('Users'),
            run: () => go('/users'),
          })),
        ]
      : []),
  ];
  const current = Math.min(active, Math.max(results.length - 1, 0));

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Command palette')}
        className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[current] ? `palette-${current}` : undefined}
          aria-label={t('Search or type a command')}
          placeholder={t('Search or type a command…')}
          className="w-full border-b border-slate-200 px-4 py-3 text-base outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              void results[current]?.run();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <ul
          id="palette-results"
          role="listbox"
          className="max-h-[50vh] overflow-y-auto py-1 text-sm"
        >
          {results.length === 0 && (
            <li className="px-4 py-3 text-slate-500">
              {search.isFetching ? t('Searching…') : t('Nothing found.')}
            </li>
          )}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`palette-${index}`}
              role="option"
              aria-selected={index === current}
              className={`flex cursor-pointer justify-between gap-3 px-4 py-2 ${index === current ? 'bg-sky-700 text-white' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => void command.run()}
            >
              <span className="truncate">{command.label}</span>
              <span
                className={`shrink-0 text-xs ${index === current ? 'text-sky-100' : 'text-slate-500'}`}
              >
                {command.group}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Ctrl/Cmd+K anywhere in the admin. */
export function useCommandPaletteShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
