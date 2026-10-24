/**
 * The slider editor: slides and layers on the left, the slide on the canvas
 * (drag, resize, a device switch), the Content, Style and Motion of the
 * selected layer on the right, undo and redo, a live preview with the real
 * runtime, and Save (Ctrl/⌘+S).
 */
import { useT } from '@cleitext/admin-sdk';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { expandPosts } from '../model/posts';
import { mergeDecorators, SliderView, type RenderInput, type RenderMedia } from '../render/render';
import { defaultLayer, defaultSlide } from '../model/normalize';
import { layerPos, resetFor, setFor } from '../model/resolve';
import type {
  Device,
  Layer,
  LayerPos,
  LayerStyle,
  LayerType,
  MediaRef,
  Slide,
  SliderData,
  SliderRecord,
} from '../model/types';
import { messageOf, sliderApi } from './api';
import { Canvas } from './canvas';
import { applyFonts, useSiteFonts, type SiteFonts } from './fonts';
import { useHistory } from './history';
import { MediaDialog, refOf, type MediaItem } from './media';
import {
  addLayer,
  cloneSlide,
  duplicateLayer,
  findLayer,
  insertSlide,
  moveLayer,
  moveSlide,
  removeLayer,
  removeSlide,
  updateLayer,
  updateSlide,
} from './ops';
import { LayerPanel, SlidePanel, SliderPanel, TYPE_NAMES, type PanelTab } from './panels';
import { proAdmin } from './pro';
import { Btn, Dialog, ICON, IconButton, Segmented, Svg, useToast } from './ui';

const NO_MEDIA = new Map<string, RenderMedia>();
const TEXTUAL = new Set<LayerType>(['heading', 'text', 'button', 'box']);

function readAdvanced(): boolean {
  try {
    return localStorage.getItem('diorama:advanced') === '1';
  } catch {
    return false;
  }
}

function slideSwatch(slide: Slide): string {
  const bg = slide.background;
  if ((bg.kind === 'image' || bg.kind === 'video') && bg.image)
    return `center/cover no-repeat url("${bg.image.url.replace(/"/g, '%22')}"), ${bg.color}`;
  if (bg.kind === 'gradient')
    return `linear-gradient(${bg.gradient.angle}deg, ${bg.gradient.from}, ${bg.gradient.to})`;
  return bg.color;
}

export function Studio({
  record,
  locale,
  version,
  onBack,
  onSaved,
}: {
  record: SliderRecord;
  locale: string;
  version: string;
  onBack: () => void;
  onSaved: (record: SliderRecord) => void;
}) {
  const { t } = useT();
  const history = useHistory<SliderData>(record.data);
  const slider = history.value;
  const [title, setTitle] = useState(record.title);
  const [alias, setAlias] = useState(record.alias);
  const saved = useRef({ data: record.data, title: record.title });
  const [slideIndex, setSlideIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [tab, setTab] = useState<PanelTab>('content');
  const [side, setSide] = useState<'slide' | 'slider'>('slide');
  const [advanced, setAdvancedState] = useState(readAdvanced);
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState(0);
  const [media, setMedia] = useState<{
    kind: 'image' | 'video';
    multiple: boolean;
    done: (items: MediaItem[]) => void;
  } | null>(null);
  const [preview, setPreview] = useState<{ slider: SliderData } | null>(null);
  const [toast, notify] = useToast();
  const dirty = slider !== saved.current.data || title !== saved.current.title;

  const slide = slider.slides[slideIndex];
  const found = findLayer(slide, selected);
  // The site's fonts and the slider's Google fonts, in the canvas too (Diorama 1.2).
  const fonts = useSiteFonts(slider);

  useEffect(() => {
    if (slideIndex >= slider.slides.length) setSlideIndex(Math.max(0, slider.slides.length - 1));
  }, [slider.slides.length, slideIndex]);
  useEffect(() => {
    if (selected && !findLayer(slider.slides[slideIndex], selected)) setSelected(null);
  }, [slider, slideIndex, selected]);

  const setAdvanced = (value: boolean) => {
    setAdvancedState(value);
    try {
      localStorage.setItem('diorama:advanced', value ? '1' : '0');
    } catch {
      // Remembered only when the browser allows it.
    }
  };

  // ---- Changes ---------------------------------------------------------------------

  const changeLayer = useCallback(
    (id: string, fn: (layer: Layer) => Layer, group?: string) =>
      history.change((s) => updateLayer(s, slideIndex, id, fn), group),
    [history, slideIndex],
  );

  /** A position change for the device shown, keeping the phone's automatic layout as a start. */
  const posWith = useCallback(
    (layer: Layer, patch: Partial<LayerPos>): Layer['pos'] => {
      if (device === 'desktop') return { ...layer.pos, base: { ...layer.pos.base, ...patch } };
      let current: Partial<LayerPos> = layer.pos[device] ?? {};
      if (
        Object.keys(current).length === 0 &&
        device === 'mobile' &&
        slider.autoMobile &&
        TEXTUAL.has(layer.type)
      )
        current = { ...layerPos(layer, 'mobile', true) };
      return { ...layer.pos, [device]: { ...current, ...patch } };
    },
    [device, slider.autoMobile],
  );

  const onCanvasMove = (id: string, patch: Partial<LayerPos>) =>
    history.preview((s) =>
      updateLayer(s, slideIndex, id, (l) => ({ ...l, pos: posWith(l, patch) })),
    );

  const addNewLayer = (type: LayerType) => {
    if (!slide) return;
    const layer = defaultLayer(type);
    const box = found ? (found.layer.type === 'box' ? found.layer : found.parent) : null;
    const into = box && type !== 'box' && type !== 'shape' ? box.id : null;
    if (into)
      layer.motion = {
        ...layer.motion,
        in: { ...layer.motion.in, delay: 100 * (box!.children.length + 1) },
      };
    history.change((s) => addLayer(s, slideIndex, layer, into));
    setSelected(layer.id);
    setTab('content');
  };

  const removeSelected = () => {
    if (!selected) return;
    history.change((s) => removeLayer(s, slideIndex, selected));
    setSelected(found?.parent?.id ?? null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    let copyId: string | null = null;
    history.change((s) => {
      const out = duplicateLayer(s, slideIndex, selected);
      copyId = out.id;
      return out.slider;
    });
    window.setTimeout(() => copyId && setSelected(copyId));
  };

  const addSlides = (items: MediaItem[]) => {
    const slides = items.map((item) =>
      defaultSlide({
        background: {
          ...defaultSlide().background,
          kind: 'image',
          color: '#111827',
          image: refOf(item),
        },
        kenBurns: 'zoom-in',
      }),
    );
    history.change((s) => ({ ...s, slides: [...s.slides, ...slides] }));
    setSlideIndex(slider.slides.length);
    setSelected(null);
  };

  const addBlankSlide = () => {
    const next = defaultSlide({ layers: [] });
    history.change((s) => insertSlide(s, slideIndex + 1, next));
    setSlideIndex(Math.min(slideIndex + 1, slider.slides.length));
    setSelected(null);
  };

  const pickMedia = (kind: 'image' | 'video', done: (ref: MediaRef) => void) =>
    setMedia({ kind, multiple: false, done: (items) => items[0] && done(refOf(items[0])) });

  // ---- Saving and preview ----------------------------------------------------------

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await sliderApi.save(record.id, { title, data: slider });
      saved.current = { data: slider, title };
      setAlias(out.alias);
      onSaved(out);
      notify(t('Saved'));
    } catch (error) {
      notify(messageOf(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAlias = async (value: string) => {
    try {
      const out = await sliderApi.save(record.id, { alias: value });
      setAlias(out.alias);
      notify(t('Saved'));
    } catch (error) {
      notify(messageOf(error), 'error');
    }
  };

  const openPreview = async () => {
    try {
      let shown = slider;
      if (slider.source.kind === 'posts')
        shown = expandPosts(
          slider,
          await sliderApi.postsSample(slider.source.count),
          locale,
        ).slider;
      setPreview({ slider: shown });
    } catch (error) {
      notify(messageOf(error), 'error');
    }
  };

  // Keyboard: undo, redo, save, delete, duplicate, nudge.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (media || preview) return;
    const mod = e.ctrlKey || e.metaKey;
    const typing = (e.target as HTMLElement).closest?.(
      'input, textarea, select, [contenteditable="true"]',
    );
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      history.redo();
    } else if (mod && e.key.toLowerCase() === 'd' && selected) {
      e.preventDefault();
      duplicateSelected();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      removeSelected();
    } else if (e.key === 'Escape' && selected) {
      setSelected(found?.parent?.id ?? null);
    } else if (selected && found && !found.parent && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 0.5;
      const p = layerPos(found.layer, device, slider.autoMobile);
      const patch =
        e.key === 'ArrowLeft'
          ? { x: p.x - step }
          : e.key === 'ArrowRight'
            ? { x: p.x + step }
            : e.key === 'ArrowUp'
              ? { y: p.y - step }
              : { y: p.y + step };
      changeLayer(selected, (l) => ({ ...l, pos: posWith(l, patch) }), `nudge:${selected}`);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const extensions = useMemo(() => proAdmin(), []);

  // ---- Layout ----------------------------------------------------------------------

  const layerRow = (layer: Layer, depth: number) => {
    const label = layer.name || layer.content.text.split('\n')[0] || t(TYPE_NAMES[layer.type]);
    const hidden = layer.hide[device];
    return (
      <div key={layer.id}>
        <div
          className="dst-row"
          style={{
            gap: 4,
            padding: '2px 4px',
            paddingLeft: 4 + depth * 16,
            borderRadius: 7,
            background: selected === layer.id ? '#eef2ff' : undefined,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelected(layer.id);
              setTab('content');
            }}
            className="dst-btn dst-btn--ghost dst-btn--small dst-grow"
            style={{ justifyContent: 'flex-start', opacity: hidden ? 0.5 : 1, minWidth: 0 }}
            aria-current={selected === layer.id ? 'true' : undefined}
          >
            <Svg path={ICON[layer.type as keyof typeof ICON] ?? ICON.text} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          </button>
          <IconButton
            icon={hidden ? ICON.eyeOff : ICON.eye}
            label={hidden ? t('Show on this device') : t('Hide on this device')}
            onClick={() =>
              changeLayer(layer.id, (l) => ({
                ...l,
                hide: { ...l.hide, [device]: !l.hide[device] },
              }))
            }
          />
        </div>
        {layer.children.map((child) => layerRow(child, depth + 1))}
      </div>
    );
  };

  const layerTools = found && (
    <div className="dst-row" style={{ gap: 2, padding: '4px 0', borderTop: '1px solid #e2e8f0' }}>
      <IconButton
        icon={ICON.up}
        label={t('Move up')}
        onClick={() =>
          history.change((s) => moveLayer(s, slideIndex, found.layer.id, found.parent ? -1 : 1))
        }
      />
      <IconButton
        icon={ICON.down}
        label={t('Move down')}
        onClick={() =>
          history.change((s) => moveLayer(s, slideIndex, found.layer.id, found.parent ? 1 : -1))
        }
      />
      <IconButton icon={ICON.copy} label={t('Duplicate (Ctrl+D)')} onClick={duplicateSelected} />
      <IconButton icon={ICON.trash} label={t('Delete (Del)')} onClick={removeSelected} />
    </div>
  );

  const addButtons: { type: LayerType; label: string }[] = [
    { type: 'heading', label: 'Heading' },
    { type: 'text', label: 'Text' },
    { type: 'button', label: 'Button' },
    { type: 'image', label: 'Image' },
    { type: 'icon', label: 'Icon' },
    { type: 'shape', label: 'Shape' },
    { type: 'box', label: 'Content box' },
  ];

  return (
    <div
      className="dst"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 96px)',
        minHeight: 620,
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {/* Top bar */}
      <div
        className="dst-row"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e2e8f0',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <Btn
          kind="ghost"
          icon={ICON.back}
          onClick={() =>
            dirty && !window.confirm(t('Leave without saving the changes?')) ? null : onBack()
          }
        >
          {t('Sliders')}
        </Btn>
        <input
          className="dst-input"
          style={{ width: 240, fontWeight: 600 }}
          aria-label={t('Title of the slider')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="dst-grow" />
        <div className="dst-row" role="group" aria-label={t('Device')} style={{ gap: 2 }}>
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <IconButton
              key={d}
              icon={ICON[d]}
              label={t(d === 'desktop' ? 'Computer' : d === 'tablet' ? 'Tablet' : 'Phone')}
              pressed={device === d}
              onClick={() => setDevice(d)}
              data-testid={`dio-device-${d}`}
            />
          ))}
        </div>
        <div className="dst-row" style={{ gap: 2 }}>
          <IconButton
            icon={ICON.undo}
            label={t('Undo (Ctrl+Z)')}
            disabled={!history.canUndo}
            onClick={history.undo}
          />
          <IconButton
            icon={ICON.redo}
            label={t('Redo (Ctrl+Shift+Z)')}
            disabled={!history.canRedo}
            onClick={history.redo}
          />
        </div>
        <label className="dst-toggle" style={{ margin: 0 }}>
          <span>{t('Advanced')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />
          <span className="dst-switch" aria-hidden="true" />
        </label>
        <Btn icon={ICON.eyePreview} onClick={() => void openPreview()}>
          {t('Preview')}
        </Btn>
        <Btn kind="primary" disabled={busy} onClick={() => void save()} data-testid="dio-save">
          {busy ? t('Saving…') : dirty ? t('Save') : t('Saved')}
        </Btn>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Slides and layers */}
        <aside
          style={{
            width: 230,
            flex: 'none',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
          aria-label={t('Slides and layers')}
        >
          <div style={{ padding: 10, overflow: 'auto', flex: '1 1 50%' }}>
            <div className="dst-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: 13 }}>{t('Slides')}</h3>
              <div className="dst-row" style={{ gap: 2 }}>
                <IconButton
                  icon={ICON.image}
                  label={t('Add slides from pictures')}
                  onClick={() => setMedia({ kind: 'image', multiple: true, done: addSlides })}
                />
                <IconButton
                  icon={ICON.plus}
                  label={t('Add a blank slide')}
                  onClick={addBlankSlide}
                />
              </div>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {slider.slides.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="dst-card"
                    aria-current={i === slideIndex ? 'true' : undefined}
                    onClick={() => {
                      setSlideIndex(i);
                      setSelected(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 5,
                      borderColor: i === slideIndex ? '#4f46e5' : undefined,
                      boxShadow: i === slideIndex ? '0 0 0 2px #c7d2fe' : undefined,
                      opacity: s.hidden ? 0.55 : 1,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 54,
                        height: 34,
                        borderRadius: 5,
                        background: slideSwatch(s),
                        flex: 'none',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {i + 1}. {s.name || t('Slide')}
                      {slider.type === 'hero' && i > 0 ? ` · ${t('not shown in a hero')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {slide && (
              <div className="dst-row" style={{ gap: 2, marginTop: 6 }}>
                <IconButton
                  icon={ICON.up}
                  label={t('Move the slide up')}
                  disabled={slideIndex === 0}
                  onClick={() => (
                    history.change((s) => moveSlide(s, slideIndex, -1)),
                    setSlideIndex(slideIndex - 1)
                  )}
                />
                <IconButton
                  icon={ICON.down}
                  label={t('Move the slide down')}
                  disabled={slideIndex >= slider.slides.length - 1}
                  onClick={() => (
                    history.change((s) => moveSlide(s, slideIndex, 1)),
                    setSlideIndex(slideIndex + 1)
                  )}
                />
                <IconButton
                  icon={ICON.copy}
                  label={t('Duplicate the slide')}
                  onClick={() => {
                    history.change((s) =>
                      insertSlide(s, slideIndex + 1, cloneSlide(s.slides[slideIndex]!)),
                    );
                    setSlideIndex(slideIndex + 1);
                  }}
                />
                <IconButton
                  icon={ICON.trash}
                  label={t('Delete the slide')}
                  onClick={() => {
                    if (!window.confirm(t('Delete this slide?'))) return;
                    history.change((s) => removeSlide(s, slideIndex));
                    setSelected(null);
                  }}
                />
              </div>
            )}
          </div>
          <div
            style={{
              padding: 10,
              overflow: 'auto',
              flex: '1 1 50%',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>{t('Layers')}</h3>
            {slide && slide.layers.length === 0 && (
              <p className="dst-help">{t('No layers: add one above the slide.')}</p>
            )}
            {slide && [...slide.layers].reverse().map((layer) => layerRow(layer, 0))}
            {layerTools}
          </div>
        </aside>

        {/* Canvas */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            className="dst-row"
            role="toolbar"
            aria-label={t('Add a layer')}
            style={{
              padding: '6px 10px',
              borderBottom: '1px solid #e2e8f0',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            <span className="dst-help" style={{ marginRight: 4 }}>
              {t('Add')}
            </span>
            {addButtons.map((b) => (
              <Btn
                key={b.type}
                small
                icon={ICON[b.type as keyof typeof ICON]}
                disabled={!slide}
                onClick={() => addNewLayer(b.type)}
                data-testid={`dio-add-${b.type}`}
              >
                {t(b.label)}
              </Btn>
            ))}
            <div className="dst-grow" />
            <span className="dst-help">
              {t('Drag layers on the slide; arrows move the selected one.')}
            </span>
          </div>
          <Canvas
            slider={slider}
            title={title}
            slideIndex={slideIndex}
            device={device}
            selected={selected}
            locale={locale}
            motion={motion}
            onSelect={(id) => {
              setSelected(id);
              if (id) setTab((tb) => tb);
            }}
            onMove={onCanvasMove}
            onCommit={history.commit}
            onEditText={(id) => {
              setSelected(id);
              setTab('content');
              window.setTimeout(
                () => document.querySelector<HTMLElement>('[data-dio-text]')?.focus(),
                30,
              );
            }}
          />
          {extensions.canvasPanels
            .filter((panel) => advanced || !panel.advancedOnly)
            .map((panel) => (
              <section
                key={panel.id}
                aria-label={panel.title}
                style={{ borderTop: '1px solid #e2e8f0', maxHeight: '42%', overflow: 'auto' }}
              >
                <panel.component
                  slider={slider}
                  slideIndex={slideIndex}
                  selected={selected}
                  device={device}
                  advanced={advanced}
                  onSelect={setSelected}
                  onChange={(fn, group) => history.change(fn, group)}
                  onPlay={() => setMotion((n) => n + 1)}
                />
              </section>
            ))}
        </main>

        {/* Settings */}
        <aside
          style={{
            width: 330,
            flex: 'none',
            borderLeft: '1px solid #e2e8f0',
            overflow: 'auto',
            padding: 14,
          }}
          aria-label={t('Settings')}
        >
          {found ? (
            <>
              <div className="dst-row" style={{ marginBottom: 6 }}>
                <strong className="dst-grow">{t(TYPE_NAMES[found.layer.type])}</strong>
                <Btn small kind="ghost" onClick={() => setSelected(null)}>
                  {t('Slide settings')}
                </Btn>
              </div>
              <LayerPanel
                siteFonts={fonts.families}
                layer={found.layer}
                parent={found.parent}
                slider={slider}
                device={device}
                advanced={advanced}
                tab={tab}
                onTab={setTab}
                onChange={(fn, group) => changeLayer(found.layer.id, fn, group)}
                onStyle={<K extends keyof LayerStyle>(key: K, value: LayerStyle[K]) =>
                  changeLayer(
                    found.layer.id,
                    (l) => ({ ...l, style: setFor(l.style, device, key, value) }),
                    `st:${found.layer.id}:${device}:${key}`,
                  )
                }
                onResetStyle={(key) =>
                  device !== 'desktop' &&
                  changeLayer(found.layer.id, (l) => ({
                    ...l,
                    style: resetFor(l.style, device, key),
                  }))
                }
                onPos={(patch) =>
                  changeLayer(
                    found.layer.id,
                    (l) => ({ ...l, pos: posWith(l, patch) }),
                    `pos:${found.layer.id}:${device}:${Object.keys(patch).join()}`,
                  )
                }
                onResetPos={() =>
                  device !== 'desktop' &&
                  changeLayer(found.layer.id, (l) => ({ ...l, pos: resetFor(l.pos, device) }))
                }
                onAddToBox={(type) => {
                  const layer = defaultLayer(type);
                  layer.motion = {
                    ...layer.motion,
                    in: { ...layer.motion.in, delay: 100 * (found.layer.children.length + 1) },
                  };
                  history.change((s) => addLayer(s, slideIndex, layer, found.layer.id));
                  setSelected(layer.id);
                }}
                onSelect={setSelected}
                onPickMedia={(done) => pickMedia('image', done)}
                onPlay={() => setMotion((n) => n + 1)}
              />
            </>
          ) : (
            <>
              <div className="dst-tabs" role="tablist" aria-label={t('Settings')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={side === 'slide'}
                  onClick={() => setSide('slide')}
                >
                  {t('Slide')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={side === 'slider'}
                  onClick={() => setSide('slider')}
                >
                  {t('Slider')}
                </button>
              </div>
              {side === 'slide' && slide && (
                <SlidePanel
                  slide={slide}
                  slider={slider}
                  advanced={advanced}
                  onSlide={(fn, group) =>
                    history.change(
                      (s) => updateSlide(s, slideIndex, fn),
                      group ? `${group}:${slideIndex}` : undefined,
                    )
                  }
                  onPickMedia={pickMedia}
                />
              )}
              {side === 'slide' && !slide && <p className="dst-help">{t('Add a slide first.')}</p>}
              {side === 'slider' && (
                <SliderPanel
                  slider={slider}
                  device={device}
                  advanced={advanced}
                  alias={alias}
                  onSlider={(fn, group) => history.change(fn, group)}
                  onAlias={(value) => void saveAlias(value)}
                />
              )}
              {extensions.sliderPanels.map((panel) => (
                <div key={panel.id} className="dst-section">
                  <h3>{panel.title}</h3>
                  <panel.component
                    slider={slider}
                    device={device}
                    advanced={advanced}
                    onChange={(fn) => history.change(fn)}
                  />
                </div>
              ))}
              <p className="dst-help" style={{ marginTop: 16 }}>
                {t('Shortcuts:')} <span className="dst-kbd">Ctrl+S</span> {t('save')},{' '}
                <span className="dst-kbd">Ctrl+Z</span> {t('undo')},{' '}
                <span className="dst-kbd">Ctrl+D</span> {t('duplicate')},{' '}
                <span className="dst-kbd">Del</span> {t('delete')}.
              </p>
            </>
          )}
        </aside>
      </div>

      {media && (
        <MediaDialog
          title={
            media.kind === 'video'
              ? t('Choose a video')
              : media.multiple
                ? t('Choose pictures')
                : t('Choose a picture')
          }
          kind={media.kind}
          multiple={media.multiple}
          onClose={() => setMedia(null)}
          onChoose={(items) => {
            media.done(items);
            setMedia(null);
          }}
        />
      )}
      {preview && (
        <PreviewDialog
          slider={preview.slider}
          fonts={fonts}
          title={title}
          version={version}
          locale={locale}
          onClose={() => setPreview(null)}
        />
      )}
      {toast}
    </div>
  );
}

/**
 * The slider as visitors get it, in a frame with the real runtime: drawn into
 * the frame by React, then the runtime is added and starts it.
 */
function PreviewDialog({
  slider,
  fonts,
  title,
  version,
  locale,
  onClose,
}: {
  slider: SliderData;
  fonts: SiteFonts;
  title: string;
  version: string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [width, setWidth] = useState<'100%' | '768px' | '390px'>('100%');
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const doc = `<!doctype html><html lang="${locale.replace(/[^\w-]/g, '')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}p.note{font:14px system-ui;color:#64748b;text-align:center;margin:24px}</style></head><body><main id="root"></main><p class="note">${t('The page continues here.')}</p></body></html>`;
  const extensions = proAdmin().preview;
  useEffect(() => {
    if (!root) return;
    const timer = window.setTimeout(() => {
      const doc = root.ownerDocument;
      applyFonts(doc, fonts, 'body');
      for (const href of extensions.styles) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        doc.head.appendChild(link);
      }
      // Extensions' scripts first, in order: they run before the sliders start, as on pages.
      for (const src of [
        ...extensions.scripts,
        `/plugin-assets/diorama/${encodeURIComponent(version)}/diorama.js`,
      ]) {
        const script = doc.createElement('script');
        script.src = src;
        script.async = false;
        doc.body.appendChild(script);
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [root, version]);
  const input: RenderInput = {
    slider,
    scope: 'preview',
    uid: 'dio-preview',
    title,
    locale,
    media: NO_MEDIA,
    withBaseCss: true,
  };
  input.decorate = mergeDecorators(
    extensions.decorators.map((fn) => {
      try {
        return fn(input);
      } catch {
        return undefined;
      }
    }),
  );
  let drawn: ReactNode;
  for (const renderer of extensions.renderers) {
    try {
      drawn = renderer(input);
    } catch {
      drawn = undefined;
    }
    if (drawn !== undefined) break;
  }
  return (
    <Dialog
      title={t('Preview')}
      size="wide"
      onClose={onClose}
      footer={
        <div className="dst-row dst-grow">
          <Segmented
            label={t('Device')}
            value={width}
            options={[
              { value: '100%', label: t('Computer') },
              { value: '768px', label: t('Tablet') },
              { value: '390px', label: t('Phone') },
            ]}
            onChange={setWidth}
          />
          <div className="dst-grow" />
          <span className="dst-help">
            {t('Links do not open here. Pictures load at full size in the preview.')}
          </span>
        </div>
      }
    >
      <iframe
        title={t('Preview')}
        srcDoc={doc}
        data-testid="dio-preview"
        onLoad={(e) => setRoot(e.currentTarget.contentDocument?.getElementById('root') ?? null)}
        style={{
          display: 'block',
          width,
          height: '70vh',
          margin: '0 auto',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#fff',
        }}
      />
      {root && createPortal(drawn !== undefined ? drawn : <SliderView {...input} />, root)}
    </Dialog>
  );
}
