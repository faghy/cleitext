/** The side panel: elements, the selected element's settings, navigator, page and site settings. */
import type { EditorMedia } from '@cleitext/admin-sdk';
import { useMemo, useState } from 'react';
import { conditionMet, withDefaults } from '../core/css.js';
import {
  DEFAULT_KIT,
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  type Kit,
  type KitColor,
  type KitFont,
} from '../core/kit.js';
import type { Control, ElementCategory, FrescoNode, Settings, Tab } from '../core/model.js';
import { getElement, listElements } from '../core/registry.js';
import { ColorPicker, ControlField, Svg, type ControlEnv } from './controls.js';
import { useStore, type Store } from './store.js';
import { find, pathTo } from './tree.js';

const CATEGORIES: { id: ElementCategory; title: string }[] = [
  { id: 'layout', title: 'Layout' },
  { id: 'basic', title: 'Basic' },
  { id: 'general', title: 'General' },
  { id: 'media', title: 'Media' },
  { id: 'site', title: 'Site' },
  { id: 'pro', title: 'Pro' },
  { id: 'atomic', title: 'Atomic' },
];

export interface PanelProps {
  store: Store;
  media: {
    upload: (file: File) => Promise<EditorMedia>;
    list: (query: { kind?: 'image'; search?: string }) => Promise<EditorMedia[]>;
  };
  onDragStart: (event: React.PointerEvent, type: string, label: string) => void;
  canManageKit: boolean;
  onSaveKit: () => Promise<void>;
}

export function Panel(props: PanelProps) {
  const view = useStore(props.store, (s) => s.view);
  return (
    <div className="fre-panel__body">
      {view === 'elements' && <ElementsView {...props} />}
      {view === 'element' && <ElementView {...props} />}
      {view === 'navigator' && <Navigator store={props.store} />}
      {view === 'page' && <PageView store={props.store} />}
      {view === 'site' && <SiteView {...props} />}
    </div>
  );
}

// ---- Elements ----------------------------------------------------------------------------

function ElementsView({ store, onDragStart }: PanelProps) {
  const [search, setSearch] = useState('');
  const elements = listElements();
  const q = search.trim().toLowerCase();
  const matches = (title: string, keywords: string[] = []) =>
    !q || title.toLowerCase().includes(q) || keywords.some((k) => k.includes(q));
  const addAtEnd = (type: string) => {
    const state = store.get();
    // After the selected element, or at the end of the page.
    const selected = state.selected ? find(state.blocks, state.selected) : null;
    if (selected && getElement(selected.type)?.container) {
      store.actions.add(type, { parent: selected.id, index: selected.children?.length ?? 0 });
    } else {
      store.actions.add(type, { parent: null, index: state.blocks.length });
    }
  };
  return (
    <div className="fre-elements">
      <input
        className="fre-input fre-search"
        placeholder="Search elements"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {CATEGORIES.map((category) => {
        const list = elements.filter(
          (e) => e.category === category.id && matches(e.title, e.keywords),
        );
        if (list.length === 0) return null;
        return (
          <section key={category.id} className="fre-category">
            <h3>{category.title}</h3>
            <div className="fre-tiles">
              {list.map((element) => (
                <button
                  key={element.type}
                  type="button"
                  className="fre-tile"
                  title={`${element.title}: drag it onto the page, or click to add it`}
                  onPointerDown={(e) => onDragStart(e, element.type, element.title)}
                  onClick={() => addAtEnd(element.type)}
                >
                  <Svg path={element.icon} size={26} />
                  <span>{element.title}</span>
                  {element.pro && <em className="fre-pro">Pro</em>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---- Element settings -----------------------------------------------------------------------

function ElementView({ store, media }: PanelProps) {
  const selected = useStore(store, (s) => s.selected);
  const blocks = useStore(store, (s) => s.blocks);
  const tab = useStore(store, (s) => s.tab);
  const device = useStore(store, (s) => s.device);
  const kit = useStore(store, (s) => s.kit);
  const readOnly = useStore(store, (s) => s.readOnly);
  const [hover, setHover] = useState<Record<string, boolean>>({});
  const [openSection, setOpenSection] = useState<Record<string, string | null>>({});
  const node = selected ? find(blocks, selected) : null;
  const definition = node ? getElement(node.type) : null;
  if (!node || !definition) {
    return <p className="fre-empty-note">Select an element on the page to edit it.</p>;
  }
  const settings = withDefaults(definition, node.attrs);
  const controls = definition.controls.filter((c) => c.tab === tab && conditionMet(c, settings));
  const sections = [...new Set(controls.map((c) => c.section))];
  const sectionKey = `${node.type}:${tab}`;
  const current = openSection[sectionKey] === undefined ? sections[0] : openSection[sectionKey];
  const path = pathTo(blocks, node.id);
  return (
    <div className="fre-element">
      <nav className="fre-crumbs" aria-label="Element path">
        {path.map((id, i) => {
          const item = find(blocks, id);
          const title = item ? (getElement(item.type)?.title ?? item.type) : id;
          return (
            <span key={id}>
              {i > 0 && <span aria-hidden="true"> › </span>}
              {id === node.id ? (
                <strong>{title}</strong>
              ) : (
                <button type="button" onClick={() => store.actions.select(id)}>
                  {title}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="fre-tabs" role="tablist">
        {(['content', 'style', 'advanced'] as Tab[]).map((t) =>
          definition.controls.some((c) => c.tab === t) ? (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'is-on' : ''}
              onClick={() => store.actions.setTab(t)}
            >
              {t === 'content' ? 'Content' : t === 'style' ? 'Style' : 'Advanced'}
            </button>
          ) : null,
        )}
      </div>
      {sections.map((section) => {
        const inSection = controls.filter((c) => c.section === section);
        const hoverable = inSection.some((c) => c.hover);
        const key = `${node.type}:${tab}:${section}`;
        const isHover = hover[key] === true;
        const env: ControlEnv = {
          attrs: node.attrs,
          settings,
          device,
          hover: isHover,
          kit,
          readOnly,
          setDevice: (d) => store.actions.setDevice(d),
          set: (changes, merge) => store.actions.setSettings(node.id, changes, merge),
          media,
        };
        const open = current === section;
        return (
          <section key={section} className={`fre-section${open ? ' is-open' : ''}`}>
            <button
              type="button"
              className="fre-section__head"
              aria-expanded={open}
              onClick={() => setOpenSection((s) => ({ ...s, [sectionKey]: open ? null : section }))}
            >
              <Svg path={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={12} />
              {section}
            </button>
            {open && (
              <div className="fre-section__body">
                {hoverable && (
                  <div className="fre-states" role="tablist">
                    <button
                      type="button"
                      className={!isHover ? 'is-on' : ''}
                      onClick={() => setHover((h) => ({ ...h, [key]: false }))}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      className={isHover ? 'is-on' : ''}
                      onClick={() => setHover((h) => ({ ...h, [key]: true }))}
                    >
                      Hover
                    </button>
                  </div>
                )}
                {inSection
                  .filter((c) => !isHover || c.hover)
                  .map((control) => (
                    <ControlField key={control.name} control={control} env={env} />
                  ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---- Navigator -------------------------------------------------------------------------------

function Navigator({ store }: { store: Store }) {
  const blocks = useStore(store, (s) => s.blocks);
  const selected = useStore(store, (s) => s.selected);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const item = (node: FrescoNode, depth: number) => {
    const definition = getElement(node.type);
    const title =
      (typeof node.attrs._title === 'string' && node.attrs._title) ||
      definition?.title ||
      node.type;
    const kids = node.children ?? [];
    return (
      <li key={node.id}>
        <div
          className={`fre-nav__row${selected === node.id ? ' is-on' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onMouseEnter={() => store.actions.hover(node.id)}
          onMouseLeave={() => store.actions.hover(null)}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className="fre-iconbtn"
              aria-label={closed[node.id] ? 'Expand' : 'Collapse'}
              onClick={() => setClosed((c) => ({ ...c, [node.id]: !c[node.id] }))}
            >
              <Svg path={closed[node.id] ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} size={11} />
            </button>
          ) : (
            <span className="fre-nav__spacer" />
          )}
          <button
            type="button"
            className="fre-nav__title"
            onClick={() => store.actions.select(node.id)}
          >
            {definition && <Svg path={definition.icon} size={13} />}
            {title}
          </button>
        </div>
        {kids.length > 0 && !closed[node.id] && (
          <ul>{kids.map((child) => item(child, depth + 1))}</ul>
        )}
      </li>
    );
  };
  return (
    <div className="fre-nav">
      <h3 className="fre-view-title">Navigator</h3>
      {blocks.length === 0 ? (
        <p className="fre-empty-note">The page is empty.</p>
      ) : (
        <ul>{blocks.map((node) => item(node, 0))}</ul>
      )}
    </div>
  );
}

// ---- Page settings ------------------------------------------------------------------------------

function PageView({ store }: { store: Store }) {
  const page = useStore(store, (s) => s.page);
  const kit = useStore(store, (s) => s.kit);
  return (
    <div className="fre-site">
      <h3 className="fre-view-title">Page settings</h3>
      <label className="fre-checks">
        <input
          type="checkbox"
          checked={page.hideTitle === true}
          onChange={(e) => store.actions.setPage({ hideTitle: e.target.checked || undefined })}
        />
        Hide the page title
      </label>
      <p className="fre-help">
        Hides the theme's title of this page (Site settings → Layout says which element that is).
      </p>
      <div className="fre-control fre-control--inline">
        <div className="fre-control__head">
          <span className="fre-control__label">Page background</span>
        </div>
        <div className="fre-control__body">
          <ColorPicker
            value={typeof page.background === 'string' ? page.background : ''}
            kit={kit}
            onChange={(v) => store.actions.setPage({ background: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ---- Site settings (kit) ---------------------------------------------------------------------------

function SiteView({ store, canManageKit, onSaveKit }: PanelProps) {
  const kit = useStore(store, (s) => s.kit);
  const dirty = useStore(store, (s) => s.kitDirty);
  const [section, setSection] = useState<string>('colors');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Kit>) => store.actions.setKit({ ...kit, ...patch });
  const fonts = useMemo(() => [...SYSTEM_FONTS, ...[...GOOGLE_FONTS].sort()], []);
  const sectionHead = (id: string, title: string) => (
    <button
      type="button"
      className="fre-section__head"
      aria-expanded={section === id}
      onClick={() => setSection(section === id ? '' : id)}
    >
      <Svg path={section === id ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={12} />
      {title}
    </button>
  );
  return (
    <div className="fre-site">
      <h3 className="fre-view-title">Site settings</h3>
      <p className="fre-help">
        They apply to every Fresco page of the site.
        {!canManageKit && ' Only administrators can save them.'}
      </p>
      <section className={`fre-section${section === 'colors' ? ' is-open' : ''}`}>
        {sectionHead('colors', 'Global colors')}
        {section === 'colors' && (
          <div className="fre-section__body">
            {kit.colors.map((color, index) => (
              <ColorRow
                key={color.id}
                color={color}
                kit={kit}
                system={index < 4}
                onChange={(next) =>
                  set({ colors: kit.colors.map((c) => (c.id === color.id ? next : c)) })
                }
                onRemove={() => set({ colors: kit.colors.filter((c) => c.id !== color.id) })}
              />
            ))}
            <button
              type="button"
              className="fre-button"
              onClick={() => {
                const id = `c${Math.random().toString(36).slice(2, 8)}`;
                set({ colors: [...kit.colors, { id, title: 'New color', value: '#64748b' }] });
              }}
            >
              + Add color
            </button>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'fonts' ? ' is-open' : ''}`}>
        {sectionHead('fonts', 'Global fonts')}
        {section === 'fonts' && (
          <div className="fre-section__body">
            {kit.fonts.map((font, index) => (
              <FontRow
                key={font.id}
                font={font}
                fonts={fonts}
                system={index < 4}
                onChange={(next) =>
                  set({ fonts: kit.fonts.map((f) => (f.id === font.id ? next : f)) })
                }
                onRemove={() => set({ fonts: kit.fonts.filter((f) => f.id !== font.id) })}
              />
            ))}
            <button
              type="button"
              className="fre-button"
              onClick={() => {
                const id = `f${Math.random().toString(36).slice(2, 8)}`;
                set({
                  fonts: [...kit.fonts, { id, title: 'New font', family: 'Inter', weight: '400' }],
                });
              }}
            >
              + Add font
            </button>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'layout' ? ' is-open' : ''}`}>
        {sectionHead('layout', 'Layout')}
        {section === 'layout' && (
          <div className="fre-section__body">
            <NumberRow
              label="Content width (px)"
              value={Number(kit.containerWidth.size)}
              min={300}
              max={2400}
              onChange={(v) => set({ containerWidth: { size: v, unit: 'px' } })}
            />
            <NumberRow
              label="Gap between elements (px)"
              value={Number(kit.gap.size)}
              min={0}
              max={200}
              onChange={(v) => set({ gap: { size: v, unit: 'px' } })}
            />
            <NumberRow
              label="Tablet up to (px)"
              value={kit.breakpoints.tablet}
              min={600}
              max={2400}
              onChange={(v) => set({ breakpoints: { ...kit.breakpoints, tablet: v } })}
            />
            <NumberRow
              label="Mobile up to (px)"
              value={kit.breakpoints.mobile}
              min={320}
              max={1200}
              onChange={(v) => set({ breakpoints: { ...kit.breakpoints, mobile: v } })}
            />
            <div className="fre-control">
              <div className="fre-control__head">
                <span className="fre-control__label">Page title selector</span>
              </div>
              <input
                className="fre-input fre-mono"
                value={kit.titleSelector ?? ''}
                placeholder={DEFAULT_KIT.titleSelector}
                onChange={(e) => set({ titleSelector: e.target.value || undefined })}
              />
              <p className="fre-help">
                What "Hide the page title" hides, as a CSS selector of your theme.
              </p>
            </div>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'style' ? ' is-open' : ''}`}>
        {sectionHead('style', 'Theme style')}
        {section === 'style' && (
          <div className="fre-section__body">
            {(
              [
                ['text', 'Text color'],
                ['link', 'Link color'],
                ['linkHover', 'Link color on hover'],
                ['background', 'Page background'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="fre-control fre-control--inline">
                <div className="fre-control__head">
                  <span className="fre-control__label">{label}</span>
                </div>
                <div className="fre-control__body">
                  <ColorPicker
                    value={kit.style[key] ?? ''}
                    kit={kit}
                    onChange={(v) => set({ style: { ...kit.style, [key]: v } })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {canManageKit && (
        <div className="fre-site__save">
          {error && <p className="fre-error">{error}</p>}
          <button
            type="button"
            className="fre-button fre-button--primary"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSaveKit();
              } catch (e) {
                setError(String(e instanceof Error ? e.message : e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save site settings' : 'Site settings saved'}
          </button>
        </div>
      )}
    </div>
  );
}

function ColorRow({
  color,
  kit,
  system,
  onChange,
  onRemove,
}: {
  color: KitColor;
  kit: Kit;
  system: boolean;
  onChange: (c: KitColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fre-kitrow">
      <ColorPicker
        value={color.value}
        kit={{ ...kit, colors: [] }}
        onChange={(v) => v && !v.startsWith('var(') && onChange({ ...color, value: v })}
      />
      <input
        className="fre-input"
        value={color.title}
        aria-label="Name"
        onChange={(e) => onChange({ ...color, title: e.target.value })}
      />
      <code className="fre-mono">{color.value}</code>
      {!system && (
        <button
          type="button"
          className="fre-iconbtn"
          aria-label={`Remove ${color.title}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

function FontRow({
  font,
  fonts,
  system,
  onChange,
  onRemove,
}: {
  font: KitFont;
  fonts: string[];
  system: boolean;
  onChange: (f: KitFont) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fre-kitfont">
      <div className="fre-kitrow">
        <input
          className="fre-input"
          value={font.title}
          aria-label="Name"
          onChange={(e) => onChange({ ...font, title: e.target.value })}
        />
        {!system && (
          <button
            type="button"
            className="fre-iconbtn"
            aria-label={`Remove ${font.title}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <div className="fre-kitrow">
        <select
          className="fre-input"
          value={font.family}
          aria-label="Family"
          onChange={(e) => onChange({ ...font, family: e.target.value })}
        >
          {fonts.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="fre-input"
          value={font.weight}
          aria-label="Weight"
          onChange={(e) => onChange({ ...font, weight: e.target.value })}
        >
          {['300', '400', '500', '600', '700', '800'].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <input
          className="fre-input fre-input--number"
          type="number"
          placeholder="Size"
          aria-label="Size (px)"
          value={typeof font.size?.size === 'number' ? font.size.size : ''}
          onChange={(e) => {
            const rest = { ...font };
            delete rest.size;
            onChange(
              e.target.value
                ? { ...rest, size: { size: Number(e.target.value), unit: 'px' } }
                : rest,
            );
          }}
        />
      </div>
      <p className="fre-preview-font" style={{ fontFamily: font.family, fontWeight: font.weight }}>
        The quick brown fox
      </p>
    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fre-control fre-control--inline">
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
      </div>
      <div className="fre-control__body">
        <input
          className="fre-input fre-input--number"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
      </div>
    </div>
  );
}

export type { Control, Settings };
