/**
 * The right-hand panel: with a layer selected, its Content, Style and Motion
 * (values of the device shown in the canvas, with a dot where they differ
 * from the larger device); otherwise the slide's and the slider's settings.
 * The Advanced switch adds timings and easings.
 */
import { api, useT } from '@cleitext/admin-sdk';
import { useEffect, useState, type ReactNode } from 'react';
import { defaultMotion } from '../model/normalize';
import { POST_TAGS } from '../model/posts';
import {
  BOX_PLACES,
  EASINGS,
  HOVERS,
  ICONS,
  KEN_BURNS,
  MOTIONS,
  NAV_STYLES,
  TRANSITIONS,
} from '../model/presets';
import { isOverridden, layerPos, layerStyle, valueFor } from '../model/resolve';
import type {
  Anchor,
  Device,
  EasingId,
  FontFamily,
  Layer,
  LayerPos,
  LayerStyle,
  LayerType,
  MediaRef,
  Motion,
  MotionId,
  Slide,
  SliderData,
  SizeValues,
  TransitionId,
} from '../model/types';
import { AnchorGrid, FocalPicker, LinkEditor } from './fields';
import { Btn, ColorInput, Field, ICON, NumberInput, Segmented, Svg, Toggle } from './ui';

export type PanelTab = 'content' | 'style' | 'motion';

const DEVICE_NAMES: Record<Device, string> = {
  desktop: 'computer',
  tablet: 'tablet',
  mobile: 'phone',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dst-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Marker({
  shown,
  onReset,
  device,
}: {
  shown: boolean;
  onReset: () => void;
  device: Device;
}) {
  const { t } = useT();
  if (!shown || device === 'desktop') return null;
  return (
    <>
      <span
        className="dst-dot"
        title={t('Changed on the {device}', { device: t(DEVICE_NAMES[device]) })}
      />
      <button type="button" className="dst-reset" onClick={(e) => (e.preventDefault(), onReset())}>
        {t('Reset')}
      </button>
    </>
  );
}

// ---- Layer ---------------------------------------------------------------------------

const TEXTUAL: LayerType[] = ['heading', 'text', 'button', 'box'];

export interface LayerPanelProps {
  layer: Layer;
  parent: Layer | null;
  slider: SliderData;
  device: Device;
  advanced: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onChange: (fn: (layer: Layer) => Layer, group?: string) => void;
  onStyle: <K extends keyof LayerStyle>(key: K, value: LayerStyle[K]) => void;
  onResetStyle: (key: keyof LayerStyle) => void;
  onPos: (patch: Partial<LayerPos>) => void;
  onResetPos: () => void;
  onAddToBox: (type: LayerType) => void;
  onSelect: (id: string) => void;
  onPickMedia: (done: (ref: MediaRef) => void) => void;
  onPlay: () => void;
}

export function LayerPanel(props: LayerPanelProps) {
  const { t } = useT();
  const { tab, onTab } = props;
  return (
    <div>
      <div className="dst-tabs" role="tablist" aria-label={t('Layer settings')}>
        {(['content', 'style', 'motion'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
          >
            {t(id === 'content' ? 'Content' : id === 'style' ? 'Style' : 'Motion')}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'content' && <LayerContentTab {...props} />}
        {tab === 'style' && <LayerStyleTab {...props} />}
        {tab === 'motion' && <LayerMotionTab {...props} />}
      </div>
    </div>
  );
}

function LayerContentTab({
  layer,
  slider,
  onChange,
  onAddToBox,
  onSelect,
  onPickMedia,
  onPos,
  onStyle,
  device,
}: LayerPanelProps) {
  const { t } = useT();
  const c = layer.content;
  const set = (patch: Partial<Layer['content']>, group?: string) =>
    onChange((l) => ({ ...l, content: { ...l.content, ...patch } }), group);
  const posts = slider.source.kind === 'posts';
  return (
    <div>
      {(layer.type === 'heading' || layer.type === 'text' || layer.type === 'button') && (
        <Field
          label={layer.type === 'button' ? t('Button text') : t('Text')}
          help={
            posts
              ? t('Tags filled in with each post: {tags}', {
                  tags: POST_TAGS.map((n) => `{{${n}}}`).join(' '),
                })
              : undefined
          }
        >
          {layer.type === 'button' ? (
            <input
              className="dst-input"
              data-dio-text=""
              value={c.text}
              onChange={(e) => set({ text: e.target.value }, `text:${layer.id}`)}
            />
          ) : (
            <textarea
              className="dst-textarea"
              data-dio-text=""
              value={c.text}
              rows={layer.type === 'heading' ? 2 : 4}
              onChange={(e) => set({ text: e.target.value }, `text:${layer.id}`)}
            />
          )}
        </Field>
      )}
      {layer.type === 'heading' && (
        <Field
          label={t('Kind of heading')}
          help={t('One main heading (H1) per page, usually in the first slide or the hero.')}
        >
          <Segmented
            label={t('Kind of heading')}
            value={c.tag}
            options={(['h1', 'h2', 'h3', 'h4', 'p'] as const).map((v) => ({
              value: v,
              label: v === 'p' ? t('Text') : v.toUpperCase(),
            }))}
            onChange={(tag) => set({ tag })}
          />
        </Field>
      )}
      {layer.type === 'button' && (
        <LinkEditor value={c.link} posts={posts} onChange={(link) => set({ link })} />
      )}
      {layer.type === 'image' && (
        <>
          {c.media ? (
            <div className="dst-field">
              <img
                src={c.media.url}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: 160,
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: '#0f172a',
                }}
              />
              <div className="dst-row">
                <Btn small icon={ICON.image} onClick={() => onPickMedia((media) => set({ media }))}>
                  {t('Replace')}
                </Btn>
                <Btn small kind="danger" onClick={() => set({ media: null })}>
                  {t('Remove')}
                </Btn>
              </div>
            </div>
          ) : (
            <Btn
              icon={ICON.image}
              onClick={() => onPickMedia((media) => set({ media }))}
              style={{ marginBottom: 12 }}
            >
              {t('Choose a picture')}
            </Btn>
          )}
          <Field
            label={t('Alternative text')}
            help={t('What the picture shows, for people who cannot see it. Empty: the library’s.')}
          >
            <input
              className="dst-input"
              value={c.alt}
              onChange={(e) => set({ alt: e.target.value }, `alt:${layer.id}`)}
            />
          </Field>
          <LinkEditor value={c.link} posts={posts} onChange={(link) => set({ link })} />
        </>
      )}
      {layer.type === 'icon' && (
        <>
          <div className="dst-field">
            <span className="dst-label">{t('Icon')}</span>
            <div
              role="group"
              aria-label={t('Icon')}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}
            >
              {Object.entries(ICONS).map(([name, icon]) => (
                <button
                  key={name}
                  type="button"
                  className="dst-icon-btn"
                  aria-pressed={c.icon === name}
                  aria-label={t(icon.label)}
                  title={t(icon.label)}
                  onClick={() => set({ icon: name })}
                  style={{ width: '100%' }}
                >
                  <Svg path={icon.path} />
                </button>
              ))}
            </div>
          </div>
          <Field label={t('What it means')} help={t('Empty when it is only decoration.')}>
            <input
              className="dst-input"
              value={c.alt}
              onChange={(e) => set({ alt: e.target.value }, `alt:${layer.id}`)}
            />
          </Field>
        </>
      )}
      {layer.type === 'shape' && (
        <Field label={t('Shape')}>
          <Segmented
            label={t('Shape')}
            value={c.shape}
            options={[
              { value: 'rect', label: t('Rectangle') },
              { value: 'circle', label: t('Circle') },
              { value: 'blob', label: t('Blob') },
              { value: 'line', label: t('Line') },
            ]}
            onChange={(shape) => set({ shape })}
          />
        </Field>
      )}
      {layer.type === 'box' && (
        <>
          <div className="dst-field">
            <span className="dst-label">{t('Where the content sits')}</span>
            <AnchorGrid
              label={t('Where the content sits')}
              value={valueFor(layer.pos, device).anchor}
              onChange={(anchor: Anchor) => {
                const place = BOX_PLACES.find((p) => p.id === anchor)!;
                onPos({ anchor, x: place.x, y: place.y });
                onStyle(
                  'textAlign',
                  anchor.endsWith('l') ? 'left' : anchor.endsWith('r') ? 'right' : 'center',
                );
              }}
            />
          </div>
          <div className="dst-field">
            <span className="dst-label">{t('In this box')}</span>
            {layer.children.length === 0 && (
              <span className="dst-help">
                {t('Nothing yet: add a heading, a text or a button.')}
              </span>
            )}
            {layer.children.map((child) => (
              <button
                key={child.id}
                type="button"
                className="dst-btn dst-btn--small"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => onSelect(child.id)}
              >
                <Svg path={ICON[child.type as keyof typeof ICON] ?? ICON.text} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {child.content.text || t(TYPE_NAMES[child.type])}
                </span>
              </button>
            ))}
            <div className="dst-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {(['heading', 'text', 'button', 'icon', 'image'] as const).map((type) => (
                <Btn key={type} small icon={ICON.plus} onClick={() => onAddToBox(type)}>
                  {t(TYPE_NAMES[type])}
                </Btn>
              ))}
            </div>
          </div>
        </>
      )}
      <Section title={t('Show on')}>
        <div className="dst-row">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <label key={d} className="dst-pill" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!layer.hide[d]}
                onChange={(e) =>
                  onChange((l) => ({ ...l, hide: { ...l.hide, [d]: !e.target.checked } }))
                }
              />
              {t(d === 'desktop' ? 'Computer' : d === 'tablet' ? 'Tablet' : 'Phone')}
            </label>
          ))}
        </div>
      </Section>
      <Field label={t('Name in the editor')}>
        <input
          className="dst-input"
          value={layer.name}
          placeholder={t(TYPE_NAMES[layer.type])}
          onChange={(e) => onChange((l) => ({ ...l, name: e.target.value }), `name:${layer.id}`)}
        />
      </Field>
    </div>
  );
}

export const TYPE_NAMES: Record<LayerType, string> = {
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  image: 'Image',
  icon: 'Icon',
  shape: 'Shape',
  box: 'Content box',
};

const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

function LayerStyleTab({
  layer,
  parent,
  slider,
  device,
  advanced,
  onStyle,
  onResetStyle,
  onPos,
  onResetPos,
}: LayerPanelProps) {
  const { t } = useT();
  const s = layerStyle(layer, device, slider.autoMobile);
  const p = layerPos(layer, device, slider.autoMobile);
  const mark = (key: keyof LayerStyle) => (
    <Marker
      device={device}
      shown={isOverridden(layer.style, device, key)}
      onReset={() => onResetStyle(key)}
    />
  );
  const textual = TEXTUAL.includes(layer.type) || layer.type === 'icon';
  const autoMobile =
    device === 'mobile' &&
    slider.autoMobile &&
    !(layer.pos.mobile && Object.keys(layer.pos.mobile).length) &&
    TEXTUAL.includes(layer.type);
  return (
    <div>
      {textual && (
        <Section title={layer.type === 'icon' ? t('Icon') : t('Text')}>
          {layer.type !== 'icon' && (
            <Field label={t('Font')} marker={mark('fontFamily')}>
              <select
                className="dst-select"
                value={s.fontFamily}
                onChange={(e) => onStyle('fontFamily', e.target.value as FontFamily)}
              >
                <option value="inherit">{t('The site’s')}</option>
                <option value="sans">{t('Sans serif')}</option>
                <option value="serif">{t('Serif')}</option>
                <option value="display">{t('Display')}</option>
                <option value="mono">{t('Monospace')}</option>
              </select>
            </Field>
          )}
          <Field
            label={layer.type === 'icon' ? t('Size') : t('Font size')}
            marker={mark('fontSize')}
          >
            <NumberInput
              label={t('Font size')}
              value={s.fontSize}
              min={8}
              max={layer.type === 'icon' ? 240 : 160}
              unit="px"
              onChange={(v) => onStyle('fontSize', v)}
            />
          </Field>
          {layer.type !== 'icon' && (
            <>
              <div className="dst-grid2">
                <Field label={t('Weight')} marker={mark('fontWeight')}>
                  <select
                    className="dst-select"
                    value={s.fontWeight}
                    onChange={(e) => onStyle('fontWeight', Number(e.target.value))}
                  >
                    {WEIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('Line height')} marker={mark('lineHeight')}>
                  <NumberInput
                    label={t('Line height')}
                    value={s.lineHeight}
                    min={0.8}
                    max={3}
                    step={0.05}
                    range={false}
                    onChange={(v) => onStyle('lineHeight', v)}
                  />
                </Field>
              </div>
              {advanced && (
                <Field label={t('Letter spacing')} marker={mark('letterSpacing')}>
                  <NumberInput
                    label={t('Letter spacing')}
                    value={s.letterSpacing}
                    min={-0.2}
                    max={1}
                    step={0.01}
                    unit="em"
                    onChange={(v) => onStyle('letterSpacing', v)}
                  />
                </Field>
              )}
              <div className="dst-row" style={{ marginBottom: 12 }}>
                <Toggle
                  label={t('Capitals')}
                  checked={s.uppercase}
                  onChange={(v) => onStyle('uppercase', v)}
                />
                <span style={{ width: 16 }} />
                <Toggle
                  label={t('Italic')}
                  checked={s.italic}
                  onChange={(v) => onStyle('italic', v)}
                />
              </div>
              {(layer.type === 'box' ||
                ((layer.type === 'heading' || layer.type === 'text') && !parent)) && (
                <Field label={t('Alignment')} marker={mark('textAlign')}>
                  <Segmented
                    label={t('Alignment')}
                    value={s.textAlign}
                    options={[
                      { value: 'left', label: t('Left') },
                      { value: 'center', label: t('Centre') },
                      { value: 'right', label: t('Right') },
                    ]}
                    onChange={(v) => onStyle('textAlign', v)}
                  />
                </Field>
              )}
            </>
          )}
          <Field label={t('Colour')} marker={mark('color')}>
            <ColorInput
              label={t('Colour')}
              value={s.color}
              allowTransparent={false}
              onChange={(v) => onStyle('color', v)}
            />
          </Field>
        </Section>
      )}
      {(layer.type === 'button' ||
        layer.type === 'box' ||
        layer.type === 'shape' ||
        layer.type === 'heading' ||
        layer.type === 'text') && (
        <Section title={layer.type === 'shape' ? t('Fill') : t('Background and border')}>
          <Field label={t('Background')} marker={mark('background')}>
            <ColorInput
              label={t('Background')}
              value={s.background}
              onChange={(v) => onStyle('background', v)}
            />
          </Field>
          {layer.type !== 'shape' && (
            <div className="dst-grid2">
              <Field label={t('Space inside, sides')} marker={mark('paddingX')}>
                <NumberInput
                  label={t('Space inside, sides')}
                  value={s.paddingX}
                  min={0}
                  max={200}
                  range={false}
                  unit="px"
                  onChange={(v) => onStyle('paddingX', v)}
                />
              </Field>
              <Field label={t('Space inside, top and bottom')} marker={mark('paddingY')}>
                <NumberInput
                  label={t('Space inside, top and bottom')}
                  value={s.paddingY}
                  min={0}
                  max={200}
                  range={false}
                  unit="px"
                  onChange={(v) => onStyle('paddingY', v)}
                />
              </Field>
            </div>
          )}
          {layer.type === 'box' && (
            <Field label={t('Space between its layers')} marker={mark('gap')}>
              <NumberInput
                label={t('Space between its layers')}
                value={s.gap}
                min={0}
                max={120}
                unit="px"
                onChange={(v) => onStyle('gap', v)}
              />
            </Field>
          )}
          <Field label={t('Rounded corners')} marker={mark('radius')}>
            <NumberInput
              label={t('Rounded corners')}
              value={Math.min(s.radius, 100)}
              min={0}
              max={100}
              unit="px"
              onChange={(v) => onStyle('radius', v)}
            />
          </Field>
          <div className="dst-grid2">
            <Field
              label={
                layer.type === 'shape' && layer.content.shape === 'line'
                  ? t('Thickness')
                  : t('Border')
              }
              marker={mark('borderWidth')}
            >
              <NumberInput
                label={t('Border')}
                value={s.borderWidth}
                min={0}
                max={20}
                range={false}
                unit="px"
                onChange={(v) => onStyle('borderWidth', v)}
              />
            </Field>
            {!(layer.type === 'shape' && layer.content.shape === 'line') && (
              <Field label={t('Border colour')} marker={mark('borderColor')}>
                <ColorInput
                  label={t('Border colour')}
                  value={s.borderColor}
                  allowTransparent={false}
                  onChange={(v) => onStyle('borderColor', v)}
                />
              </Field>
            )}
          </div>
        </Section>
      )}
      {layer.type === 'image' && (
        <Section title={t('Picture')}>
          <Field label={t('Rounded corners')} marker={mark('radius')}>
            <NumberInput
              label={t('Rounded corners')}
              value={Math.min(s.radius, 100)}
              min={0}
              max={100}
              unit="px"
              onChange={(v) => onStyle('radius', v)}
            />
          </Field>
        </Section>
      )}
      <Section title={t('Effects')}>
        <Toggle label={t('Shadow')} checked={s.shadow} onChange={(v) => onStyle('shadow', v)} />
        <Field label={t('Opacity')} marker={mark('opacity')}>
          <NumberInput
            label={t('Opacity')}
            value={Math.round(s.opacity * 100)}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onStyle('opacity', v / 100)}
          />
        </Field>
      </Section>
      {!parent && (
        <Section title={t('Position on the {device}', { device: t(DEVICE_NAMES[device]) })}>
          {autoMobile && (
            <p className="dst-help" style={{ margin: '0 0 10px' }}>
              {t(
                'Automatic on phones: wide and centred so it reads well. Move or resize it to set it by hand.',
              )}
            </p>
          )}
          {device !== 'desktop' && layer.pos[device] && (
            <p style={{ margin: '0 0 10px' }}>
              <button type="button" className="dst-reset" onClick={onResetPos}>
                {t('Use the position of the larger device')}
              </button>
            </p>
          )}
          <div className="dst-row" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span className="dst-label" style={{ marginBottom: 4 }}>
                {t('Point that is placed')}
              </span>
              <AnchorGrid
                label={t('Point that is placed')}
                value={p.anchor}
                onChange={(anchor) => onPos({ anchor })}
              />
            </div>
            <div className="dst-grow">
              <Field label={t('From the left')}>
                <NumberInput
                  label={t('From the left')}
                  value={p.x}
                  min={-50}
                  max={150}
                  step={0.5}
                  range={false}
                  unit="%"
                  onChange={(x) => onPos({ x })}
                />
              </Field>
              <Field label={t('From the top')}>
                <NumberInput
                  label={t('From the top')}
                  value={p.y}
                  min={-50}
                  max={150}
                  step={0.5}
                  range={false}
                  unit="%"
                  onChange={(y) => onPos({ y })}
                />
              </Field>
            </div>
          </div>
          <div className="dst-grid2">
            <Field label={t('Width')} help={t('0: as wide as its content')}>
              <NumberInput
                label={t('Width')}
                value={p.w}
                min={0}
                max={100}
                range={false}
                unit="%"
                onChange={(w) => onPos({ w })}
              />
            </Field>
            {(layer.type === 'image' || layer.type === 'shape') && (
              <Field label={t('Height')} help={t('0: automatic')}>
                <NumberInput
                  label={t('Height')}
                  value={p.h}
                  min={0}
                  max={100}
                  range={false}
                  unit="%"
                  onChange={(h) => onPos({ h })}
                />
              </Field>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function MotionFields({
  value,
  onChange,
  advanced,
  label,
}: {
  value: Motion;
  onChange: (motion: Motion) => void;
  advanced: boolean;
  label: string;
}) {
  const { t } = useT();
  return (
    <>
      <Field label={label}>
        <select
          className="dst-select"
          value={value.preset}
          onChange={(e) => onChange({ ...value, preset: e.target.value as MotionId })}
        >
          {MOTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </Field>
      {value.preset !== 'none' && (
        <Field label={t('Starts after')}>
          <NumberInput
            label={t('Starts after')}
            value={value.delay / 1000}
            min={0}
            max={10}
            step={0.1}
            unit="s"
            onChange={(v) => onChange({ ...value, delay: Math.round(v * 1000) })}
          />
        </Field>
      )}
      {advanced && value.preset !== 'none' && (
        <div className="dst-grid2">
          <Field label={t('Lasts')}>
            <NumberInput
              label={t('Lasts')}
              value={value.duration}
              min={100}
              max={5000}
              step={50}
              range={false}
              unit="ms"
              onChange={(v) => onChange({ ...value, duration: v })}
            />
          </Field>
          <Field label={t('Easing')}>
            <select
              className="dst-select"
              value={value.easing}
              onChange={(e) => onChange({ ...value, easing: e.target.value as EasingId })}
            >
              {Object.entries(EASINGS).map(([id, e]) => (
                <option key={id} value={id}>
                  {t(e.label)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </>
  );
}

function LayerMotionTab({ layer, advanced, onChange, onPlay }: LayerPanelProps) {
  const { t } = useT();
  const set = (patch: Partial<Layer['motion']>, group?: string) =>
    onChange((l) => ({ ...l, motion: { ...l.motion, ...patch } }), group);
  return (
    <div>
      <Section title={t('Entrance')}>
        <MotionFields
          label={t('Effect')}
          value={layer.motion.in}
          advanced={advanced}
          onChange={(m) => set({ in: m }, `in:${layer.id}`)}
        />
        <Btn small icon={ICON.play} onClick={onPlay}>
          {t('Play')}
        </Btn>
      </Section>
      <Section title={t('Exit')}>
        <Toggle
          label={t('Leave with an effect before the next slide')}
          checked={layer.motion.out !== null}
          onChange={(on) => set({ out: on ? { ...defaultMotion('fade'), duration: 400 } : null })}
        />
        {layer.motion.out && (
          <MotionFields
            label={t('Effect')}
            value={layer.motion.out}
            advanced={advanced}
            onChange={(m) => set({ out: m }, `out:${layer.id}`)}
          />
        )}
      </Section>
      {layer.type === 'button' && (
        <Section title={t('Under the mouse')}>
          <Segmented
            label={t('Under the mouse')}
            value={layer.motion.hover}
            options={HOVERS.map((h) => ({ value: h.id, label: t(h.label) }))}
            onChange={(hover) => set({ hover })}
          />
        </Section>
      )}
      <p className="dst-help">
        {t(
          'Visitors who ask their device for less motion see every layer at once, without effects.',
        )}
      </p>
    </div>
  );
}

// ---- Slide ---------------------------------------------------------------------------

export function SlidePanel({
  slide,
  slider,
  advanced,
  onSlide,
  onPickMedia,
}: {
  slide: Slide;
  slider: SliderData;
  advanced: boolean;
  onSlide: (fn: (slide: Slide) => Slide, group?: string) => void;
  onPickMedia: (kind: 'image' | 'video', done: (ref: MediaRef) => void) => void;
}) {
  const { t } = useT();
  const bg = slide.background;
  const setBg = (patch: Partial<Slide['background']>, group?: string) =>
    onSlide((s) => ({ ...s, background: { ...s.background, ...patch } }), group);
  const posts = slider.source.kind === 'posts';
  return (
    <div>
      <Section title={t('Background')}>
        <Segmented
          label={t('Background')}
          value={bg.kind}
          options={[
            { value: 'image', label: t('Picture') },
            { value: 'color', label: t('Colour') },
            { value: 'gradient', label: t('Gradient') },
            { value: 'video', label: t('Video') },
          ]}
          onChange={(kind) => setBg({ kind })}
        />
        <div style={{ height: 12 }} />
        {posts && (
          <Toggle
            label={t('The post’s featured image, when it has one')}
            checked={bg.featured}
            onChange={(featured) => setBg({ featured })}
          />
        )}
        {(bg.kind === 'image' || bg.kind === 'video') && (
          <>
            {bg.image ? (
              <>
                <FocalPicker
                  url={bg.image.url}
                  value={bg.focal}
                  onChange={(focal) => setBg({ focal })}
                />
                <div className="dst-row" style={{ marginBottom: 12 }}>
                  <Btn
                    small
                    icon={ICON.image}
                    onClick={() => onPickMedia('image', (image) => setBg({ image, focal: null }))}
                  >
                    {t('Replace')}
                  </Btn>
                  <Btn small kind="danger" onClick={() => setBg({ image: null })}>
                    {t('Remove')}
                  </Btn>
                </div>
              </>
            ) : (
              <Btn
                icon={ICON.image}
                onClick={() => onPickMedia('image', (image) => setBg({ image }))}
                style={{ marginBottom: 12 }}
              >
                {bg.kind === 'video'
                  ? t('Choose a picture shown before the video')
                  : t('Choose a picture')}
              </Btn>
            )}
            {bg.image && (
              <>
                <Toggle
                  label={t('Only decoration (screen readers skip it)')}
                  checked={bg.decorative}
                  onChange={(decorative) => setBg({ decorative })}
                />
                {!bg.decorative && (
                  <Field label={t('Alternative text')} help={t('Empty: the library’s.')}>
                    <input
                      className="dst-input"
                      value={bg.alt}
                      onChange={(e) => setBg({ alt: e.target.value }, 'bg-alt')}
                    />
                  </Field>
                )}
              </>
            )}
          </>
        )}
        {bg.kind === 'video' && (
          <>
            <Field label={t('Video from')}>
              <Segmented
                label={t('Video from')}
                value={bg.video.source}
                options={[
                  { value: 'mp4', label: t('Media library') },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'vimeo', label: 'Vimeo' },
                ]}
                onChange={(source) => setBg({ video: { ...bg.video, source } })}
              />
            </Field>
            {bg.video.source === 'mp4' ? (
              <div className="dst-field">
                {bg.video.media && (
                  <span className="dst-help">{bg.video.media.url.split('/').pop()}</span>
                )}
                <Btn
                  small
                  icon={ICON.play}
                  onClick={() =>
                    onPickMedia('video', (media) => setBg({ video: { ...bg.video, media } }))
                  }
                >
                  {bg.video.media ? t('Replace the video') : t('Choose an MP4 video')}
                </Btn>
              </div>
            ) : (
              <Field
                label={t('Address of the video')}
                help={t(
                  'It plays without sound, in a privacy-friendly player; with the Privacy plugin it waits for the visitor’s consent, and the picture shows until then.',
                )}
              >
                <input
                  className="dst-input"
                  value={bg.video.url}
                  placeholder={
                    bg.video.source === 'youtube'
                      ? 'https://www.youtube.com/watch?v=…'
                      : 'https://vimeo.com/…'
                  }
                  onChange={(e) =>
                    setBg({ video: { ...bg.video, url: e.target.value } }, 'video-url')
                  }
                />
              </Field>
            )}
          </>
        )}
        {bg.kind === 'gradient' ? (
          <>
            <div className="dst-grid2">
              <Field label={t('From')}>
                <ColorInput
                  label={t('From')}
                  value={bg.gradient.from}
                  allowTransparent={false}
                  onChange={(from) => setBg({ gradient: { ...bg.gradient, from } }, 'g-from')}
                />
              </Field>
              <Field label={t('To')}>
                <ColorInput
                  label={t('To')}
                  value={bg.gradient.to}
                  allowTransparent={false}
                  onChange={(to) => setBg({ gradient: { ...bg.gradient, to } }, 'g-to')}
                />
              </Field>
            </div>
            <Field label={t('Kind')}>
              <Segmented
                label={t('Kind')}
                value={bg.gradient.type}
                options={[
                  { value: 'linear', label: t('Linear') },
                  { value: 'radial', label: t('Radial') },
                ]}
                onChange={(type) => setBg({ gradient: { ...bg.gradient, type } })}
              />
            </Field>
            {bg.gradient.type === 'linear' && (
              <Field label={t('Angle')}>
                <NumberInput
                  label={t('Angle')}
                  value={bg.gradient.angle}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(angle) => setBg({ gradient: { ...bg.gradient, angle } }, 'g-angle')}
                />
              </Field>
            )}
          </>
        ) : (
          <Field label={bg.kind === 'color' ? t('Colour') : t('Colour while the picture loads')}>
            <ColorInput
              label={t('Colour')}
              value={bg.color}
              allowTransparent={false}
              onChange={(color) => setBg({ color }, 'bg-color')}
            />
          </Field>
        )}
      </Section>
      <Section title={t('Shade over the background')}>
        <Field label={t('How dark')} help={t('Makes texts easier to read over a picture.')}>
          <NumberInput
            label={t('How dark')}
            value={Math.round(slide.overlay.opacity * 100)}
            min={0}
            max={90}
            unit="%"
            onChange={(v) =>
              onSlide((s) => ({ ...s, overlay: { ...s.overlay, opacity: v / 100 } }), 'overlay')
            }
          />
        </Field>
        {slide.overlay.opacity > 0 && (
          <Field label={t('Colour')}>
            <ColorInput
              label={t('Colour')}
              value={slide.overlay.color}
              allowTransparent={false}
              onChange={(color) =>
                onSlide((s) => ({ ...s, overlay: { ...s.overlay, color } }), 'overlay-color')
              }
            />
          </Field>
        )}
      </Section>
      {slider.type !== 'hero' && (
        <Section title={t('This slide')}>
          {(bg.kind === 'image' || bg.kind === 'gradient') && (
            <Field label={t('Slow movement (Ken Burns)')}>
              <select
                className="dst-select"
                value={slide.kenBurns}
                onChange={(e) =>
                  onSlide((s) => ({ ...s, kenBurns: e.target.value as Slide['kenBurns'] }))
                }
              >
                {KEN_BURNS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {t(k.label)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('Transition to this slide')}>
            <select
              className="dst-select"
              value={slide.transition}
              onChange={(e) =>
                onSlide((s) => ({ ...s, transition: e.target.value as TransitionId | '' }))
              }
            >
              <option value="">{t('The slider’s')}</option>
              {TRANSITIONS.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {t(tr.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Stays for')} help={t('0: the slider’s time.')}>
            <NumberInput
              label={t('Stays for')}
              value={slide.duration / 1000}
              min={0}
              max={60}
              step={0.5}
              unit="s"
              onChange={(v) =>
                onSlide((s) => ({ ...s, duration: Math.round(v * 1000) }), 'duration')
              }
            />
          </Field>
          <LinkEditor
            label={t('The whole slide leads to')}
            value={slide.link}
            posts={posts}
            onChange={(link) => onSlide((s) => ({ ...s, link }))}
          />
          <Field
            label={t('Name of the slide')}
            help={t('Read by screen readers with the slide’s number.')}
          >
            <input
              className="dst-input"
              value={slide.name}
              onChange={(e) => onSlide((s) => ({ ...s, name: e.target.value }), 'slide-name')}
            />
          </Field>
          {advanced && (
            <Toggle
              label={t('Hidden (kept, but not shown)')}
              checked={slide.hidden}
              onChange={(hidden) => onSlide((s) => ({ ...s, hidden }))}
            />
          )}
        </Section>
      )}
    </div>
  );
}

// ---- Slider --------------------------------------------------------------------------

export function SliderPanel({
  slider,
  device,
  advanced,
  alias,
  onSlider,
  onAlias,
}: {
  slider: SliderData;
  device: Device;
  advanced: boolean;
  alias: string;
  onSlider: (fn: (slider: SliderData) => SliderData, group?: string) => void;
  onAlias: (alias: string) => void;
}) {
  const { t } = useT();
  const size = valueFor(slider.size, device);
  const setSize = (patch: Partial<SizeValues>) =>
    onSlider(
      (s) =>
        device === 'desktop'
          ? { ...s, size: { ...s.size, base: { ...s.size.base, ...patch } } }
          : { ...s, size: { ...s.size, [device]: { ...s.size[device], ...patch } } },
      `size:${device}:${Object.keys(patch).join()}`,
    );
  const nav = slider.navigation;
  const setNav = (patch: Partial<SliderData['navigation']>, group?: string) =>
    onSlider((s) => ({ ...s, navigation: { ...s.navigation, ...patch } }), group);
  const auto = slider.autoplay;
  const setAuto = (patch: Partial<SliderData['autoplay']>, group?: string) =>
    onSlider((s) => ({ ...s, autoplay: { ...s.autoplay, ...patch } }), group);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    if (slider.source.kind !== 'posts') return;
    api<unknown>('GET', '/taxonomies/category/terms?limit=100')
      .then((res) => {
        const list = Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? []);
        setCategories(
          (list as { slug: string; name: string }[]).map((c) => ({ slug: c.slug, name: c.name })),
        );
      })
      .catch(() => setCategories([]));
  }, [slider.source.kind]);
  const [copied, setCopied] = useState(false);
  const shortcode = `[diorama alias="${alias}"]`;
  return (
    <div>
      <Section title={t('Kind')}>
        <Segmented
          label={t('Kind')}
          value={slider.type}
          options={[
            { value: 'slider', label: t('Slider') },
            { value: 'hero', label: t('Hero (one scene)') },
          ]}
          onChange={(type) => onSlider((s) => ({ ...s, type }))}
        />
        <div style={{ height: 12 }} />
        <Field label={t('Size')}>
          <Segmented
            label={t('Size')}
            value={slider.layout}
            options={[
              { value: 'auto', label: t('In the content') },
              { value: 'fullwidth', label: t('Full width') },
              { value: 'fullscreen', label: t('Full screen') },
            ]}
            onChange={(layout) => onSlider((s) => ({ ...s, layout }))}
          />
        </Field>
        {slider.layout === 'fullscreen' ? (
          <Field
            label={t('Room for the header on the {device}', { device: t(DEVICE_NAMES[device]) })}
            help={t('The height of a fixed header, taken from the screen’s height.')}
          >
            <NumberInput
              label={t('Room for the header')}
              value={size.offset}
              min={0}
              max={400}
              unit="px"
              onChange={(offset) => setSize({ offset })}
            />
          </Field>
        ) : (
          <Field label={t('Height on the {device}', { device: t(DEVICE_NAMES[device]) })}>
            <NumberInput
              label={t('Height')}
              value={size.height}
              min={120}
              max={1400}
              step={10}
              unit="px"
              onChange={(height) => setSize({ height })}
            />
          </Field>
        )}
        {slider.layout === 'auto' && (
          <Field label={t('Widest it gets')} help={t('0: the width of the page’s content.')}>
            <NumberInput
              label={t('Widest it gets')}
              value={slider.maxWidth}
              min={0}
              max={2400}
              step={10}
              range={false}
              unit="px"
              onChange={(maxWidth) => onSlider((s) => ({ ...s, maxWidth }), 'max')}
            />
          </Field>
        )}
        <Toggle
          label={t('Readable layout on phones, by itself')}
          checked={slider.autoMobile}
          onChange={(autoMobile) => onSlider((s) => ({ ...s, autoMobile }))}
        />
      </Section>
      {slider.type !== 'hero' && (
        <>
          <Section title={t('Changing slides')}>
            <Field label={t('Transition')}>
              <select
                className="dst-select"
                value={slider.transition.effect}
                onChange={(e) =>
                  onSlider((s) => ({
                    ...s,
                    transition: { ...s.transition, effect: e.target.value as TransitionId },
                  }))
                }
              >
                {TRANSITIONS.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {t(tr.label)}
                  </option>
                ))}
              </select>
            </Field>
            {advanced && (
              <div className="dst-grid2">
                <Field label={t('Lasts')}>
                  <NumberInput
                    label={t('Lasts')}
                    value={slider.transition.duration}
                    min={0}
                    max={4000}
                    step={50}
                    range={false}
                    unit="ms"
                    onChange={(duration) =>
                      onSlider(
                        (s) => ({ ...s, transition: { ...s.transition, duration } }),
                        'tr-dur',
                      )
                    }
                  />
                </Field>
                <Field label={t('Easing')}>
                  <select
                    className="dst-select"
                    value={slider.transition.easing}
                    onChange={(e) =>
                      onSlider((s) => ({
                        ...s,
                        transition: { ...s.transition, easing: e.target.value as EasingId },
                      }))
                    }
                  >
                    {Object.entries(EASINGS).map(([id, e]) => (
                      <option key={id} value={id}>
                        {t(e.label)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Toggle
              label={t('Play by itself')}
              checked={auto.enabled}
              onChange={(enabled) => setAuto({ enabled })}
            />
            {auto.enabled && (
              <>
                <Field label={t('Each slide stays')}>
                  <NumberInput
                    label={t('Each slide stays')}
                    value={auto.delay / 1000}
                    min={1.5}
                    max={60}
                    step={0.5}
                    unit="s"
                    onChange={(v) => setAuto({ delay: Math.round(v * 1000) }, 'delay')}
                  />
                </Field>
                <Toggle
                  label={t('Pause under the mouse')}
                  checked={auto.pauseOnHover}
                  onChange={(pauseOnHover) => setAuto({ pauseOnHover })}
                />
              </>
            )}
            <Toggle
              label={t('Start again after the last slide')}
              checked={auto.loop}
              onChange={(loop) => setAuto({ loop })}
            />
            <p className="dst-help" style={{ marginTop: 0 }}>
              {t(
                'A pause button is always shown while slides play by themselves, and they stop on focus and for visitors who ask for less motion.',
              )}
            </p>
          </Section>
          <Section title={t('Navigation')}>
            <Toggle
              label={t('Arrows')}
              checked={nav.arrows}
              onChange={(arrows) => setNav({ arrows })}
            />
            {nav.arrows && (
              <Toggle
                label={t('Hide the arrows on phones (swipe instead)')}
                checked={nav.hideArrowsOnMobile}
                onChange={(hideArrowsOnMobile) => setNav({ hideArrowsOnMobile })}
              />
            )}
            <Toggle
              label={t('Dots')}
              checked={nav.bullets}
              onChange={(bullets) => setNav({ bullets })}
            />
            <Toggle
              label={t('Progress bar')}
              checked={nav.progress}
              onChange={(progress) => setNav({ progress })}
            />
            <div className="dst-field">
              <span className="dst-label">{t('Style')}</span>
              <div
                role="group"
                aria-label={t('Style')}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}
              >
                {NAV_STYLES.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    aria-pressed={nav.style === n.id}
                    onClick={() => setNav({ style: n.id })}
                    className="dst-btn dst-btn--small"
                    style={
                      nav.style === n.id
                        ? { borderColor: '#4f46e5', background: '#eef2ff', color: '#3730a3' }
                        : undefined
                    }
                  >
                    {t(n.label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="dst-grid2">
              <Field label={t('Colour')}>
                <ColorInput
                  label={t('Colour')}
                  value={nav.color}
                  allowTransparent={false}
                  onChange={(color) => setNav({ color }, 'nav-color')}
                />
              </Field>
              <Field label={t('Size')}>
                <NumberInput
                  label={t('Size')}
                  value={nav.size}
                  min={24}
                  max={80}
                  range={false}
                  unit="px"
                  onChange={(v) => setNav({ size: v }, 'nav-size')}
                />
              </Field>
            </div>
          </Section>
        </>
      )}
      <Section title={t('Slides')}>
        <Segmented
          label={t('Slides')}
          value={slider.source.kind}
          options={[
            { value: 'manual', label: t('Made here') },
            { value: 'posts', label: t('Latest posts') },
          ]}
          onChange={(kind) =>
            onSlider((s) => ({
              ...s,
              source:
                kind === 'posts'
                  ? { kind: 'posts', count: 5, category: '', excerptLength: 140 }
                  : { kind: 'manual' },
            }))
          }
        />
        {slider.source.kind === 'posts' && (
          <div style={{ marginTop: 12 }}>
            <p className="dst-help" style={{ marginTop: 0 }}>
              {t(
                'The first slide is the model: each post gets a copy, with {{title}}, {{excerpt}}, {{date}}, {{category}} and {{author}} filled in, and links to “the post of the slide”.',
              )}
            </p>
            <div className="dst-grid2">
              <Field label={t('How many posts')}>
                <NumberInput
                  label={t('How many posts')}
                  value={slider.source.count}
                  min={1}
                  max={20}
                  range={false}
                  onChange={(count) =>
                    onSlider(
                      (s) =>
                        s.source.kind === 'posts' ? { ...s, source: { ...s.source, count } } : s,
                      'count',
                    )
                  }
                />
              </Field>
              <Field label={t('Excerpt length')}>
                <NumberInput
                  label={t('Excerpt length')}
                  value={slider.source.excerptLength}
                  min={0}
                  max={600}
                  range={false}
                  unit={t('characters')}
                  onChange={(excerptLength) =>
                    onSlider(
                      (s) =>
                        s.source.kind === 'posts'
                          ? { ...s, source: { ...s.source, excerptLength } }
                          : s,
                      'excerpt',
                    )
                  }
                />
              </Field>
            </div>
            <Field label={t('Category')}>
              <select
                className="dst-select"
                value={slider.source.category}
                onChange={(e) =>
                  onSlider((s) =>
                    s.source.kind === 'posts'
                      ? { ...s, source: { ...s.source, category: e.target.value } }
                      : s,
                  )
                }
              >
                <option value="">{t('Every category')}</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Section>
      <Section title={t('Use it')}>
        <p className="dst-help" style={{ marginTop: 0 }}>
          {t(
            'Add the “Slider (Diorama)” block to a page, or the Slider widget in Fresco. Elsewhere, this shortcode alone in a paragraph:',
          )}
        </p>
        <div className="dst-row" style={{ marginBottom: 10 }}>
          <code className="dst-kbd dst-grow" style={{ padding: '6px 8px', overflow: 'auto' }}>
            {shortcode}
          </code>
          <Btn
            small
            icon={copied ? ICON.check : ICON.copy}
            onClick={() =>
              void navigator.clipboard?.writeText(shortcode).then(() => setCopied(true))
            }
          >
            {copied ? t('Copied') : t('Copy')}
          </Btn>
        </div>
        <Field
          label={t('Short name')}
          help={t('Used by the shortcode; letters, digits and dashes.')}
        >
          <input
            className="dst-input"
            defaultValue={alias}
            onBlur={(e) => e.target.value !== alias && onAlias(e.target.value)}
          />
        </Field>
      </Section>
    </div>
  );
}
