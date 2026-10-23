/**
 * The Style tab of atomic elements: CSS properties for the device and state
 * being edited, written to the element's own style or to one of its global
 * classes (shared with every element that has it).
 */
import { t } from '@cleitext/admin-sdk';
import { useState } from 'react';
import {
  STYLE_PROPS,
  type GlobalClass,
  type StyleProp,
  type StyleState,
  type StyleVariant,
} from '../core/atomic.js';
import { isBox, isSize } from '../core/css.js';
import { localStyleToClass, liveVariables } from '../core/design-system.js';
import { askText } from './dialogs.js';
import type { Kit } from '../core/kit.js';
import {
  inheritChain,
  type BoxValue,
  type Device,
  type FrescoNode,
  type SizeValue,
} from '../core/model.js';
import { DEVICE_NAMES, Svg } from './controls.js';
import { useStore, type Store } from './store.js';

const SECTIONS = [...new Set(STYLE_PROPS.map((p) => p.section))];

function variantsOf(value: unknown): StyleVariant[] {
  return Array.isArray(value) ? (value as StyleVariant[]) : [];
}

/** Sets one property in the variant for a device and state (empty removes it). */
export function setVariantProp(
  variants: StyleVariant[],
  device: Device,
  state: StyleState,
  key: string,
  value: unknown,
): StyleVariant[] {
  const empty = value === undefined || value === null || value === '';
  const next = variants.map((v) => ({ ...v, props: { ...v.props } }));
  let variant = next.find((v) => v.device === device && v.state === state);
  if (!variant) {
    if (empty) return variants;
    variant = { device, state, props: {} };
    next.push(variant);
  }
  if (empty) delete variant.props[key];
  else variant.props[key] = value;
  return next.filter((v) => Object.keys(v.props).length > 0);
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `class-${Math.random().toString(36).slice(2, 7)}`;

export function AtomicStyle({
  store,
  node,
  canManageKit,
}: {
  store: Store;
  node: FrescoNode;
  canManageKit: boolean;
}) {
  const device = useStore(store, (s) => s.device);
  const kit = useStore(store, (s) => s.kit);
  const [state, setState] = useState<StyleState>('');
  const [target, setTarget] = useState<string>('local');
  const [open, setOpen] = useState<string>('Layout');
  const [adding, setAdding] = useState('');
  const classes = (Array.isArray(node.attrs._classes) ? node.attrs._classes : []) as string[];
  const globalClass =
    target === 'local' ? null : (kit.classes.find((c) => c.id === target) ?? null);
  const variants = globalClass ? globalClass.variants : variantsOf(node.attrs._styles);
  const current = variants.find((v) => v.device === device && v.state === state)?.props ?? {};
  const inherited = (key: string) => {
    for (const d of inheritChain(device, kit.breakpoints)) {
      const v = variants.find((x) => x.device === d && x.state === state)?.props[key];
      if (v !== undefined) return v;
    }
    return undefined;
  };

  const write = (key: string, value: unknown) => {
    if (globalClass) {
      const updated: GlobalClass = {
        ...globalClass,
        variants: setVariantProp(globalClass.variants, device, state, key, value),
      };
      store.actions.setKit({
        ...kit,
        classes: kit.classes.map((c) => (c.id === updated.id ? updated : c)),
      });
    } else {
      store.actions.setSettings(
        node.id,
        { _styles: setVariantProp(variants, device, state, key, value) },
        `style:${key}`,
      );
    }
  };

  const addClass = (label: string) => {
    const existing = kit.classes.find(
      (c) => c.label.toLowerCase() === label.toLowerCase() || c.id === label,
    );
    let id = existing?.id;
    if (!existing) {
      if (!canManageKit) return;
      id = slug(label);
      while (kit.classes.some((c) => c.id === id)) id = `${id}-2`;
      store.actions.setKit({ ...kit, classes: [...kit.classes, { id, label, variants: [] }] });
    }
    if (id && !classes.includes(id))
      store.actions.setSettings(node.id, { _classes: [...classes, id] });
    setTarget(id!);
    setAdding('');
  };

  return (
    <div className="fre-atomic">
      <div className="fre-control">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Classes')}</span>
        </div>
        <div className="fre-chips">
          <button
            type="button"
            className={`fre-chip${target === 'local' ? ' is-on' : ''}`}
            onClick={() => setTarget('local')}
          >
            {t('This element')}
          </button>
          {classes.map((id) => {
            const c = kit.classes.find((x) => x.id === id);
            return (
              <span key={id} className={`fre-chip${target === id ? ' is-on' : ''}`}>
                <button type="button" onClick={() => setTarget(id)}>
                  .{c?.label ?? id}
                </button>
                <button
                  type="button"
                  aria-label={t('Remove the class {name}', { name: c?.label ?? id })}
                  onClick={() => {
                    store.actions.setSettings(node.id, {
                      _classes: classes.filter((x) => x !== id),
                    });
                    if (target === id) setTarget('local');
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <form
          className="fre-color__row"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) addClass(adding.trim());
          }}
        >
          <input
            className="fre-input"
            list="fresco-classes"
            placeholder={canManageKit ? t('Add or create a class') : t('Add a class')}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <datalist id="fresco-classes">
            {kit.classes.map((c) => (
              <option key={c.id} value={c.label} />
            ))}
          </datalist>
          <button type="submit" className="fre-button" disabled={!adding.trim()}>
            {t('Add')}
          </button>
        </form>
        {!globalClass && canManageKit && variantsOf(node.attrs._styles).length > 0 && (
          <button
            type="button"
            className="fre-button fre-button--small"
            onClick={() =>
              void askText({
                title: t('Convert to class'),
                label: t('Class name'),
                value: '',
              }).then((label) => {
                const result = label && localStyleToClass(store.get().kit, node.attrs, label);
                if (!result) return;
                store.actions.setKit({ ...store.get().kit, classes: result.classes });
                store.actions.setSettings(node.id, result.attrs);
                setTarget(result.attrs._classes[result.attrs._classes.length - 1]!);
              })
            }
          >
            {t('Convert to class')}
          </button>
        )}
        {globalClass && (
          <p className="fre-help">
            {withStrong(
              t('Editing the class {name}: every element with it changes.'),
              `.${globalClass.label}`,
            )}{' '}
            {canManageKit
              ? t('Save the site settings to keep it.')
              : t('Only administrators can save classes.')}
          </p>
        )}
      </div>
      <div className="fre-states" role="tablist" aria-label={t('State')}>
        {(['', 'hover', 'focus', 'active'] as const).map((s) => (
          <button
            key={s || 'normal'}
            type="button"
            className={state === s ? 'is-on' : ''}
            onClick={() => setState(s)}
          >
            {t(s ? s[0]!.toUpperCase() + s.slice(1) : 'Normal')}
          </button>
        ))}
      </div>
      <p className="fre-help">
        {withStrong(
          t('Device: {name} (change it from the bar above the page).'),
          t(DEVICE_NAMES[device]),
        )}
      </p>
      {SECTIONS.map((section) => {
        const props = STYLE_PROPS.filter((p) => p.section === section);
        const used = props.some((p) => current[p.key] !== undefined);
        const isOpen = open === section;
        return (
          <section key={section} className={`fre-section${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="fre-section__head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? '' : section)}
            >
              <Svg path={isOpen ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={12} />
              {t(section)}
              {used && <span className="fre-dot" aria-label={t('Has values')} />}
            </button>
            {isOpen && (
              <div className="fre-section__body">
                {props.map((prop) => (
                  <PropInput
                    key={prop.key}
                    prop={prop}
                    value={current[prop.key]}
                    inherited={inherited(prop.key)}
                    kit={kit}
                    onChange={(v) => write(prop.key, v)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** A translated sentence with `{name}` shown in bold. */
function withStrong(text: string, name: string) {
  const [before, after = ''] = text.split('{name}');
  return (
    <>
      {before}
      <strong>{name}</strong>
      {after}
    </>
  );
}

function PropInput({
  prop,
  value,
  inherited,
  kit,
  onChange,
}: {
  prop: StyleProp;
  value: unknown;
  inherited: unknown;
  kit: Kit;
  onChange: (value: unknown) => void;
}) {
  const reset =
    value !== undefined ? (
      <button
        type="button"
        className="fre-reset"
        title={t('Reset')}
        aria-label={t('Reset {control}', { control: t(prop.label) })}
        onClick={() => onChange(undefined)}
      >
        <Svg path="M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4" size={12} />
      </button>
    ) : null;
  const variables = liveVariables(
    kit.variables,
    prop.type === 'color' ? 'color' : prop.type === 'font' ? 'font' : 'size',
  );
  const variableSelect =
    variables.length > 0 && ['color', 'font', 'size'].includes(prop.type) ? (
      <select
        className="fre-unit"
        aria-label={t('Variable')}
        value={typeof value === 'string' && value.startsWith('var(') ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Var</option>
        {variables.map((v) => (
          <option key={v.id} value={`var(--fr-v-${v.id})`}>
            {v.label}
          </option>
        ))}
      </select>
    ) : null;
  let input: React.ReactNode;
  switch (prop.type) {
    case 'select':
      input = (
        <select
          className="fre-input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">
            {inherited !== undefined
              ? t('Inherit ({value})', { value: String(inherited) })
              : t('Default')}
          </option>
          {prop.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      input = (
        <input
          className="fre-input fre-input--number"
          type="number"
          step={prop.key === 'opacity' ? 0.05 : 1}
          value={typeof value === 'number' ? value : ''}
          placeholder={inherited !== undefined ? String(inherited) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
      break;
    case 'color': {
      const colors = [
        ...kit.colors.map((c) => ({
          value: `var(--fr-c-${c.id})`,
          label: c.title,
          swatch: c.value,
        })),
      ];
      input = (
        <span className="fre-color__row">
          <input
            type="color"
            value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t(prop.label)}
          />
          <select
            className="fre-input"
            value={typeof value === 'string' && value.startsWith('var(--fr-c-') ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            aria-label={t('Global color')}
          >
            <option value="">
              {typeof value === 'string' && !value.startsWith('var(') ? value : t('Global…')}
            </option>
            {colors.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {variableSelect}
        </span>
      );
      break;
    }
    case 'font':
      input = (
        <span className="fre-color__row">
          <input
            className="fre-input"
            value={typeof value === 'string' && !value.startsWith('var(') ? value : ''}
            placeholder="Inter, sans-serif"
            onChange={(e) => onChange(e.target.value || undefined)}
          />
          {variableSelect}
        </span>
      );
      break;
    case 'text':
      input = (
        <input
          className="fre-input"
          value={typeof value === 'string' ? value : ''}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
      break;
    case 'size': {
      const size: SizeValue = isSize(value)
        ? value
        : { size: '', unit: isSize(inherited) ? inherited.unit : (prop.units?.[0] ?? 'px') };
      input = (
        <span className="fre-color__row">
          <input
            className="fre-input fre-input--number"
            type="number"
            step={size.unit === 'em' || size.unit === 'rem' || size.unit === '' ? 0.1 : 1}
            value={size.size}
            placeholder={isSize(inherited) ? String(inherited.size) : ''}
            onChange={(e) =>
              onChange(
                e.target.value === ''
                  ? undefined
                  : { size: Number(e.target.value), unit: size.unit },
              )
            }
          />
          <select
            className="fre-unit"
            value={size.unit}
            onChange={(e) =>
              size.size !== '' && onChange({ size: size.size, unit: e.target.value })
            }
          >
            {(prop.units ?? ['px']).map((u) => (
              <option key={u} value={u}>
                {u || '—'}
              </option>
            ))}
          </select>
          {variableSelect}
        </span>
      );
      break;
    }
    case 'box': {
      const b: BoxValue = isBox(value)
        ? value
        : { top: '', right: '', bottom: '', left: '', unit: prop.units?.[0] ?? 'px' };
      const sides = ['top', 'right', 'bottom', 'left'] as const;
      input = (
        <span className="fre-box">
          {sides.map((side) => (
            <label key={side}>
              <input
                className="fre-input fre-input--number"
                type="number"
                value={b[side]}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value);
                  const next =
                    b.linked !== false
                      ? { ...b, top: v, right: v, bottom: v, left: v }
                      : { ...b, [side]: v };
                  onChange(sides.every((s) => next[s] === '') ? undefined : next);
                }}
              />
              <span>{t(side)}</span>
            </label>
          ))}
          <button
            type="button"
            className={`fre-link${b.linked !== false ? ' is-on' : ''}`}
            title={t('Link values')}
            onClick={() => onChange({ ...b, linked: b.linked === false })}
          >
            <Svg
              path="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
              size={13}
            />
          </button>
          <select
            className="fre-unit"
            value={b.unit}
            onChange={(e) => onChange({ ...b, unit: e.target.value })}
          >
            {(prop.units ?? ['px']).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </span>
      );
      break;
    }
    case 'shadow': {
      const s = (value && typeof value === 'object' ? value : {}) as {
        x?: number;
        y?: number;
        blur?: number;
        spread?: number;
        color?: string;
      };
      const set = (patch: Partial<typeof s>) =>
        onChange({ x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.15)', ...s, ...patch });
      input = (
        <span className="fre-shadow">
          {(['x', 'y', 'blur', 'spread'] as const).map((k) => (
            <label key={k}>
              <input
                className="fre-input fre-input--number"
                type="number"
                value={s[k] ?? ''}
                onChange={(e) => set({ [k]: Number(e.target.value) })}
              />
              <span>{t(k)}</span>
            </label>
          ))}
          <input
            className="fre-input fre-mono"
            value={s.color ?? ''}
            placeholder="rgba(0,0,0,.15)"
            onChange={(e) => set({ color: e.target.value })}
          />
        </span>
      );
      break;
    }
  }
  return (
    <div className="fre-control">
      <div className="fre-control__head">
        <span className="fre-control__label">{t(prop.label)}</span>
        {reset}
      </div>
      <div className="fre-control__body">{input}</div>
    </div>
  );
}
