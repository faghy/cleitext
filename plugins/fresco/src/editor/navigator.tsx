/**
 * The Structure window: the page as a tree, floating over the canvas. Rows
 * select and outline their element, drag to move it (before, after or
 * inside a container), rename with a double click and hide in the editor
 * with the eye. It can be docked to the right edge (the canvas makes room)
 * and floated again; the choice is remembered.
 */
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import type { FrescoNode } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { Svg } from './controls.js';
import { pluginBlockTitle } from './plugin-blocks.js';
import { useStore, type Store } from './store.js';
import { find } from './tree.js';

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FRAME_KEY = 'fresco:navigator';

function loadFrame(): Frame {
  const fallback = {
    x: Math.max(320, window.innerWidth - 300),
    y: 90,
    width: 260,
    height: Math.round(window.innerHeight / 2),
  };
  try {
    const stored = JSON.parse(localStorage.getItem(FRAME_KEY) ?? 'null') as Frame | null;
    if (!stored) return fallback;
    // Back inside the window if it was resized since.
    return {
      ...stored,
      x: Math.min(Math.max(0, stored.x), window.innerWidth - 120),
      y: Math.min(Math.max(48, stored.y), window.innerHeight - 80),
    };
  } catch {
    return fallback;
  }
}

function titleOf(node: FrescoNode, locale: string, t: (s: string) => string): string {
  if (typeof node.attrs._title === 'string' && node.attrs._title) return node.attrs._title;
  const inner = node.type === 'fresco/block' ? node.children?.[0] : undefined;
  if (inner) return pluginBlockTitle(inner.type, locale);
  return t(getElement(node.type)?.title ?? node.type);
}

type Drop = { id: string; where: 'before' | 'after' | 'inside' };

export function NavigatorWindow({ store }: { store: Store }) {
  const { t } = useT();
  const open = useStore(store, (s) => s.navigator);
  const blocks = useStore(store, (s) => s.blocks);
  const selected = useStore(store, (s) => s.selected);
  const selection = useStore(store, (s) => s.selection);
  const docked = useStore(store, (s) => s.navigatorDocked);
  const hidden = useStore(store, (s) => s.hidden);
  const locale = useStore(store, (s) => s.entry.locale);
  const readOnly = useStore(store, (s) => s.readOnly || s.contentOnly);
  const [frame, setFrame] = useState<Frame>(loadFrame);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FRAME_KEY, JSON.stringify(frame));
    } catch {
      // Private mode: the place is not kept.
    }
  }, [frame]);

  // The selected element's branch is opened, and its row brought into view.
  useEffect(() => {
    if (!selected || !open) return;
    listRef.current
      ?.querySelector(`[data-nav-id="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  if (!open) return null;

  /**
   * Moves the window by its header (dropped on the right edge, it docks), or
   * resizes it by its corner; docked, its left edge sets the width.
   */
  const track = (event: React.PointerEvent, mode: 'move' | 'resize' | 'dock') => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, frame };
    const root = (event.currentTarget as HTMLElement).closest('.fre-root');
    // The canvas iframe would swallow the pointer while dragging.
    root?.classList.add('is-resizing-panel');
    let atEdge = false;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      atEdge = mode === 'move' && e.clientX >= window.innerWidth - 12;
      setFrame(
        mode === 'move'
          ? {
              ...start.frame,
              x: Math.min(Math.max(0, start.frame.x + dx), window.innerWidth - 120),
              y: Math.min(Math.max(48, start.frame.y + dy), window.innerHeight - 60),
            }
          : mode === 'dock'
            ? { ...start.frame, width: Math.min(520, Math.max(200, start.frame.width - dx)) }
            : {
                ...start.frame,
                width: Math.max(200, start.frame.width + dx),
                height: Math.max(180, start.frame.height + dy),
              },
      );
    };
    const onUp = () => {
      root?.classList.remove('is-resizing-panel');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (atEdge) {
        // Back where it was when floated again.
        setFrame(start.frame);
        store.actions.setNavigatorDocked(true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Drags a row: before, after or inside (containers) the row under the pointer. */
  const startRowDrag = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    // ⌘/Ctrl-click adds the element to the selection, or takes it out.
    if (event.metaKey || event.ctrlKey) {
      store.actions.toggleSelect(id);
      return;
    }
    if (readOnly) {
      store.actions.select(id);
      return;
    }
    const startY = event.clientY;
    let started = false;
    let target: Drop | null = null;
    const onMove = (e: PointerEvent) => {
      if (!started && Math.abs(e.clientY - startY) < 5) return;
      started = true;
      setDragging(id);
      const row = (
        document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      )?.closest<HTMLElement>('[data-nav-id]');
      const overId = row?.dataset.navId;
      if (!row || !overId || overId === id || find([find(blocks, id)!], overId)) {
        target = null;
      } else {
        const r = row.getBoundingClientRect();
        const ratio = (e.clientY - r.top) / r.height;
        const container = getElement(find(blocks, overId)?.type ?? '')?.container;
        target = {
          id: overId,
          where:
            container && ratio > 0.3 && ratio < 0.7 ? 'inside' : ratio < 0.5 ? 'before' : 'after',
        };
      }
      setDrop(target);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragging(null);
      setDrop(null);
      if (!started) {
        store.actions.select(id);
        return;
      }
      if (!target) return;
      const over = find(blocks, target.id);
      if (!over) return;
      if (target.where === 'inside') {
        store.actions.move(id, { parent: over.id, index: over.children?.length ?? 0 });
        return;
      }
      const parent = parentOf(blocks, over.id);
      const siblings = parent ? (parent.children ?? []) : blocks;
      const index =
        siblings.findIndex((n) => n.id === over.id) + (target.where === 'after' ? 1 : 0);
      store.actions.move(id, { parent: parent?.id ?? null, index });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const allOpen = Object.values(closed).every((c) => !c);
  const row = (node: FrescoNode, depth: number) => {
    const definition = getElement(node.type);
    const kids = node.type === 'fresco/block' ? [] : (node.children ?? []);
    const isClosed = closed[node.id] === true;
    const isHidden = hidden[node.id] === true;
    const dropHere = drop?.id === node.id ? drop.where : null;
    return (
      <li key={node.id}>
        <div
          data-nav-id={node.id}
          className={[
            'fre-navw__row',
            selected === node.id || selection.includes(node.id) ? 'is-on' : '',
            isHidden ? 'is-hidden' : '',
            dragging === node.id ? 'is-dragging' : '',
            dropHere ? `is-drop-${dropHere}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ paddingLeft: 6 + depth * 14 }}
          onMouseEnter={() => store.actions.hover(node.id)}
          onMouseLeave={() => store.actions.hover(null)}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className="fre-navw__caret"
              aria-label={isClosed ? t('Expand') : t('Collapse')}
              onClick={() => setClosed((c) => ({ ...c, [node.id]: !isClosed }))}
            >
              <Svg path={isClosed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} size={11} />
            </button>
          ) : (
            <span className="fre-navw__caret" />
          )}
          {definition && <Svg path={definition.icon} size={13} />}
          {renaming === node.id ? (
            <input
              className="fre-navw__rename"
              autoFocus
              defaultValue={titleOf(node, locale, t)}
              onBlur={(e) => {
                const value = e.target.value.trim();
                const fallback = t(getElement(node.type)?.title ?? node.type);
                store.actions.setSettings(node.id, {
                  _title: value && value !== fallback ? value : undefined,
                });
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span
              className="fre-navw__title"
              onPointerDown={(e) => startRowDrag(e, node.id)}
              onDoubleClick={() => !readOnly && setRenaming(node.id)}
              title={t('Click to edit, drag to move, double-click to rename')}
            >
              {titleOf(node, locale, t)}
            </span>
          )}
          <button
            type="button"
            className={`fre-navw__eye${isHidden ? ' is-on' : ''}`}
            title={isHidden ? t('Show in the editor') : t('Hide in the editor')}
            aria-label={isHidden ? t('Show in the editor') : t('Hide in the editor')}
            aria-pressed={isHidden}
            onClick={() => store.actions.toggleHidden(node.id)}
          >
            <Svg
              path={
                isHidden
                  ? 'M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4 M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6'
                  : 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
              }
              size={13}
            />
          </button>
        </div>
        {kids.length > 0 && !isClosed && <ul>{kids.map((child) => row(child, depth + 1))}</ul>}
      </li>
    );
  };

  const expandAll = () => {
    if (allOpen) {
      const next: Record<string, boolean> = {};
      const walk = (nodes: FrescoNode[]) =>
        nodes.forEach((n) => {
          if (n.children?.length) {
            next[n.id] = true;
            walk(n.children);
          }
        });
      walk(blocks);
      setClosed(next);
    } else setClosed({});
  };

  return (
    <div
      className={`fre-navw${docked ? ' fre-navw--docked' : ''}`}
      role={docked ? 'complementary' : 'dialog'}
      aria-label={t('Structure')}
      style={
        docked
          ? { width: frame.width, flexBasis: frame.width }
          : { left: frame.x, top: frame.y, width: frame.width, height: frame.height }
      }
    >
      {docked && (
        <div
          className="fre-navw__edge"
          onPointerDown={(e) => track(e, 'dock')}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Structure width')}
        />
      )}
      <div
        className="fre-navw__head"
        onPointerDown={(e) => !docked && track(e, 'move')}
        title={docked ? undefined : t('Drag to move; drop on the right edge to dock')}
      >
        <button
          type="button"
          className="fre-navw__btn"
          title={allOpen ? t('Collapse all') : t('Expand all')}
          aria-label={allOpen ? t('Collapse all') : t('Expand all')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={expandAll}
        >
          <Svg path={allOpen ? 'M7 15l5-5 5 5' : 'M7 9l5 5 5-5'} size={14} />
        </button>
        <span>{t('Structure')}</span>
        <button
          type="button"
          className={`fre-navw__btn${docked ? ' is-on' : ''}`}
          title={docked ? t('Undock') : t('Dock to the right')}
          aria-label={docked ? t('Undock') : t('Dock to the right')}
          aria-pressed={docked}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => store.actions.setNavigatorDocked(!docked)}
        >
          <Svg path={docked ? 'M4 4h16v16H4z M9 9h6v6H9z' : 'M4 4h16v16H4z M15 4v16'} size={14} />
        </button>
        <button
          type="button"
          className="fre-navw__btn"
          title={t('Close')}
          aria-label={t('Close')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => store.actions.toggleNavigator(false)}
        >
          <Svg path="M6 6l12 12 M18 6L6 18" size={14} />
        </button>
      </div>
      <div className="fre-navw__body" ref={listRef}>
        {blocks.length === 0 ? (
          <p className="fre-navw__empty">{t('The page is empty: add a container to start.')}</p>
        ) : (
          <ul>{blocks.map((node) => row(node, 0))}</ul>
        )}
      </div>
      {!docked && (
        <div
          className="fre-navw__foot"
          onPointerDown={(e) => track(e, 'resize')}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function parentOf(blocks: FrescoNode[], id: string): FrescoNode | null {
  for (const node of blocks) {
    if (node.children?.some((c) => c.id === id)) return node;
    const found = node.children ? parentOf(node.children, id) : null;
    if (found) return found;
  }
  return null;
}
