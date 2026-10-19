/**
 * The parts of Site settings added for the theme style and the site's
 * identity: typography, buttons, images, form fields, lightbox, and the
 * site's title and tagline.
 */
import { api as coreApi, useT } from '@cleitext/admin-sdk';
import { useEffect, useState, type ReactNode } from 'react';
import {
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  THEME_TEXTS,
  type Kit,
  type TextStyle,
  type ThemeStyle,
  type ThemeText,
} from '../core/kit.js';
import type { SizeValue } from '../core/model.js';
import { ColorPicker } from './controls.js';
import { notify } from './dialogs.js';

export type SiteSection =
  | 'colors'
  | 'fonts'
  | 'typography'
  | 'buttons'
  | 'images'
  | 'fields'
  | 'identity'
  | 'style'
  | 'layout'
  | 'lightbox'
  | 'variables';

/** The menu of Site settings, in groups. */
export const SITE_MENU: {
  group: string;
  items: { id: SiteSection; title: string; icon: string }[];
}[] = [
  {
    group: 'Design system',
    items: [
      {
        id: 'colors',
        title: 'Global colors',
        icon: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.9-1 1.5-2-.5-1.3.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z M7 11.5h.01 M10.5 7.5h.01 M15 9h.01',
      },
      { id: 'fonts', title: 'Global fonts', icon: 'M4 20l6-16h2l6 16 M7 14h10' },
    ],
  },
  {
    group: 'Theme style',
    items: [
      { id: 'typography', title: 'Typography', icon: 'M4 7V5h16v2 M9 19h6 M12 5v14' },
      { id: 'buttons', title: 'Buttons', icon: 'M3 8h18v8H3z M8 12h8' },
      { id: 'images', title: 'Images', icon: 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6 M15.5 9.5h.01' },
      { id: 'fields', title: 'Form fields', icon: 'M3 6h18v5H3z M3 15h12v4H3z' },
    ],
  },
  {
    group: 'Settings',
    items: [
      {
        id: 'identity',
        title: 'Site identity',
        icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
      },
      { id: 'style', title: 'Background', icon: 'M4 4h16v16H4z M4 15l16-11' },
      { id: 'layout', title: 'Layout', icon: 'M4 4h16v16H4z M4 9h16 M9 9v11' },
      { id: 'lightbox', title: 'Lightbox', icon: 'M3 3h18v18H3z M8 8h8v8H8z' },
      {
        id: 'variables',
        title: 'Variables and classes',
        icon: 'M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2 M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2',
      },
    ],
  },
];

// ---- Small fields --------------------------------------------------------------------------

function Row({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <div className="fre-control fre-control--inline">
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
      </div>
      <div className="fre-control__body">{children}</div>
      {help && <p className="fre-help">{help}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  kit,
  onChange,
}: {
  label: string;
  value: string | undefined;
  kit: Kit;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Row label={label}>
      <ColorPicker
        value={value ?? ''}
        kit={{ ...kit, colors: [] }}
        onChange={(v) => onChange(v && !v.startsWith('var(') ? v : undefined)}
      />
    </Row>
  );
}

function SizeField({
  label,
  value,
  onChange,
  units = ['px', 'em', 'rem'],
}: {
  label: string;
  value: SizeValue | undefined;
  onChange: (v: SizeValue | undefined) => void;
  units?: string[];
}) {
  return (
    <Row label={label}>
      <span className="fre-sizefield">
        <input
          className="fre-input fre-input--number"
          type="number"
          value={typeof value?.size === 'number' ? value.size : ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? undefined
                : { size: Number(e.target.value), unit: value?.unit ?? units[0]! },
            )
          }
        />
        <select
          className="fre-unit"
          value={value?.unit ?? units[0]}
          onChange={(e) =>
            onChange(
              typeof value?.size === 'number'
                ? { size: value.size, unit: e.target.value }
                : undefined,
            )
          }
        >
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </span>
    </Row>
  );
}

function FontField({
  label,
  kit,
  value,
  onChange,
}: {
  label: string;
  kit: Kit;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const { t } = useT();
  return (
    <Row label={label}>
      <select
        className="fre-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t('Default')}</option>
        {kit.fonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
          </option>
        ))}
      </select>
    </Row>
  );
}

// ---- Theme style ---------------------------------------------------------------------------

type SetTheme = (theme: ThemeStyle) => void;

const TEXT_LABELS: Record<ThemeText, string> = {
  body: 'Body text',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  h5: 'H5',
  h6: 'H6',
};

export function TypographySettings({ kit, setTheme }: { kit: Kit; setTheme: SetTheme }) {
  const { t } = useT();
  const [open, setOpen] = useState<ThemeText>('body');
  const families = [...SYSTEM_FONTS, ...[...GOOGLE_FONTS].sort()];
  const texts = kit.theme.texts ?? {};
  const set = (key: ThemeText, patch: Partial<TextStyle>) =>
    setTheme({ ...kit.theme, texts: { ...texts, [key]: { ...texts[key], ...patch } } });
  return (
    <>
      <p className="fre-help">
        {t('How texts and headings look on every Fresco page, unless an element says otherwise.')}
      </p>
      <div className="fre-chips">
        {THEME_TEXTS.map((key) => (
          <button
            key={key}
            type="button"
            className={`fre-chip${open === key ? ' is-on' : ''}`}
            onClick={() => setOpen(key)}
          >
            {t(TEXT_LABELS[key])}
            {texts[key] && <span className="fre-dot" />}
          </button>
        ))}
      </div>
      <FontField
        label={t('Global font')}
        kit={kit}
        value={texts[open]?.font}
        onChange={(font) => set(open, { font })}
      />
      {!texts[open]?.font && (
        <Row label={t('Family')}>
          <select
            className="fre-input"
            value={texts[open]?.family ?? ''}
            onChange={(e) => set(open, { family: e.target.value || undefined })}
          >
            <option value="">{t('Default')}</option>
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Row>
      )}
      <SizeField
        label={t('Size')}
        value={texts[open]?.size}
        onChange={(size) => set(open, { size })}
      />
      <Row label={t('Weight')}>
        <select
          className="fre-input"
          value={texts[open]?.weight ?? ''}
          onChange={(e) => set(open, { weight: e.target.value || undefined })}
        >
          <option value="">{t('Default')}</option>
          {['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </Row>
      <ColorField
        label={t('Color')}
        kit={kit}
        value={texts[open]?.color}
        onChange={(color) => set(open, { color })}
      />
    </>
  );
}

export function ButtonSettings({ kit, setTheme }: { kit: Kit; setTheme: SetTheme }) {
  const { t } = useT();
  const b = kit.theme.button ?? {};
  const set = (patch: Partial<NonNullable<ThemeStyle['button']>>) =>
    setTheme({ ...kit.theme, button: { ...b, ...patch } });
  return (
    <>
      <p className="fre-help">{t('The look of every button, unless a button says otherwise.')}</p>
      <FontField label={t('Font')} kit={kit} value={b.font} onChange={(font) => set({ font })} />
      <h4 className="fre-subheading">{t('Normal')}</h4>
      <ColorField
        label={t('Text color')}
        kit={kit}
        value={b.color}
        onChange={(color) => set({ color })}
      />
      <ColorField
        label={t('Background')}
        kit={kit}
        value={b.background}
        onChange={(background) => set({ background })}
      />
      <ColorField
        label={t('Border color')}
        kit={kit}
        value={b.borderColor}
        onChange={(borderColor) => set({ borderColor })}
      />
      <h4 className="fre-subheading">{t('Hover')}</h4>
      <ColorField
        label={t('Text color')}
        kit={kit}
        value={b.hoverColor}
        onChange={(hoverColor) => set({ hoverColor })}
      />
      <ColorField
        label={t('Background')}
        kit={kit}
        value={b.hoverBackground}
        onChange={(hoverBackground) => set({ hoverBackground })}
      />
      <h4 className="fre-subheading">{t('Shape')}</h4>
      <SizeField
        label={t('Border width')}
        value={b.borderWidth}
        onChange={(borderWidth) => set({ borderWidth })}
        units={['px']}
      />
      <SizeField
        label={t('Border radius')}
        value={b.radius}
        onChange={(radius) => set({ radius })}
        units={['px', '%', 'em']}
      />
      <SizeField
        label={t('Padding top and bottom')}
        value={b.paddingY}
        onChange={(paddingY) => set({ paddingY })}
      />
      <SizeField
        label={t('Padding left and right')}
        value={b.paddingX}
        onChange={(paddingX) => set({ paddingX })}
      />
    </>
  );
}

export function ImageSettings({ kit, setTheme }: { kit: Kit; setTheme: SetTheme }) {
  const { t } = useT();
  const i = kit.theme.image ?? {};
  const set = (patch: Partial<NonNullable<ThemeStyle['image']>>) =>
    setTheme({ ...kit.theme, image: { ...i, ...patch } });
  const opacity = (
    label: string,
    value: number | undefined,
    change: (v: number | undefined) => void,
  ) => (
    <Row label={label}>
      <span className="fre-slider">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value ?? 1}
          onChange={(e) => change(Number(e.target.value))}
        />
        <span className="fre-mono">{value ?? 1}</span>
      </span>
    </Row>
  );
  return (
    <>
      <p className="fre-help">
        {t('The look of every image element, unless an image says otherwise.')}
      </p>
      <SizeField
        label={t('Border radius')}
        value={i.radius}
        onChange={(radius) => set({ radius })}
        units={['px', '%']}
      />
      <SizeField
        label={t('Border width')}
        value={i.borderWidth}
        onChange={(borderWidth) => set({ borderWidth })}
        units={['px']}
      />
      <ColorField
        label={t('Border color')}
        kit={kit}
        value={i.borderColor}
        onChange={(borderColor) => set({ borderColor })}
      />
      {opacity(t('Opacity'), i.opacity, (v) => set({ opacity: v }))}
      {opacity(t('Opacity on hover'), i.hoverOpacity, (v) => set({ hoverOpacity: v }))}
    </>
  );
}

export function FieldSettings({ kit, setTheme }: { kit: Kit; setTheme: SetTheme }) {
  const { t } = useT();
  const f = kit.theme.field ?? {};
  const set = (patch: Partial<NonNullable<ThemeStyle['field']>>) =>
    setTheme({ ...kit.theme, field: { ...f, ...patch } });
  return (
    <>
      <p className="fre-help">{t('The fields of the forms on Fresco pages.')}</p>
      <ColorField
        label={t('Text color')}
        kit={kit}
        value={f.color}
        onChange={(color) => set({ color })}
      />
      <ColorField
        label={t('Background')}
        kit={kit}
        value={f.background}
        onChange={(background) => set({ background })}
      />
      <ColorField
        label={t('Border color')}
        kit={kit}
        value={f.borderColor}
        onChange={(borderColor) => set({ borderColor })}
      />
      <ColorField
        label={t('Border color when focused')}
        kit={kit}
        value={f.focusBorderColor}
        onChange={(focusBorderColor) => set({ focusBorderColor })}
      />
      <SizeField
        label={t('Border width')}
        value={f.borderWidth}
        onChange={(borderWidth) => set({ borderWidth })}
        units={['px']}
      />
      <SizeField
        label={t('Border radius')}
        value={f.radius}
        onChange={(radius) => set({ radius })}
        units={['px', '%']}
      />
    </>
  );
}

export function LightboxSettings({ kit, setTheme }: { kit: Kit; setTheme: SetTheme }) {
  const { t } = useT();
  const l = kit.theme.lightbox ?? {};
  const set = (patch: Partial<NonNullable<ThemeStyle['lightbox']>>) =>
    setTheme({ ...kit.theme, lightbox: { ...l, ...patch } });
  return (
    <>
      <p className="fre-help">{t('The window that shows images enlarged.')}</p>
      <ColorField
        label={t('Background')}
        kit={kit}
        value={l.background}
        onChange={(background) => set({ background })}
      />
      <ColorField
        label={t('Buttons color')}
        kit={kit}
        value={l.uiColor}
        onChange={(uiColor) => set({ uiColor })}
      />
    </>
  );
}

// ---- Site identity (the core's general settings) ------------------------------------------

export function IdentitySettings({ canManage }: { canManage: boolean }) {
  const { t } = useT();
  const [values, setValues] = useState<{ title: string; tagline: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    void coreApi<{ title: string; tagline: string }>('GET', '/settings/core')
      .then((s) => setValues({ title: s.title, tagline: s.tagline }))
      .catch(() => setValues(null));
  }, [canManage]);
  if (!canManage) {
    return (
      <p className="fre-help">{t('Only administrators can change the identity of the site.')}</p>
    );
  }
  if (!values) return <p className="fre-empty-note">{t('Loading…')}</p>;
  return (
    <>
      <div className="fre-control">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Site title')}</span>
        </div>
        <input
          className="fre-input"
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
        />
      </div>
      <div className="fre-control">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Tagline')}</span>
        </div>
        <input
          className="fre-input"
          value={values.tagline}
          onChange={(e) => setValues({ ...values, tagline: e.target.value })}
        />
      </div>
      <p className="fre-help">{t('The logo and the site icon are in Appearance → Customize.')}</p>
      <button
        type="button"
        className="fre-button fre-button--primary"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          coreApi('PATCH', '/settings/core', values)
            .then(() => notify(t('Site identity saved.'), 'success'))
            .catch((e: unknown) => notify(String(e instanceof Error ? e.message : e), 'error'))
            .finally(() => setSaving(false));
        }}
      >
        {t('Save')}
      </button>
    </>
  );
}
