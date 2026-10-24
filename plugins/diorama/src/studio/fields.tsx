/** Editors of the slider's own kinds of values: links, the 3×3 anchor, the focal point. */
import { api, useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import type { Anchor, Link, LinkKind } from '../model/types';
import { Field } from './ui';

const KINDS: { value: LinkKind; label: string }[] = [
  { value: 'none', label: 'No link' },
  { value: 'page', label: 'A page of the site' },
  { value: 'url', label: 'An address' },
  { value: 'phone', label: 'A phone call' },
  { value: 'email', label: 'An email' },
  { value: 'scroll', label: 'Scroll down the page' },
  { value: 'post', label: 'The post of the slide' },
];

export function LinkEditor({
  value,
  onChange,
  posts,
  label,
}: {
  value: Link;
  onChange: (link: Link) => void;
  /** The slider shows the latest posts: "the post of the slide" is offered. */
  posts: boolean;
  label?: string;
}) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; title: string; slug: string; type: string }[]>(
    [],
  );
  useEffect(() => {
    if (value.kind !== 'page') return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: '12', status: 'published', sort: 'title' });
      if (search.trim()) params.set('q', search.trim());
      Promise.all(
        ['page', 'article'].map((type) =>
          api<{ items: { id: string; title: string; slug: string; type: string }[] }>(
            'GET',
            `/entries?${params}&type=${type}`,
          ).catch(() => ({ items: [] })),
        ),
      ).then(([pages, posts]) => setFound([...pages!.items, ...posts!.items].slice(0, 16)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value.kind, search]);

  return (
    <div>
      <Field label={label ?? t('Link')}>
        <select
          className="dst-select"
          value={value.kind}
          onChange={(e) => onChange({ kind: e.target.value as LinkKind, value: '' })}
        >
          {KINDS.filter((k) => posts || k.value !== 'post').map((k) => (
            <option key={k.value} value={k.value}>
              {t(k.label)}
            </option>
          ))}
        </select>
      </Field>
      {value.kind === 'page' && (
        <div className="dst-field">
          <input
            className="dst-input"
            type="search"
            placeholder={t('Search pages and posts')}
            aria-label={t('Search pages and posts')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="dst-select"
            aria-label={t('Page')}
            value={value.entryId ?? ''}
            onChange={(e) => {
              const entry = found.find((f) => f.id === e.target.value);
              onChange({ ...value, entryId: e.target.value, value: entry ? `/${entry.slug}` : '' });
            }}
          >
            <option value="">{t('Choose…')}</option>
            {value.entryId && !found.some((f) => f.id === value.entryId) && (
              <option value={value.entryId}>{value.value || t('The chosen page')}</option>
            )}
            {found.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title || f.slug}
              </option>
            ))}
          </select>
        </div>
      )}
      {(value.kind === 'url' ||
        value.kind === 'phone' ||
        value.kind === 'email' ||
        value.kind === 'scroll') && (
        <Field
          label={
            value.kind === 'url'
              ? t('Address')
              : value.kind === 'phone'
                ? t('Phone number')
                : value.kind === 'email'
                  ? t('Email address')
                  : t('Section of the page')
          }
          help={
            value.kind === 'scroll'
              ? t('An anchor such as #contacts; empty: just below the slider.')
              : undefined
          }
        >
          <input
            className="dst-input"
            value={value.value}
            placeholder={
              value.kind === 'url'
                ? 'https://… / /contacts'
                : value.kind === 'phone'
                  ? '+39 …'
                  : value.kind === 'email'
                    ? 'info@…'
                    : '#contacts'
            }
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        </Field>
      )}
      {(value.kind === 'url' || value.kind === 'page' || value.kind === 'post') && (
        <label className="dst-toggle">
          <span>{t('Open in a new tab')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(value.newTab)}
            onChange={(e) => onChange({ ...value, newTab: e.target.checked })}
          />
          <span className="dst-switch" aria-hidden="true" />
        </label>
      )}
    </div>
  );
}

const GRID: Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
const NAMES: Record<Anchor, string> = {
  tl: 'Top left',
  t: 'Top',
  tr: 'Top right',
  l: 'Left',
  c: 'Centre',
  r: 'Right',
  bl: 'Bottom left',
  b: 'Bottom',
  br: 'Bottom right',
};

/** Nine buttons in a square: where a layer (or a box) sits. */
export function AnchorGrid({
  value,
  onChange,
  label,
}: {
  value: Anchor;
  onChange: (anchor: Anchor) => void;
  label: string;
}) {
  const { t } = useT();
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 3 }}
    >
      {GRID.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={a === value}
          aria-label={t(NAMES[a])}
          title={t(NAMES[a])}
          onClick={() => onChange(a)}
          style={{
            width: 28,
            height: 22,
            borderRadius: 4,
            border: '1px solid #cbd5e1',
            background: a === value ? '#4f46e5' : '#fff',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

/** A click on the picture chooses the point that stays in view when it is cropped. */
export function FocalPicker({
  url,
  value,
  onChange,
}: {
  url: string;
  value: { x: number; y: number } | null;
  onChange: (value: { x: number; y: number } | null) => void;
}) {
  const { t } = useT();
  const point = value ?? { x: 50, y: 50 };
  return (
    <div className="dst-field">
      <span className="dst-label">{t('Point kept in view')}</span>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('Point kept in view: {x}% from the left, {y}% from the top', {
          x: Math.round(point.x),
          y: Math.round(point.y),
        })}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onChange({
            x: Math.round(((e.clientX - r.left) / r.width) * 100),
            y: Math.round(((e.clientY - r.top) / r.height) * 100),
          });
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const d = move[e.key];
          if (!d) return;
          e.preventDefault();
          onChange({
            x: Math.min(100, Math.max(0, point.x + d[0])),
            y: Math.min(100, Math.max(0, point.y + d[1])),
          });
        }}
        style={{
          position: 'relative',
          cursor: 'crosshair',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
      >
        <img
          src={url}
          alt=""
          style={{
            display: 'block',
            width: '100%',
            maxHeight: 180,
            objectFit: 'contain',
            background: '#0f172a',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${point.x}%`,
            top: `${point.y}%`,
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: '50%',
            border: '3px solid #fff',
            boxShadow: '0 0 0 2px #4f46e5, 0 2px 6px rgba(0,0,0,.4)',
          }}
        />
      </div>
      <span className="dst-help">
        {t('Click the picture where its subject is: phones and narrow screens keep it in view.')}{' '}
        {value && (
          <button type="button" className="dst-reset" onClick={() => onChange(null)}>
            {t('Use the library’s')}
          </button>
        )}
      </span>
    </div>
  );
}
